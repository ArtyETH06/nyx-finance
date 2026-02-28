import { useState, useEffect } from 'react'

export interface UserProfile {
  firstName: string
  lastName:  string
  company:   string
}

const EMPTY: UserProfile = { firstName: '', lastName: '', company: '' }

function key(address: string) {
  return `nyx:profile:${address}`
}

export function loadProfile(address: string): UserProfile {
  if (!address) return { ...EMPTY }
  try {
    const raw = localStorage.getItem(key(address))
    if (!raw) return { ...EMPTY }
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<UserProfile>) }
  } catch {
    return { ...EMPTY }
  }
}

export function saveProfile(address: string, profile: UserProfile) {
  if (!address) return
  localStorage.setItem(key(address), JSON.stringify(profile))
}

export function useProfile(address: string) {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile(address))

  // Re-read if address changes (e.g. wallet switch)
  useEffect(() => {
    setProfile(loadProfile(address))
  }, [address])

  function save(p: UserProfile) {
    saveProfile(address, p)
    setProfile(p)
  }

  return { profile, save }
}
