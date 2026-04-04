import { useState, useRef, useEffect } from 'react'
import { streamSingleQuery, streamMultiQuery } from '../api/claude.js'

const STRATEGIES = ['intersection', 'union', 'contrast', 'weighted']

const SUGGESTED_QUERIES = [
  'Plan my ideal Saturday from morning to night',
  'What city in the world should I live in?',
  'What would I put on my walls?',
  'Recommend me 5 films I would love',
  'What kind of person does this taste profile suggest?',
  'Design my ideal living space',
  'What restaurant in NYC fits this taste exactly?',
  'What should I read next?',
]

const MULTI_SUGGESTED = [
  'Plan a dinner both of us would love',
  'Where should we travel together?',
  'What do our tastes have in common?',
  'What would person A love that person B would hate?',
  'Find a film we could both watch',
]

export default function QueryInterface({ apiKey, profiles, activeHandle }) {
  const [mode, setMode] = useState('single')
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [selectedHandles, setSelectedHandles] = useState([])
  const [strategy, setStrategy] = useState('intersection')
  const responseRef = useRef(null)

  const handles = Object.keys(profiles)
  const targetProfile = profiles[activeHandle]

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [response])

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
        if (!targetProfile) throw new Error('No active profile selected')
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

  const suggestions = mode === 'single' ? SUGGESTED_QUERIES : MULTI_SUGGESTED

  return (
    <div style={styles.root}>
      {/* Mode toggle */}
      <div style={styles.modeToggle}>
        {['single', 'multi'].map((m) => (
          <button
            key={m}
            style={{ ...styles.modeBtn, ...(mode === m ? styles.modeBtnActive : {}) }}
            onClick={() => setMode(m)}
          >
            {m === 'single' ? 'Single profile' : 'Multi-profile blend'}
          </button>
        ))}
      </div>

      {mode === 'single' && targetProfile && (
        <div style={styles.context}>
          <div style={styles.contextHeader}>
            <span style={styles.profileName}>{targetProfile.handle}</span>
            <span style={styles.imageCount}>{targetProfile.visual?.analyses?.length ?? 0} images analyzed</span>
          </div>
          {targetProfile.keywords?.length > 0 && (
            <div style={styles.keywords}>
              {targetProfile.keywords.map((k) => (
                <span key={k} style={styles.keyword}>{k}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'single' && !targetProfile && (
        <div style={styles.context}>
          <p style={styles.warn}>Select a profile from the header.</p>
        </div>
      )}

      {mode === 'multi' && (
        <div style={styles.multiSetup}>
          <div style={styles.profilePicker}>
            {handles.map((h) => (
              <button
                key={h}
                style={{ ...styles.profileChip, ...(selectedHandles.includes(h) ? styles.profileChipActive : {}) }}
                onClick={() => toggleHandle(h)}
              >
                {profiles[h].handle}
              </button>
            ))}
          </div>
          <div style={styles.strategyRow}>
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
      )}

      {/* Query input */}
      <div style={styles.queryBox}>
        <textarea
          style={styles.textarea}
          placeholder="Ask anything about this taste profile…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleQuery())}
          rows={2}
        />
        <button style={styles.sendBtn} onClick={() => handleQuery()} disabled={streaming}>
          {streaming ? '…' : 'Ask'}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {(response || streaming) && (
        <div style={styles.response} ref={responseRef}>
          <FormattedResponse text={response} streaming={streaming} />
        </div>
      )}
    </div>
  )
}

function FormattedResponse({ text, streaming }) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean)

  return (
    <div style={styles.responseBody}>
      {paragraphs.map((para, i) => {
        // Bold headers like "**Title**" or "1. Title"
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

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 780 },
  modeToggle: { display: 'flex', gap: 4 },
  modeBtn: {
    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)',
    borderRadius: 8, padding: '8px 18px', fontSize: 14, cursor: 'pointer',
  },
  modeBtnActive: { color: 'var(--text)', borderColor: 'var(--accent)' },
  context: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
  },
  contextHeader: { display: 'flex', alignItems: 'baseline', gap: 14 },
  profileName: { fontSize: 20, color: 'var(--text)', letterSpacing: '-0.3px' },
  imageCount: { fontSize: 12, color: 'var(--muted)' },
  keywords: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  keyword: {
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 20, padding: '3px 11px', fontSize: 12, color: 'var(--muted)',
  },
  warn: { color: 'var(--muted)', fontSize: 14 },
  multiSetup: { display: 'flex', flexDirection: 'column', gap: 14 },
  profilePicker: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  profileChip: {
    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)',
    borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer',
  },
  profileChipActive: { borderColor: 'var(--accent)', color: 'var(--text)' },
  strategyRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  stratBtn: {
    background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
    borderRadius: 6, padding: '5px 14px', fontSize: 13, cursor: 'pointer',
  },
  stratBtnActive: { borderColor: 'var(--accent-dim)', color: 'var(--accent)' },
  suggestions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  suggestion: {
    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)',
    borderRadius: 20, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
    textAlign: 'left', transition: 'border-color 0.15s, color 0.15s',
  },
  queryBox: { display: 'flex', gap: 10, alignItems: 'flex-end' },
  textarea: {
    flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text)', padding: '12px 16px', fontSize: 14,
    resize: 'none', lineHeight: 1.5,
  },
  sendBtn: {
    background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 10,
    padding: '12px 22px', fontWeight: 700, fontSize: 15, cursor: 'pointer',
  },
  response: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '28px 32px', maxHeight: 600, overflowY: 'auto',
  },
  responseBody: { display: 'flex', flexDirection: 'column', gap: 14 },
  para: { fontSize: 15, lineHeight: 1.85, color: 'var(--text)' },
  paraHeader: { fontWeight: 600, fontSize: 16, color: 'var(--accent)', marginTop: 6 },
  list: { paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 },
  listItem: { fontSize: 15, lineHeight: 1.7, color: 'var(--text)' },
  cursor: { display: 'inline-block', color: 'var(--accent)', animation: 'blink 1s step-end infinite' },
  error: { color: '#e06c6c', background: '#2a1515', border: '1px solid #5a2020', borderRadius: 8, padding: 14, fontSize: 14 },
}
