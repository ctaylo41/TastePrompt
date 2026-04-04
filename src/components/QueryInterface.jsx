import { useState, useRef, useEffect } from 'react'
import { streamSingleQuery, streamMultiQuery } from '../api/claude.js'

const STRATEGIES = ['intersection', 'union', 'contrast']

const SUGGESTED_SINGLE = [
  "i'm starting a coffee brand and need help with the packaging, what colors, fonts, label style would feel right based on this taste?",
  "going to tokyo for 3 days, plan me an itinerary that actually matches this vibe. cafes, shops, neighborhoods, not tourist stuff",
  "just got a one bedroom in mile end and its empty, what furniture and lighting should i get that fits this aesthetic?",
  "shooting instagram content for my clothing brand next week in london, give me a shot list. lighting, locations, styling, all of it",
  "my friend's birthday is coming up and i never know what to get her, based on her profile what are some gifts under 100?",
]

const SUGGESTED_MULTI = [
  "i'm starting a coffee brand and need help with the packaging, what colors, fonts, label style would feel right based on both these taste profiles?",
  "we're going to tokyo for 3 days, plan us an itinerary that actually matches both our vibes. cafes, shops, neighborhoods, not tourist stuff",
  "we just got a place together and its empty, what furniture and lighting should we get that fits both our aesthetics?",
  "shooting content for a clothing brand next week in london, give me a shot list that works for both these aesthetics. lighting, locations, styling, all of it",
  "we need to get each other gifts under 100, what should each person get the other based on their profile?",
]

const PRED_LABELS = { travel: 'Travel', restaurant: 'Dining', gift: 'Gift', architecture: 'Space' }

// Module-level set — persists across StrictMode double-invocations
const recsFetched = new Set()

export default function QueryInterface({ apiKey, omdbKey, profiles }) {
  const handles = Object.keys(profiles)

  const [mode, setMode] = useState('single')
  const [activeHandle, setActiveHandle] = useState(handles[0] ?? '')
  const [selectedHandles, setSelectedHandles] = useState([])
  const [strategy, setStrategy] = useState('intersection')
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [autoPreview, setAutoPreview] = useState('')
  const [autoStreaming, setAutoStreaming] = useState(false)
  const [recs, setRecs] = useState([]) // [{label, title, subtitle, reason, image}]
  const [recsStreaming, setRecsStreaming] = useState(false)

  const responseRef = useRef(null)
  const prevBlendKey = useRef('')
  const recsCancelled = useRef(false)

  const targetProfile = profiles[activeHandle]
  const predictions = targetProfile?.cross_domain_predictions ?? {}

  // Auto-generate recommendations when profile changes
  useEffect(() => {
    if (mode !== 'single' || !targetProfile || recsFetched.has(activeHandle)) return
    recsFetched.add(activeHandle)
    recsCancelled.current = true // cancel any in-flight request
    setRecs([])
    setRecsStreaming(false)

    recsCancelled.current = false
    ;(async () => {
    setRecsStreaming(true)

    const prompt = `Based on this taste profile give exactly 3 recommendations in this exact format, nothing else:

Movie: [Title] ([Year])
Reason: [one sentence why]

Album: [Album Title] by [Artist]
Reason: [one sentence why]

Book: [Title] by [Author]
Reason: [one sentence why]

Real titles only. Be specific.`

    let buffer = ''
    await new Promise((r) => setTimeout(r, 4000))
    if (recsCancelled.current) return
    try {
      await streamSingleQuery(apiKey, targetProfile, prompt, (chunk) => { buffer += chunk }, { maxRetries: 0 })
    } catch {
      // rate limit — skip silently
    } finally {
      if (!recsCancelled.current) {
        setRecsStreaming(false)
        if (buffer) {
          const parsed = parseRecs(buffer)
          setRecs(parsed.map((r) => ({ ...r, image: null, imageLoading: true })))
          const withImages = await Promise.all(parsed.map((r) => fetchArtwork(r, omdbKey)))
          if (!recsCancelled.current) setRecs(withImages)
        }
      }
    }
    })()
  }, [activeHandle])

  // Auto blend preview when 2+ profiles selected
  useEffect(() => {
    if (mode !== 'multi' || selectedHandles.length < 2) {
      setAutoPreview('')
      return
    }
    const key = selectedHandles.slice().sort().join('+') + strategy
    if (key === prevBlendKey.current) return
    prevBlendKey.current = key

    const selected = selectedHandles.map((h) => profiles[h]).filter(Boolean)
    setAutoPreview('')
    setAutoStreaming(true)
    setResponse('')

    const prompt = `In 2-3 sentences describe what these people's tastes have in common and what that overlap feels like. Then name one specific thing — a place, film, restaurant, or object — that sits perfectly at their intersection.`
    streamMultiQuery(apiKey, selected, 'intersection', prompt, (chunk) => {
      setAutoPreview((p) => p + chunk)
    }).finally(() => setAutoStreaming(false))
  }, [selectedHandles, strategy, mode])

  useEffect(() => {
    if (responseRef.current) responseRef.current.scrollTop = responseRef.current.scrollHeight
  }, [response])

  function switchMode(m) {
    setMode(m)
    setResponse('')
    setAutoPreview('')
    setQuery('')
    prevBlendKey.current = ''
  }

  function toggleHandle(h) {
    setSelectedHandles((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    )
  }

  async function handleQuery(q) {
    const text = q ?? query
    if (!text.trim() || streaming) return
    setStreaming(true)
    setError('')
    setResponse('')
    try {
      const onChunk = (chunk) => setResponse((prev) => prev + chunk)
      if (mode === 'single') {
        if (!targetProfile) throw new Error('No profile selected')
        await streamSingleQuery(apiKey, targetProfile, text, onChunk)
      } else {
        const selected = selectedHandles.map((h) => profiles[h]).filter(Boolean)
        if (selected.length < 2) throw new Error('Select at least 2 profiles')
        await streamMultiQuery(apiKey, selected, strategy, text, onChunk)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setStreaming(false)
    }
  }

  const suggestions = mode === 'single' ? SUGGESTED_SINGLE : SUGGESTED_MULTI
  const hasPredictions = Object.keys(predictions).length > 0

  return (
    <div style={styles.layout}>

      {/* ── Left column: controls + query ── */}
      <div style={styles.left}>

        {/* Profile select */}
        <div style={styles.block}>
          <label style={styles.fieldLabel}>Profile</label>
          {mode === 'single' ? (
            <ProfileSearch
              handles={handles}
              profiles={profiles}
              value={activeHandle}
              onSelect={(h) => { setActiveHandle(h); setResponse('') }}
            />
          ) : (
            <MultiProfileSearch
              handles={handles}
              profiles={profiles}
              selected={selectedHandles}
              onToggle={toggleHandle}
            />
          )}
        </div>

        {/* Mode toggle */}
        <div style={styles.block}>
          <label style={styles.fieldLabel}>Mode</label>
          <div style={styles.modeToggle}>
            {['single', 'multi'].map((m) => (
              <button
                key={m}
                style={{ ...styles.modeBtn, ...(mode === m ? styles.modeBtnActive : {}) }}
                onClick={() => switchMode(m)}
              >
                {m === 'single' ? 'Single' : 'Mix'}
              </button>
            ))}
          </div>
        </div>

        {/* Blend strategy (multi only) */}
        {mode === 'multi' && (
          <div style={styles.block}>
            <label style={styles.fieldLabel}>Blend</label>
            <div style={styles.stratRow}>
              {STRATEGIES.map((s) => (
                <button
                  key={s}
                  style={{ ...styles.stratBtn, ...(strategy === s ? styles.stratBtnActive : {}) }}
                  onClick={() => setStrategy(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Suggested queries */}
        {!response && !streaming && (
          <div style={styles.block}>
            <label style={styles.fieldLabel}>Suggestions</label>
            <div style={styles.suggestions}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  style={styles.suggestion}
                  onClick={() => { setQuery(s); handleQuery(s) }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Query input */}
        <div style={styles.queryBox}>
          <textarea
            style={styles.textarea}
            placeholder="Ask anything…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleQuery())}
            rows={3}
          />
          <button style={styles.sendBtn} onClick={() => handleQuery()} disabled={streaming}>
            {streaming ? '…' : 'Ask'}
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Response */}
        {(response || streaming) && (
          <div style={styles.response} ref={responseRef}>
            <FormattedResponse text={response} streaming={streaming} />
          </div>
        )}
      </div>

      {/* ── Right column: recommendations ── */}
      <div style={styles.right}>

        {/* Single: profile info + live recs */}
        {mode === 'single' && targetProfile && (
          <>
            <div style={styles.sideBlock}>
              <div style={styles.profileName}>{targetProfile.handle}</div>
              <div style={styles.imageCount}>{targetProfile.visual?.analyses?.length ?? 0} images analyzed</div>
              {targetProfile.keywords?.length > 0 && (
                <div style={styles.keywords}>
                  {targetProfile.keywords.map((k) => (
                    <span key={k} style={styles.keyword}>{k}</span>
                  ))}
                </div>
              )}
            </div>

            {(recs.length > 0 || recsStreaming) && (
              <div style={styles.sideBlock}>
                <div style={styles.sideLabel}>Recommendations</div>
                {recsStreaming
                  ? <span style={styles.cursor}>▍</span>
                  : <RecCards recs={recs} />
                }
              </div>
            )}
          </>
        )}

        {/* Multi: auto blend preview */}
        {mode === 'multi' && (
          <div style={styles.sideBlock}>
            <div style={styles.sideLabel}>Overlap</div>
            {selectedHandles.length < 2 ? (
              <p style={styles.hint}>Select at least 2 profiles to see their overlap.</p>
            ) : (
              <p style={styles.autoText}>
                {autoPreview || (autoStreaming ? '' : '')}
                {autoStreaming && <span style={styles.cursor}>▍</span>}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ProfileSearch({ handles, profiles, value, onSelect }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const filtered = handles.filter((h) =>
    h.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={styles.searchBox} onClick={() => { setOpen(true) }}>
        <span style={styles.searchIcon}>⌕</span>
        {!open && value && !search ? (
          <span style={styles.searchInput}>{profiles[value]?.handle}</span>
        ) : (
          <input
            autoFocus={open}
            style={styles.searchInput}
            placeholder="Search profiles…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
          />
        )}
      </div>
      {open && filtered.length > 0 && (
        <div style={styles.dropdown}>
          {filtered.map((h) => (
            <button
              key={h}
              style={{ ...styles.dropdownItem, ...(h === value ? styles.dropdownItemActive : {}) }}
              onMouseDown={() => { onSelect(h); setSearch(''); setOpen(false) }}
            >
              <span>{profiles[h].handle}</span>
              <span style={styles.dropdownMeta}>{profiles[h].visual?.analyses?.length ?? 0} images</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MultiProfileSearch({ handles, profiles, selected, onToggle }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(true)
  const ref = useRef(null)
  const inputRef = useRef(null)

  const filtered = handles.filter((h) =>
    h.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      <div style={styles.searchBox} onClick={() => { setOpen(true); inputRef.current?.focus() }}>
        <span style={styles.searchIcon}>⌕</span>
        <input
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Search profiles to mix…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (
        <div style={styles.dropdown}>
          {filtered.map((h) => (
            <button
              key={h}
              style={{ ...styles.dropdownItem, ...(selected.includes(h) ? styles.dropdownItemActive : {}) }}
              onMouseDown={() => { onToggle(h); setSearch('') }}
            >
              <span>{profiles[h].handle}</span>
              <span style={styles.dropdownMeta}>
                {selected.includes(h) ? '✓' : `${profiles[h].visual?.analyses?.length ?? 0} images`}
              </span>
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div style={styles.selectedChips}>
          {selected.map((h) => (
            <span key={h} style={styles.selectedChip}>
              {profiles[h].handle}
              <button style={styles.chipX} onClick={() => onToggle(h)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function parseRecs(text) {
  const results = []
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  let current = null
  for (const line of lines) {
    const movieMatch = line.match(/^Movie:\s*(.+)/i)
    const albumMatch = line.match(/^Album:\s*(.+)/i)
    const bookMatch = line.match(/^Book:\s*(.+)/i)
    const reasonMatch = line.match(/^Reason:\s*(.+)/i)
    if (movieMatch) { current = { label: 'Movie', title: movieMatch[1].trim(), reason: '', type: 'movie' }; results.push(current) }
    else if (albumMatch) { current = { label: 'Album', title: albumMatch[1].trim(), reason: '', type: 'album' }; results.push(current) }
    else if (bookMatch) { current = { label: 'Book', title: bookMatch[1].trim(), reason: '', type: 'book' }; results.push(current) }
    else if (reasonMatch && current) { current.reason = reasonMatch[1].trim() }
  }
  return results
}

async function fetchArtwork(rec, omdbKey) {
  try {
    if (rec.type === 'movie') {
      if (!omdbKey) return { ...rec, image: null, imageLoading: false }
      // Strip year from title if present e.g. "The Godfather (1972)"
      const titleOnly = rec.title.replace(/\s*\(\d{4}\)$/, '').trim()
      const res = await fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(titleOnly)}&apikey=${omdbKey}`)
      const data = await res.json()
      const image = data.Poster && data.Poster !== 'N/A' ? data.Poster : null
      return { ...rec, image, imageLoading: false }
    }
    if (rec.type === 'album') {
      const query = rec.title // already "Album by Artist"
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=album&limit=1`)
      const data = await res.json()
      const item = data.results?.[0]
      const image = item?.artworkUrl100?.replace('100x100bb', '600x600bb') ?? null
      return { ...rec, image, imageLoading: false }
    }
    if (rec.type === 'book') {
      const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(rec.title)}&limit=1&fields=cover_i`)
      const data = await res.json()
      const coverId = data.docs?.[0]?.cover_i
      const image = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null
      return { ...rec, image, imageLoading: false }
    }
  } catch {}
  return { ...rec, image: null, imageLoading: false }
}

function RecCards({ recs }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {recs.map((rec, i) => (
        <div key={i} style={styles.recCard}>
          {rec.image ? (
            <img src={rec.image} alt={rec.title} style={styles.recImage} />
          ) : rec.imageLoading ? (
            <div style={styles.recImagePlaceholder} />
          ) : (
            <div style={{ ...styles.recImagePlaceholder, background: 'var(--bg)' }} />
          )}
          <div style={styles.recInfo}>
            <span style={styles.recLabel}>{rec.label}</span>
            <span style={styles.recTitle}>{rec.title}</span>
            <span style={styles.recReason}>{rec.reason}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function FormattedResponse({ text, streaming }) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean)
  return (
    <div style={styles.responseBody}>
      {paragraphs.map((para, i) => {
        const isHeader = /^\*\*.+\*\*$/.test(para.trim()) || /^\d+\.\s/.test(para.trim())
        const cleaned = para.replace(/\*\*/g, '')
        if (para.startsWith('- ') || para.includes('\n- ')) {
          const items = para.split('\n').filter((l) => l.trim())
          return (
            <ul key={i} style={styles.list}>
              {items.map((item, j) => (
                <li key={j} style={styles.listItem}>{item.replace(/^-\s*/, '').replace(/\*\*/g, '')}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} style={{ ...styles.para, ...(isHeader ? styles.paraHeader : {}) }}>
            {cleaned}
          </p>
        )
      })}
      {streaming && <span style={styles.cursor}>▍</span>}
    </div>
  )
}

const mono = { fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace" }

const styles = {
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 280px',
    gap: 48,
    alignItems: 'start',
  },
  left: { display: 'flex', flexDirection: 'column', gap: 32 },
  right: { display: 'flex', flexDirection: 'column', gap: 24, position: 'sticky', top: 48 },

  block: { display: 'flex', flexDirection: 'column', gap: 12 },
  fieldLabel: { ...mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)' },

  searchBox: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'transparent', borderBottom: '1px solid var(--border)',
    padding: '10px 0', cursor: 'text', position: 'relative',
  },
  searchIcon: { color: 'var(--muted)', fontSize: 16, lineHeight: 1, flexShrink: 0 },
  searchInput: {
    background: 'transparent', border: 'none', color: 'var(--text)',
    fontSize: 15, outline: 'none', flex: 1, minWidth: 0, letterSpacing: '0.01em',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    zIndex: 100, boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
  },
  dropdownItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', background: 'transparent', border: 'none', color: 'var(--text)',
    padding: '12px 16px', fontSize: 14, cursor: 'pointer', textAlign: 'left',
    borderBottom: '1px solid var(--border)',
  },
  dropdownItemActive: { color: 'var(--accent-light)', background: 'var(--surface)' },
  dropdownMeta: { ...mono, fontSize: 11, color: 'var(--muted)', letterSpacing: '0.05em' },
  selectedChips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  selectedChip: {
    background: 'transparent', color: 'var(--accent-light)', border: '1px solid var(--accent-dim)',
    padding: '3px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
  },
  chipX: {
    background: 'none', border: 'none', color: 'var(--muted)',
    cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
  },

  modeToggle: { display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', width: 'fit-content' },
  modeBtn: {
    background: 'transparent', border: 'none', color: 'var(--muted)',
    padding: '6px 20px 8px', fontSize: 13, cursor: 'pointer', letterSpacing: '0.03em',
  },
  modeBtnActive: { color: 'var(--text)', borderBottom: '1px solid var(--accent-light)', marginBottom: -1 },

  stratRow: { display: 'flex', gap: 4 },
  stratBtn: {
    ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
    padding: '5px 12px', fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'lowercase',
  },
  stratBtnActive: { borderColor: 'var(--accent-dim)', color: 'var(--accent-light)', background: 'var(--surface2)' },

  suggestions: { display: 'flex', flexDirection: 'column', gap: 1 },
  suggestion: {
    background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
    color: 'var(--muted)', padding: '11px 0', fontSize: 13, cursor: 'pointer',
    textAlign: 'left', lineHeight: 1.5, letterSpacing: '0.01em',
    transition: 'color 0.15s',
  },

  queryBox: { display: 'flex', gap: 12, alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: 0 },
  textarea: {
    flex: 1, background: 'transparent', border: 'none',
    color: 'var(--text)', padding: '12px 0', fontSize: 15,
    resize: 'none', lineHeight: 1.7, outline: 'none', letterSpacing: '0.01em',
  },
  sendBtn: {
    ...mono, background: 'transparent', color: 'var(--accent-light)',
    border: '1px solid var(--accent-dim)', padding: '10px 20px',
    fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
    cursor: 'pointer', flexShrink: 0, marginBottom: 12,
  },

  response: {
    borderTop: '1px solid var(--border)',
    paddingTop: 28, maxHeight: 560, overflowY: 'auto',
  },
  responseBody: { display: 'flex', flexDirection: 'column', gap: 18 },
  para: { fontSize: 15, lineHeight: 1.9, color: 'var(--text)', letterSpacing: '0.01em' },
  paraHeader: { ...mono, fontSize: 11, color: 'var(--accent-light)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 8 },
  list: { paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  listItem: { fontSize: 15, lineHeight: 1.8, color: 'var(--text)' },

  // Sidebar
  sideBlock: {
    borderTop: '1px solid var(--border)',
    paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 14,
  },
  sideLabel: { ...mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)' },
  profileName: { fontSize: 20, color: 'var(--text)', letterSpacing: '-0.02em', fontWeight: 400 },
  imageCount: { ...mono, fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em' },
  keywords: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  keyword: {
    background: 'transparent', border: '1px solid var(--border)',
    padding: '2px 8px', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.03em',
  },

  recCard: { display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 14, borderBottom: '1px solid var(--border)' },
  recImage: { width: 56, height: 56, objectFit: 'cover', flexShrink: 0 },
  recImagePlaceholder: { width: 56, height: 56, background: 'var(--surface2)', flexShrink: 0 },
  recInfo: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 },
  recLabel: { ...mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)' },
  recTitle: { fontSize: 13, color: 'var(--text)', lineHeight: 1.4, letterSpacing: '0.01em' },
  recReason: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 },

  autoText: { fontSize: 14, lineHeight: 1.9, color: 'var(--muted)', fontStyle: 'italic', letterSpacing: '0.01em' },
  hint: { ...mono, fontSize: 11, color: 'var(--muted)', letterSpacing: '0.05em' },

  cursor: { display: 'inline-block', color: 'var(--accent)', animation: 'blink 1s step-end infinite' },
  error: { ...mono, fontSize: 12, color: '#c06060', borderLeft: '2px solid #c06060', paddingLeft: 12, letterSpacing: '0.03em' },
  warn: { fontSize: 13, color: 'var(--muted)' },
}
