const STORAGE_KEY = 'shareTaste_profiles'

export function emptyProfile(handle = '') {
  return {
    handle,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    visual: { analyses: [] },
    text_preferences: {
      food: { values: [], notes: '' },
      fashion: { values: [], notes: '' },
      books: { values: [], notes: '' },
      film: { values: [], notes: '' },
      spaces: { values: [], notes: '' },
    },
    fingerprint: '',
    keywords: [],
    cross_domain_predictions: {},
  }
}

export function loadProfiles() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function saveProfile(profile) {
  const all = loadProfiles()
  all[profile.handle] = { ...profile, updated_at: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  return all[profile.handle]
}

export function deleteProfile(handle) {
  const all = loadProfiles()
  delete all[handle]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function exportProfile(profile) {
  return JSON.stringify(profile, null, 2)
}

export function importProfile(jsonString) {
  const profile = JSON.parse(jsonString)
  if (!profile.handle) throw new Error('Profile must have a handle')
  saveProfile(profile)
  return profile
}
