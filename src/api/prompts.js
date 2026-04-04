export const IMAGE_ANALYSIS_PROMPT = `Analyze this image as a data point in someone's taste profile. Extract the following as JSON:

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

export const PROFILE_SYNTHESIS_PROMPT = (profile) => `Here is a user's accumulated visual taste data:

IMAGES:
${JSON.stringify(profile.visual?.analyses ?? [], null, 2)}

TEXT PREFERENCES:
${JSON.stringify(profile.text_preferences ?? {}, null, 2)}

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

export const SINGLE_QUERY_PROMPT = (profile, query) => `You have deep knowledge of the following person's taste:

${profile.fingerprint ?? '(no fingerprint yet — use the raw data below)'}

Full taste data:
${JSON.stringify(profile, null, 2)}

The user asks: ${query}

Answer drawing on everything you know about this person's preferences. Be specific — recommend actual things (real restaurants, real albums, real films, real places). Don't hedge. If their profile suggests they'd love something, say so with confidence.`

export const MULTI_QUERY_PROMPT = (profiles, strategy, query, weights) => `You have taste profiles for multiple people:

${profiles.map((p) => `## ${p.handle}\n${p.fingerprint ?? JSON.stringify(p, null, 2)}`).join('\n\n')}

Blend strategy: ${strategy}
${strategy === 'weighted' ? `Weights: ${JSON.stringify(weights)}` : ''}

Strategies:
- "intersection": Find things ALL of them would enjoy. Look for overlapping aesthetics, shared moods, compatible preferences.
- "union": Find things ANY of them would enjoy. Cast a wide net across all their preferences.
- "weighted": Weight each person's preferences by the provided percentages.
- "contrast": Highlight where these people's tastes diverge. What would person A love that person B would hate, and vice versa?

Query: ${query}

Be specific. Recommend real things. Explain why each recommendation fits the blend strategy.`
