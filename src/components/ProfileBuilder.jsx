import { useState } from 'react'
import { analyzeImage, synthesizeProfile } from '../api/claude.js'

export default function ProfileBuilder({ apiKey, profile, onUpdate }) {
  const [loading, setLoading] = useState(null) // 'image' | 'fingerprint'
  const [error, setError] = useState('')
  const [handleEdit, setHandleEdit] = useState(profile.handle)

  async function handleImageUpload(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setLoading('image')
    setError('')
    try {
      const newAnalyses = []
      for (const file of files) {
        const base64 = await toBase64(file)
        const result = await analyzeImage(apiKey, base64, file.type, file.name)
        newAnalyses.push(result)
      }
      onUpdate({
        ...profile,
        visual: {
          ...profile.visual,
          analyses: [...(profile.visual?.analyses ?? []), ...newAnalyses],
        },
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(null)
      e.target.value = ''
    }
  }

  async function handleFingerprint() {
    setLoading('fingerprint')
    setError('')
    try {
      const result = await synthesizeProfile(apiKey, profile)
      onUpdate({
        ...profile,
        fingerprint: result.fingerprint,
        keywords: result.keywords,
        cross_domain_predictions: result.cross_domain_predictions,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(null)
    }
  }

  function handleTextPref(category, values) {
    onUpdate({
      ...profile,
      text_preferences: {
        ...profile.text_preferences,
        [category]: { ...profile.text_preferences[category], values },
      },
    })
  }

  function removeImage(index) {
    const analyses = [...profile.visual.analyses]
    analyses.splice(index, 1)
    onUpdate({ ...profile, visual: { ...profile.visual, analyses } })
  }

  const TEXT_CATS = ['food', 'fashion', 'books', 'film', 'spaces']

  return (
    <div style={styles.root}>
      {/* Handle */}
      <div style={styles.section}>
        <label style={styles.label}>Profile handle</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={styles.input}
            value={handleEdit}
            onChange={(e) => setHandleEdit(e.target.value)}
            onBlur={() => onUpdate({ ...profile, handle: handleEdit })}
            placeholder="your name or alias"
          />
        </div>
      </div>

      {/* Images */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Visual</h2>
          <label style={styles.uploadBtn}>
            {loading === 'image' ? 'Analyzing…' : '+ upload images'}
            <input
              type="file" accept="image/*" multiple hidden
              onChange={handleImageUpload}
              disabled={!!loading}
            />
          </label>
        </div>

        {profile.visual?.analyses?.length > 0 && (
          <div style={styles.imageGrid}>
            {profile.visual.analyses.map((analysis, i) => (
              <ImageCard key={i} analysis={analysis} onRemove={() => removeImage(i)} />
            ))}
          </div>
        )}

      </div>

      {/* Text prefs */}
      <div style={styles.section}>
        <h2 style={styles.h2}>Preferences</h2>
        <div style={styles.prefsGrid}>
          {TEXT_CATS.map((cat) => (
            <TagInput
              key={cat}
              label={cat}
              values={profile.text_preferences?.[cat]?.values ?? []}
              onChange={(vals) => handleTextPref(cat, vals)}
            />
          ))}
        </div>
      </div>

      {/* Fingerprint */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Fingerprint</h2>
          <button
            style={styles.btnAccent}
            onClick={handleFingerprint}
            disabled={!!loading}
          >
            {loading === 'fingerprint' ? 'Synthesizing…' : 'Generate fingerprint'}
          </button>
        </div>

        {profile.fingerprint && (
          <div style={styles.fingerprint}>
            <p style={styles.fingerprintText}>{profile.fingerprint}</p>
            {profile.keywords?.length > 0 && (
              <div style={styles.keywords}>
                {profile.keywords.map((k) => (
                  <span key={k} style={styles.keyword}>{k}</span>
                ))}
              </div>
            )}
            {profile.cross_domain_predictions && Object.keys(profile.cross_domain_predictions).length > 0 && (
              <div style={styles.predictions}>
                {Object.entries(profile.cross_domain_predictions).map(([k, v]) => (
                  <div key={k} style={styles.prediction}>
                    <span style={styles.predLabel}>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}
    </div>
  )
}

function ImageCard({ analysis, onRemove }) {
  return (
    <div style={styles.imageCard}>
      <div style={styles.palette}>
        {(analysis.palette ?? []).map((color) => (
          <div key={color} style={{ ...styles.swatch, background: color }} title={color} />
        ))}
      </div>
      <div style={styles.imageCardBody}>
        <div style={styles.imageCardTitle}>{analysis.filename}</div>
        <div style={styles.imageMeta}>
          <span style={styles.badge}>{analysis.mood}</span>
        </div>
        <p style={styles.aestheticSignal}>{analysis.aesthetic_signal}</p>
        <div style={styles.tags}>
          {(analysis.tags ?? []).map((t) => <span key={t} style={styles.tag}>{t}</span>)}
        </div>
      </div>
      <button style={styles.remove} onClick={onRemove}>×</button>
    </div>
  )
}

function TagInput({ label, values, onChange }) {
  const [draft, setDraft] = useState('')

  function add() {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }

  return (
    <div style={styles.tagInput}>
      <label style={styles.label}>{label}</label>
      <div style={styles.tagRow}>
        {values.map((v) => (
          <span key={v} style={styles.tagChip}>
            {v}
            <button style={styles.chipRemove} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
          </span>
        ))}
        <input
          style={styles.tagDraft}
          placeholder="add…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          onBlur={add}
        />
      </div>
    </div>
  )
}

async function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 40 },
  section: { display: 'flex', flexDirection: 'column', gap: 16 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 18, fontWeight: 400, letterSpacing: '0.5px', color: 'var(--accent)' },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)' },
  input: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', padding: '9px 14px', fontSize: 14, flex: 1,
  },
  uploadBtn: {
    background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent-dim)',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
  },
  btnAccent: {
    background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
    padding: '9px 18px', fontWeight: 600, fontSize: 13,
  },
  imageGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 },
  imageCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: 16, position: 'relative', display: 'flex', flexDirection: 'column', gap: 10,
  },
  palette: { display: 'flex', gap: 6 },
  swatch: { width: 24, height: 24, borderRadius: 4 },
  imageCardBody: { display: 'flex', flexDirection: 'column', gap: 6 },
  imageCardTitle: { fontSize: 13, color: 'var(--muted)' },
  imageMeta: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  badge: {
    background: 'var(--border)', color: 'var(--text)', borderRadius: 4,
    padding: '2px 8px', fontSize: 12,
  },
  aestheticSignal: { fontSize: 13, color: 'var(--text)', fontStyle: 'italic' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontSize: 12 },
  remove: {
    position: 'absolute', top: 10, right: 10, background: 'transparent',
    border: 'none', color: 'var(--muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer',
  },
  muted: { color: 'var(--muted)', fontSize: 13 },
  prefsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 },
  tagInput: { display: 'flex', flexDirection: 'column', gap: 8 },
  tagRow: {
    display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
    background: 'var(--surface)', minHeight: 42,
  },
  tagChip: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
    padding: '2px 6px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
  },
  chipRemove: { background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 },
  tagDraft: { background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, outline: 'none', minWidth: 60 },
  fingerprint: {
    background: 'var(--surface)', border: '1px solid var(--accent-dim)',
    borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
  },
  fingerprintText: { fontSize: 16, lineHeight: 1.8, fontStyle: 'italic' },
  keywords: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  keyword: { background: 'var(--accent-dim)', color: '#fff', borderRadius: 4, padding: '3px 10px', fontSize: 13 },
  predictions: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' },
  prediction: { display: 'flex', gap: 12, fontSize: 14 },
  predLabel: { color: 'var(--accent)', width: 90, flexShrink: 0, fontStyle: 'normal' },
  synthesis: { color: 'var(--muted)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.7 },
  error: { color: '#e06c6c', background: '#2a1515', border: '1px solid #5a2020', borderRadius: 8, padding: 14, fontSize: 14 },
}
