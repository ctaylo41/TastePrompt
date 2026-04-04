# tastePrompt

**Make taste computable. Make it shareable.**

tastePrompt uses Claude's vision API to extract structured aesthetic signal from curated image collections — Tumblr archives, mood boards, saved photography — and synthesizes them into a persistent taste fingerprint that can be queried, compared, and blended across people.

---

## The idea

Taste is one of the most personal things about a person and one of the hardest to articulate. tastePrompt turns a curated image collection into a structured aesthetic profile: palettes, moods, influences, textures, composition sensibilities — all extracted by Claude, accumulated into a coherent fingerprint, and made queryable.

The result is a new kind of context object. Not a chatbot. Not a recommendation engine. A *taste fingerprint* — a structured representation of someone's aesthetic that Claude can reason about, blend with others, and apply across domains.

---

## What it does

**Single profile mode**
- Load a profile built from hundreds of analyzed images
- Claude knows this person's aesthetic at a granular level — not just "they like minimalism" but *which kind*, *what references*, *what emotional register*
- Ask anything: plan a trip, design a space, recommend a film, write a shot list for a campaign

**Mix mode**
- Select two profiles
- Claude finds the overlap, the tensions, the shared emotional register
- Ask questions that only make sense with two people: shared travel, gift ideas, a space they'd both inhabit

**Auto recommendations**
- On profile load: a film, album, and book with cover art pulled automatically
- On profile mix: an overlap analysis that streams in immediately

---

## How profiles are built

1. Download a Tumblr (or any image collection) with `gallery-dl`
2. Run the batch analysis script — Claude analyzes each image, extracts structured JSON (mood, palette, lighting, texture, influences, aesthetic signal)
3. A synthesis pass generates the fingerprint: 3-5 sentences that capture the through-lines, contradictions, and emotional register across the whole collection
4. Drop the JSON in `/profiles/` — the app loads it automatically

---

## Tech

- **Frontend:** React + Vite
- **AI:** Anthropic Messages API (`claude-sonnet-4-20250514`) with vision
- **Image art:** OMDB API (movie posters), iTunes Search API (album art), Open Library (book covers)
- **Storage:** Static JSON profiles bundled at build time
- **No backend** — all API calls client-side

---

## Setup

```bash
npm install
```

Create a `.env` file:
```
VITE_OMDB_KEY=your_omdb_key
```

Get a free OMDB key at [omdbapi.com](https://omdbapi.com).

```bash
npm run dev
```

Enter your Anthropic API key at the login screen.

---

## Building a profile

**1. Download images**
```bash
gallery-dl --range 1-200 -o "extractor.tumblr.api-key=YOUR_KEY" https://www.tumblr.com/blogname
```

**2. Analyze with Claude**
```bash
node scripts/analyze-images.mjs ./images/blogname YOUR_ANTHROPIC_KEY profilename
```

The script saves progress after every image and resumes if interrupted. Output goes to `./profiles/profilename.json`.

**3. Drop in `/profiles/`** — the app picks it up automatically on next build/reload.

---

## Built for the Anthropic Creative Flourishing hackathon
