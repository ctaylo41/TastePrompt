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
  const color = pct > 0.85 ? '#e06c6c' : pct > 0.6 ? '#c8a96e' : '#6ec88a'
  if (tokens === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
      <div style={{ width: 80, height: 4, background: '#2a2a2a', borderRadius: 2 }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
        {Math.round(tokens / 1000)}k / 30k /min
      </span>
    </div>
  )
}

const styles = {
  app: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  centered: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' },
  apiCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 40, width: 400, display: 'flex',
    flexDirection: 'column', gap: 16, textAlign: 'center',
  },
  logo: { fontSize: 22, letterSpacing: '-0.5px', color: 'var(--accent)' },
  subtitle: { color: 'var(--muted)', fontSize: 14 },
  input: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', padding: '10px 14px', fontSize: 14, width: '100%',
  },
  btn: {
    background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
    padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },
  header: {
    padding: '16px 32px', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
  },
  main: { flex: 1, padding: '32px', maxWidth: 1300, margin: '0 auto', width: '100%' },
}
