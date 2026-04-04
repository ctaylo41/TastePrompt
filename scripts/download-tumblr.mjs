#!/usr/bin/env node
/**
 * Download all photo posts from a Tumblr blog.
 *
 * Usage:
 *   node scripts/download-tumblr.mjs <blogname> <api_key> [output_dir] [--max N]
 *
 * Get a free API key at: https://www.tumblr.com/oauth/apps
 * (Register an app, copy the "OAuth Consumer Key")
 *
 * Examples:
 *   node scripts/download-tumblr.mjs aesthetic-blog sk-abc123
 *   node scripts/download-tumblr.mjs aesthetic-blog sk-abc123 ./images/mine --max 100
 */

import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { URL } from 'url'

const args = process.argv.slice(2)
const maxFlagIdx = args.indexOf('--max')
const maxImages = maxFlagIdx !== -1 ? parseInt(args[maxFlagIdx + 1], 10) : Infinity
if (maxFlagIdx !== -1) args.splice(maxFlagIdx, 2)

const [blogname, apiKey, outDir] = args

if (!blogname || !apiKey) {
  console.error('Usage: node scripts/download-tumblr.mjs <blogname> <api_key> [output_dir] [--max N]')
  process.exit(1)
}

const outputDir = outDir ?? `./images/${blogname}`
fs.mkdirSync(outputDir, { recursive: true })

const BASE = 'https://api.tumblr.com/v2'
const PAGE_SIZE = 20
const CONCURRENCY = 8 // parallel downloads

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}\n${data.slice(0, 200)}`)) }
      })
    }).on('error', reject)
  })
}

async function downloadFile(imageUrl, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath)
    function doGet(url) {
      const mod = url.startsWith('https') ? https : http
      mod.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doGet(res.headers.location)
        }
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
      }).on('error', (err) => {
        fs.unlink(filepath, () => {})
        reject(err)
      })
    }
    doGet(imageUrl)
  })
}

async function pool(tasks, concurrency) {
  const results = []
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

function getBestPhotoUrl(photo) {
  const sizes = photo.alt_sizes ?? []
  return sizes[0]?.url ?? photo.original_size?.url
}

async function run() {
  let offset = 0
  let totalDownloaded = 0
  let totalSkipped = 0
  let totalFailed = 0
  let done = false

  const limitStr = isFinite(maxImages) ? ` (max ${maxImages})` : ''
  console.log(`Fetching photos from ${blogname}.tumblr.com → ${outputDir}${limitStr}\n`)

  while (!done) {
    const url = `${BASE}/blog/${blogname}/posts/photo?api_key=${apiKey}&limit=${PAGE_SIZE}&offset=${offset}`
    let json
    try {
      json = await fetchJSON(url)
    } catch (e) {
      console.error('API error:', e.message)
      break
    }

    if (json.meta?.status !== 200) {
      console.error(`API error ${json.meta?.status}: ${json.meta?.msg}`)
      break
    }

    const posts = json.response?.posts ?? []
    if (posts.length === 0) break

    // Collect all image URLs from this page
    const images = []
    for (const post of posts) {
      for (let i = 0; i < (post.photos ?? []).length; i++) {
        const imageUrl = getBestPhotoUrl(post.photos[i])
        if (!imageUrl) continue
        const ext = path.extname(new URL(imageUrl).pathname) || '.jpg'
        const filename = `${post.id}${post.photos.length > 1 ? `_${i}` : ''}${ext}`
        images.push({ imageUrl, filename, filepath: path.join(outputDir, filename) })

        if (totalDownloaded + images.length >= maxImages) {
          done = true
          break
        }
      }
      if (done) break
    }

    // Download page concurrently
    const tasks = images.map(({ imageUrl, filename, filepath }) => async () => {
      if (fs.existsSync(filepath)) {
        totalSkipped++
        process.stdout.write(`  skip  ${filename}\n`)
        return
      }
      try {
        await downloadFile(imageUrl, filepath)
        totalDownloaded++
        process.stdout.write(`  ✓     ${filename}\n`)
      } catch (e) {
        totalFailed++
        process.stdout.write(`  ✗     ${filename} (${e.message})\n`)
      }
    })

    await pool(tasks, CONCURRENCY)

    const totalPosts = json.response?.total_posts ?? 0
    offset += PAGE_SIZE
    process.stdout.write(`\n[offset ${offset}/${totalPosts} posts · ${totalDownloaded} downloaded · ${totalSkipped} skipped · ${totalFailed} failed]\n\n`)

    if (offset >= totalPosts) break
  }

  console.log(`Done. ${totalDownloaded} new images saved to ${outputDir}`)
}

run()
