import { useState, useEffect } from 'react'
import QueryInterface from './components/QueryInterface.jsx'
import { subscribe, getUsagePerMinute } from './utils/tokenTracker.js'

// Auto-load all JSON files from /profiles at build time
const profileFiles = import.meta.glob('../profiles/*.json', { eager: true })
const BUNDLED_PROFILES = Object.fromEntries(
  Object.values(profileFiles).map((mod) => {
    const p = mod.default ?? mod
    return [p.handle, p]
  })
)

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('tastePrompt_apiKey') ?? '')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [profiles] = useState(BUNDLED_PROFILES)
  const omdbKey = import.meta.env.VITE_OMDB_KEY ?? ''
  const [tokensPerMin, setTokensPerMin] = useState(0)

  useEffect(() => subscribe(setTokensPerMin), [])

  function handleSaveApiKey() {
    localStorage.setItem('tastePrompt_apiKey', apiKeyInput)
    setApiKey(apiKeyInput)
    setApiKeyInput('')
  }

  if (!apiKey) {
    return (
      <div style={styles.centered}>
        <div style={styles.apiCard}>
          <h1 style={styles.logo}>tastePrompt</h1>
          <p style={styles.subtitle}>Enter your Anthropic API key to begin</p>
          <input
            style={styles.input}
            type="password"
            placeholder="sk-ant-..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
          />
          <button style={styles.btn} onClick={handleSaveApiKey}>Continue</button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <span style={styles.logo}>tastePrompt</span>
        <TokenMeter tokens={tokensPerMin} />
      </header>

      <main style={styles.main}>
        <QueryInterface apiKey={apiKey} omdbKey={omdbKey} profiles={profiles} />
      </main>
    </div>
  )
}

function TokenMeter({ tokens }) {
  const LIMIT = 30_000
  const pct = Math.min(tokens / LIMIT, 1)
  const color = pct > 0.85 ? '#c06060' : pct > 0.6 ? 'var(--accent)' : 'var(--muted)'
  if (tokens === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
      <div style={{ width: 60, height: 2, background: 'var(--border)' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'SF Mono', monospace", letterSpacing: '0.05em' }}>
        {Math.round(tokens / 1000)}k / 30k
      </span>
    </div>
  )
}

const styles = {
  app: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  centered: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' },
  apiCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    padding: '48px 40px', width: 380, display: 'flex',
    flexDirection: 'column', gap: 20, textAlign: 'center',
  },
  logo: {
    fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase',
    color: 'var(--accent-light)', fontFamily: "'SF Mono', monospace",
  },
  subtitle: { color: 'var(--muted)', fontSize: 13, letterSpacing: '0.02em' },
  input: {
    background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
    color: 'var(--text)', padding: '10px 0', fontSize: 14, width: '100%',
    outline: 'none', transition: 'border-color 0.2s',
  },
  btn: {
    background: 'transparent', color: 'var(--accent-light)',
    border: '1px solid var(--accent-dim)',
    padding: '10px 24px', fontSize: 12, letterSpacing: '0.15em',
    textTransform: 'uppercase', cursor: 'pointer', marginTop: 8,
    fontFamily: "'SF Mono', monospace",
  },
  header: {
    padding: '20px 40px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg)', display: 'flex', alignItems: 'center',
  },
  main: { flex: 1, padding: '48px 40px', maxWidth: 1300, margin: '0 auto', width: '100%' },
}
