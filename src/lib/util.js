import { STADIUMS } from '../data/stadiums.js'
import { STADIUM_COORDS } from '../data/coords.js'
import { CITY_LATLON } from '../data/cities.js'

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const fmt = n => Number(n || 0).toLocaleString('en-GB')
export const initials = n => {
  const p = (n || '?').trim().split(/\s+/)
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase()
}
export function ago (ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 86400) + 'h ago'
  if (s < 604800) return Math.floor(s / 86400) + 'd ago'
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
export function slug (s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
export const withTimeout = (p, ms, msg) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))
])

// ---- ground reference data is bundled: static, so search stays instant ----
// football-data.org free tier covers these domestic leagues, so each ground
// gets linked to a competition by the club's country where one exists.
const COMP_BY_COUNTRY = {
  England: 'PL', Scotland: 'SC', Germany: 'BL1', Spain: 'PD',
  Italy: 'SA', France: 'FL1', Netherlands: 'DED',
  Portugal: 'PPL', Brazil: 'BSA'
}

export const GROUNDS = STADIUMS.map((r, i) => {
  const exact = STADIUM_COORDS[r[0] + '|' + r[2]]
  const ll = exact || CITY_LATLON[r[2] + '|' + r[3]]
  return {
    id: slug(r[0]) + '-' + slug(r[2]) + '-' + i,
    name: r[0], club: r[1], city: r[2], country: r[3], region: r[4],
    capacity: r[5], opened: r[6], note: r[7] || '',
    lat: ll ? ll[0] : null, lon: ll ? ll[1] : null,
    comp: COMP_BY_COUNTRY[r[3]] || null
  }
})
export const byId = Object.fromEntries(GROUNDS.map(g => [g.id, g]))
export const REGIONS = [...new Set(GROUNDS.map(g => g.region))].sort()

// ---- tiny toast bus so any component can raise the shared toast ----
let toastFn = null
export function setToastFn (f) { toastFn = f }
export function toast (msg) { if (toastFn) toastFn(msg) }
