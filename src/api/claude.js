import Anthropic from '@anthropic-ai/sdk'
import {
  IMAGE_ANALYSIS_PROMPT,
  PROFILE_SYNTHESIS_PROMPT,
  SINGLE_QUERY_PROMPT,
  MULTI_QUERY_PROMPT,
} from './prompts.js'
import { recordTokens } from '../utils/tokenTracker.js'

const MODEL = 'claude-sonnet-4-20250514'

function getClient(apiKey) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

function parseJSON(text) {
  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(cleaned)
}

export async function analyzeImage(apiKey, imageBase64, mimeType, filename) {
  const client = getClient(apiKey)
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: IMAGE_ANALYSIS_PROMPT,
          },
        ],
      },
    ],
  })

  const result = parseJSON(response.content[0].text)
  return { ...result, source: 'uploaded_image', filename }
}

export async function synthesizeProfile(apiKey, profile) {
  const client = getClient(apiKey)
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: PROFILE_SYNTHESIS_PROMPT(profile),
      },
    ],
  })

  return parseJSON(response.content[0].text)
}

async function consumeStream(stream, onChunk) {
  for await (const event of stream) {
    if (event.type === 'message_start') {
      const usage = event.message?.usage
      if (usage) recordTokens((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0))
    }
    if (event.type === 'message_delta' && event.usage) {
      recordTokens(event.usage.output_tokens ?? 0)
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      onChunk(event.delta.text)
    }
  }
}

export async function streamSingleQuery(apiKey, profile, query, onChunk, { maxRetries = 2 } = {}) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries })
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: SINGLE_QUERY_PROMPT(profile, query) }],
  })
  await consumeStream(stream, onChunk)
}

export async function streamMultiQuery(apiKey, profiles, strategy, query, onChunk, weights = {}) {
  const client = getClient(apiKey)
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: MULTI_QUERY_PROMPT(profiles, strategy, query, weights) }],
  })
  await consumeStream(stream, onChunk)
}
