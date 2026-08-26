import { createClient } from '@supabase/supabase-js'

// Trailing slashes and stray whitespace are the two ways pasting these goes
// wrong — clean both here. Values live in .env (VITE_SUPABASE_URL / KEY).
export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const FOOTBALL_KEY = String(import.meta.env.VITE_FOOTBALL_DATA_KEY || '').trim()
export const GH_BUILD = '2026-08-25-react.1'

export function configProblem () {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY ||
      SUPABASE_URL.startsWith('PASTE') || SUPABASE_ANON_KEY.startsWith('PASTE')) {
    return 'No Supabase project is configured. Open .env in the groundhopper-app folder and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY — the values come from Supabase → Project Settings → API.'  }
  let u
  try { u = new URL(SUPABASE_URL) } catch {
    return `That Project URL isn't a valid web address: "${SUPABASE_URL}". It should look like https://abcdefgh.supabase.co`
  }
  if (u.protocol !== 'https:') {
    return 'The Project URL must start with https:// — copy it again from Project Settings → API.'
  }
  if (u.pathname !== '/' || u.search) {
    return `The Project URL should have nothing after the domain. Use just https://${u.host}`
  }
  if (SUPABASE_ANON_KEY.length < 20) {
    return 'That anon key looks too short. Copy the whole thing from Project Settings → API — the long one labelled anon or publishable, not the project ID.'
  }
  return null
}

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
