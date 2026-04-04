import { useState } from 'react'
import ProfileBuilder from './components/ProfileBuilder.jsx'
import QueryInterface from './components/QueryInterface.jsx'
import { saveProfile, emptyProfile } from './storage/profiles.js'

// Auto-load all JSON files from /profiles at build time
const profileFiles = import.meta.glob('../profiles/*.json', { eager: true })
const BUNDLED_PROFILES = Object.fromEntries(
  Object.values(profileFiles).map((mod) => {
    const p = mod.default ?? mod
    return [p.handle, p]
  })
)

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('shareTaste_apiKey') ?? '')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [tab, setTab] = useState('query')
  const [profiles] = useState(BUNDLED_PROFILES)
  const [activeHandle, setActiveHandle] = useState(Object.keys(BUNDLED_PROFILES)[0] ?? '')

  const handles = Object.keys(profiles)
  const activeProfile = profiles[activeHandle] ?? null

  function handleSaveApiKey() {
    localStorage.setItem('shareTaste_apiKey', apiKeyInput)
    setApiKey(apiKeyInput)
    setApiKeyInput('')
  }

  if (!apiKey) {
    return (
      <div style={styles.centered}>
        <div style={styles.apiCard}>
          <h1 style={styles.logo}>shareTaste</h1>
          <p style={styles.subtitle}>Enter your Anthropic API key to begin</p>
          <input
            style={styles.input}
            type="password"
            placeholder="sk-ant-..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
          />
          <button style={styles.btn} onClick={handleSaveApiKey}>
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <span style={styles.logo}>shareTaste</span>
        <div style={{ flex: 1 }} />
        <div style={styles.profileSwitcher}>
          {handles.map((h) => (
            <button
              key={h}
              style={{ ...styles.profileTab, ...(activeHandle === h ? styles.profileTabActive : {}) }}
              onClick={() => setActiveHandle(h)}
            >
              {profiles[h].handle}
            </button>
          ))}
        </div>
      </header>

      <main style={styles.main}>
        <QueryInterface
          apiKey={apiKey}
          profiles={profiles}
          activeHandle={activeHandle}
        />
      </main>
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
  logo: { fontSize: 28, letterSpacing: '-0.5px', color: 'var(--accent)' },
  subtitle: { color: 'var(--muted)', fontSize: 14 },
  input: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', padding: '10px 14px', fontSize: 14, width: '100%',
  },
  btn: {
    background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
    padding: '10px 20px', fontWeight: 600, fontSize: 14,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 24,
    padding: '14px 28px', borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
  },
  profileSwitcher: { display: 'flex', gap: 6, alignItems: 'center' },
  profileTab: {
    background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
    borderRadius: 8, padding: '6px 16px', fontSize: 14, cursor: 'pointer',
  },
  profileTabActive: {
    border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent',
  },
  main: { flex: 1, padding: 32, maxWidth: 900, margin: '0 auto', width: '100%' },
}
