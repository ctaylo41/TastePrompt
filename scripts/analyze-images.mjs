#!/usr/bin/env node
/**
 * Batch analyze a folder of images through Claude and output a taste profile JSON.
 *
 * Usage:
 *   node scripts/analyze-images.mjs <images_dir> <api_key> [handle] [output_file]
 *
 * Example:
 *   node scripts/analyze-images.mjs ./images/wordsforyoungmen sk-ant-... wordsforyoungmen ./profiles/wordsforyoungmen.json
 */

import fs from 'fs'
import path from 'path'
import https from 'https'
import sharp from 'sharp'

const [, , imagesDir, apiKey, handle, outFile] = process.argv

if (!imagesDir || !apiKey) {
  console.error('Usage: node scripts/analyze-images.mjs <images_dir> <api_key> [handle] [output_file]')
  process.exit(1)
}

const profileHandle = handle ?? path.basename(imagesDir)
const outputFile = outFile ?? `./profiles/${profileHandle}.json`
fs.mkdirSync(path.dirname(outputFile), { recursive: true })

const MODEL = 'claude-sonnet-4-20250514'
const CONCURRENCY = 1 // sequential to stay under free tier rate limits
const DELAY_MS = 8000 // 8s between calls to stay under 30k tokens/min
const RETRY_DELAY_MS = 20000 // wait 20s on rate limit error before retrying
const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

const IMAGE_ANALYSIS_PROMPT = `Analyze this image as a data point in someone's taste profile. Extract the following as JSON:

{
  "palette": ["3-5 hex colors that dominate the image"],
  "mood": "2-4 word mood description",
  "composition": "brief description of framing, balance, perspective",
  "lighting": "quality, direction, warmth of light",
  "texture": "surface quality, grain, smoothness",
  "influences": ["artistic or cultural references this evokes, if any"],
  "subject_matter": "what the image depicts",
  "tags": ["5-8 descriptive tags"],
  "aesthetic_signal": "One sentence: what does choosing this image reveal about someone's taste?"
}

Be specific and observational. Do not be generic. Ground every field in what you actually see.
Respond only in JSON, no preamble or markdown fences.`

const SYNTHESIS_PROMPT = (analyses) => `Here is a collection of ${analyses.length} images from someone's curated taste archive:

${JSON.stringify(analyses, null, 2)}

Synthesize this into a unified taste fingerprint. Write 3-5 sentences that capture:
- The core aesthetic thread connecting their image choices
- Any interesting tensions or contradictions
- The emotional register they're drawn to
- What kind of person this profile suggests (without being reductive)

Then provide:
{
  "fingerprint": "the 3-5 sentence synthesis",
  "keywords": ["10-15 words that capture this taste"],
  "cross_domain_predictions": {
    "travel": "where they'd love to visit",
    "restaurant": "what kind of dining experience they'd seek",
    "gift": "what kind of object they'd treasure",
    "architecture": "what spaces they'd feel at home in"
  }
}

Respond only in JSON, no preamble or markdown fences.`

function claudeRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) reject(new Error(json.error.message))
          else resolve(json)
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`))
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function parseJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(cleaned)
}

function getMimeType(ext) {
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] ?? 'image/jpeg'
}

async function prepareImage(filepath) {
  const MAX_BYTES = 4.5 * 1024 * 1024
  const MAX_PX = 1568

  const buffer = await sharp(fs.readFileSync(filepath))
    .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  // If conversion made it larger somehow, warn but still use it
  if (buffer.length > MAX_BYTES) {
    process.stdout.write(`  [warn] ${path.basename(filepath)} still ${(buffer.length / 1024 / 1024).toFixed(1)}MB after resize\n`)
  }

  return { base64: buffer.toString('base64'), mimeType: 'image/jpeg' }
}

async function analyzeImage(filepath) {
  const { base64, mimeType } = await prepareImage(filepath)

  const response = await claudeRequest({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: IMAGE_ANALYSIS_PROMPT },
      ],
    }],
  })

  const result = parseJSON(response.content[0].text)
  return { ...result, source: 'uploaded_image', filename: path.basename(filepath) }
}

async function pool(tasks, concurrency) {
  const results = new Array(tasks.length)
  let i = 0
  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      results[idx] = await tasks[idx]()
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

async function run() {
  // Load existing progress if interrupted
  let existing = { visual: { analyses: [] }, fingerprint: '', keywords: [], cross_domain_predictions: {} }
  if (fs.existsSync(outputFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(outputFile, 'utf8'))
      console.log(`Resuming — ${existing.visual.analyses.length} already analyzed\n`)
    } catch {}
  }

  const doneFiles = new Set(existing.visual.analyses.map((a) => a.filename))

  const allFiles = fs.readdirSync(imagesDir)
    .filter((f) => SUPPORTED.has(path.extname(f).toLowerCase()))
    .sort()

  const pending = allFiles.filter((f) => !doneFiles.has(f))
  console.log(`${allFiles.length} images total · ${doneFiles.size} done · ${pending.length} to analyze\n`)

  if (pending.length === 0) {
    console.log('All images already analyzed — running synthesis...')
  } else {
    let done = 0
    const analyses = [...existing.visual.analyses]

    const tasks = pending.map((filename) => async () => {
      const filepath = path.join(imagesDir, filename)
      let result = null
      let attempts = 0
      while (!result && attempts < 3) {
        try {
          result = await analyzeImage(filepath)
        } catch (e) {
          attempts++
          const isRateLimit = e.message.includes('rate limit') || e.message.includes('529')
          if (isRateLimit && attempts < 3) {
            process.stdout.write(`  [rate limit] waiting ${RETRY_DELAY_MS / 1000}s before retry…\n`)
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
          } else {
            done++
            process.stdout.write(`  [${done}/${pending.length}] ✗ ${filename} (${e.message})\n`)
            break
          }
        }
      }
      if (result) {
        analyses.push(result)
        done++
        process.stdout.write(`  [${done}/${pending.length}] ✓ ${filename} — ${result.mood}\n`)
        const partial = buildProfile(analyses, existing)
        fs.writeFileSync(outputFile, JSON.stringify(partial, null, 2))
        await new Promise((r) => setTimeout(r, DELAY_MS))
      }
    })

    await pool(tasks, CONCURRENCY)
    existing.visual.analyses = analyses
  }

  // Synthesis
  console.log('\nGenerating fingerprint...')
  try {
    const response = await claudeRequest({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: SYNTHESIS_PROMPT(existing.visual.analyses) }],
    })
    const synthesis = parseJSON(response.content[0].text)
    Object.assign(existing, synthesis)
    console.log('\nFingerprint:\n' + synthesis.fingerprint)
  } catch (e) {
    console.error('Synthesis failed:', e.message)
  }

  const final = buildProfile(existing.visual.analyses, existing)
  fs.writeFileSync(outputFile, JSON.stringify(final, null, 2))
  console.log(`\nProfile saved to ${outputFile}`)
}

function buildProfile(analyses, existing) {
  return {
    handle: profileHandle,
    created_at: existing.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    visual: { analyses },
    text_preferences: existing.text_preferences ?? {
      food: { values: [], notes: '' },
      fashion: { values: [], notes: '' },
      books: { values: [], notes: '' },
      film: { values: [], notes: '' },
      spaces: { values: [], notes: '' },
    },
    fingerprint: existing.fingerprint ?? '',
    keywords: existing.keywords ?? [],
    cross_domain_predictions: existing.cross_domain_predictions ?? {},
  }
}

run()
