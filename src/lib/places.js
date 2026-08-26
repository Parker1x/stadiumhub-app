// Stadium neighbourhood data from OpenStreetMap — free, keyless.
//
// Overpass: amenities within a radius of the ground (pubs, restaurants,
// hotels, stations). OSRM: walking route + time from the nearest station to
// the turnstiles. Nominatim is NOT used (usage policy prefers no app use).
//
// Everything is cached in the shared ground_cache table for 14 days: the
// data changes at walking pace, and Overpass rate-limits bursts.

import { sb } from './supabase.js'
import { toast } from './util.js'

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]

const mem = new Map()
const TTL_AMENITIES = 14 * 864e5

async function cached (kind, key, ttlMs, fetcher) {
  const k = kind + ':' + key
  if (mem.has(k)) return mem.get(k)
  const cutoff = new Date(Date.now() - ttlMs).toISOString()
  const { data: row } = await sb.from('ground_cache')
    .select('payload, fetched_at').eq('cache_key', k)
    .gte('fetched_at', cutoff).maybeSingle()
  if (row) { mem.set(k, row.payload); return row.payload }
  try {
    const payload = await fetcher()
    mem.set(k, payload)
    sb.from('ground_cache').upsert({
      cache_key: k, payload,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString()
    }, { onConflict: 'cache_key' }).then(() => {}, () => {})
    return payload
  } catch (err) {
    const { data: stale } = await sb.from('ground_cache')
      .select('payload').eq('cache_key', k).maybeSingle()
    if (stale) { mem.set(k, stale.payload); return stale.payload }
    throw err
  }
}

const q = s => String(s ?? '').replace(/[<>&"']/g, '')

function overpassQuery (lat, lon, radius) {
  return `[out:json][timeout:25];(
    node["amenity"~"^(pub|bar)$"](around:${radius},${lat},${lon});
    way["amenity"~"^(pub|bar)$"](around:${radius},${lat},${lon});
    node["amenity"="restaurant"](around:${radius},${lat},${lon});
    way["amenity"="restaurant"](around:${radius},${lat},${lon});
    node["amenity"~"^(fast_food|cafe)$"]["cuisine"](around:${radius},${lat},${lon});
    node["tourism"="hotel"](around:${radius},${lat},${lon});
    way["tourism"="hotel"](around:${radius},${lat},${lon});
    node["railway"~"^(station|subway_entrance|tram_stop)$"](around:${Math.max(radius, 3000)},${lat},${lon});
    node["highway"="bus_stop"](around:900,${lat},${lon});
  );out center tags;`
}

async function runOverpass (query) {
  let lastErr
  for (const ep of OVERPASS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      })
      if (!res.ok) throw new Error(`overpass ${res.status}`)
      return await res.json()
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

const gmaps = (name, lat, lon) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}%20${lat}%2C${lon}`
const gmapsDir = (fromLat, fromLon, toLat, toLon) =>
  `https://www.google.com/maps/dir/?api=1&origin=${fromLat}%2C${fromLon}&destination=${toLat}%2C${toLon}&travelmode=walking`

function shapeAmenity (el) {
  const t = el.tags || {}
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (lat == null || lon == null) return null
  let kind, icon
  if (t.amenity === 'pub' || t.amenity === 'bar') { kind = 'pub'; icon = '🍺' }
  else if (t.amenity === 'restaurant') { kind = 'restaurant'; icon = '🍴' }
  else if (t.amenity === 'fast_food' || t.amenity === 'cafe') { kind = 'restaurant'; icon = '☕' }
  else if (t.tourism === 'hotel') { kind = 'hotel'; icon = '🛏️' }
  else if (t.railway || t.highway === 'bus_stop') {
    kind = 'transport'; icon = '🚉'
    // remember which kind of stop this is so stations can be filtered
    if (t.highway === 'bus_stop') var mode = 'bus'
    else if (t.railway === 'tram_stop') var mode = 'tram'
    else var mode = 'rail'
  }
  if (!kind) return null
  const name = t.name || ''
  return {
    id: el.type[0] + el.id,
    kind, icon, name, mode,
    lat, lon,
    website: t.website || t['contact:website'] || null,
    phone: t.phone || t['contact:phone'] || null,
    opening: t.opening_hours || null,
    realAle: t.real_ale === 'yes' || t.cask == 'yes' || undefined,
    veggie: /vegetarian|vegan/.test(t.diet_vegetarian || '') || undefined,
    outside: t.outdoor_seating === 'yes' || undefined
  }
}

export async function getGroundPlaces (ground) {
  if (ground.lat == null || ground.lon == null) return null
  return cached('places', `${ground.lat.toFixed(4)},${ground.lon.toFixed(4)}`, TTL_AMENITIES,
    async () => {
      const j = await runOverpass(overpassQuery(ground.lat, ground.lon, 1600))
      const items = (j.elements || []).map(shapeAmenity).filter(Boolean)
      const pubs = items.filter(x => x.kind === 'pub').sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0))
      const restaurants = items.filter(x => x.kind === 'restaurant')
      const hotels = items.filter(x => x.kind === 'hotel')
      const transport = items.filter(x => x.kind === 'transport')
      return { pubs, restaurants, hotels, transport, fetchedAt: new Date().toISOString() }
    })
}

// ------------------------------------------------------ transport & routes --
// Nearest rail station(s), live departures where available, and the walk.

function haversineM (aLat, aLon, bLat, bLon) {
  const R = 6371000, r = Math.PI / 180
  const dLa = (bLat - aLat) * r, dLo = (bLon - aLon) * r
  const h = Math.sin(dLa / 2) ** 2 +
            Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function nearestStations (ground, transportItems, n = 3) {
  const stations = (transportItems || [])
    .filter(t => t.kind === 'transport' && t.mode !== 'bus' && t.name)
    .map(t => ({ ...t, dist: haversineM(ground.lat, ground.lon, t.lat, t.lon) }))
    .sort((a, b) => a.dist - b.dist)
  return stations.slice(0, n)
}

// Live departures. Transport for London needs no key and covers all London
// stations. Elsewhere we show a friendly fallback and link to journey planners.
const TFL_MODES = ['tube', 'rail', 'dlr', 'overground', 'tram', 'elizabeth-line']
const norm = s => String(s || '').toLowerCase().replace(/\s*(underground|rail|dlr|overground|tram|elizabeth\s*line)\s*station\s*$/i, '').trim()

export async function getLiveDepartures (station) {
  try {
    // TfL StopPoint search -> pick the stop that best matches this station's
    // name AND carries a mode we can board, then pull its live arrivals.
    const res = await fetch(`https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(station.name)}`)
    if (!res.ok) return []
    const j = await res.json()
    const wanted = norm(station.name)
    const candidates = (j.matches || []).filter(m =>
      (m.modes || []).some(x => TFL_MODES.includes(x)))
    if (!candidates.length) return []
    const exact = candidates.find(m => norm(m.name) === wanted)
    const prefix = candidates.find(m => norm(m.name).startsWith(wanted))
    const match = exact || prefix || candidates[0]
    const id = match.id
    if (!id) return []
    const r2 = await fetch(`https://api.tfl.gov.uk/StopPoint/${id}/Arrivals`)
    if (!r2.ok) return []
    const arr = await r2.json()
    return arr
      .sort((a, b) => new Date(a.expectedArrival) - new Date(b.expectedArrival))
      .slice(0, 8)
      .map(a => ({
        line: a.lineName || a.lineId,
        towards: a.destinationName?.replace(/ (Underground|Undergroud) Station/i, ''),
        mins: Math.max(0, Math.round((new Date(a.expectedArrival) - Date.now()) / 60000)),
        platform: a.platformName?.replace('Platform ', '') || '',
        live: a.timeToStation < 120,
        station: match.name
      }))
  } catch { return [] }
}

export function plannerLinks (ground) {
  if (ground.lat == null) return []
  return [
    { label: 'National Rail', url: `https://www.nationalrail.co.uk/stations_destinations/plan-your-journey.aspx?search=${encodeURIComponent(ground.city)}` },
    { label: 'Citymapper', url: `https://citymapper.com/directions?endcoord=${ground.lat}%2C${ground.lon}&endname=${encodeURIComponent(ground.name)}` },
    { label: 'Google Maps transit', url: `https://www.google.com/maps/dir/?api=1&destination=${ground.lat}%2C${ground.lon}&travelmode=transit` }
  ]
}

export { gmaps, gmapsDir }

// Walking estimate. The public OSRM demo ignores the foot profile (returns
// car pace), so instead of showing wrong minutes we compute a straight-line
// distance and apply a standard 12–13 min/km street-walk factor with a road
// detour allowance. "Walk route" links to Google for turn-by-turn accuracy.
export async function getWalkRoute (fromLat, fromLon, toLat, toLon) {
  const metres = haversineM(fromLat, fromLon, toLat, toLon) * 1.25 // street detours
  const minutes = Math.max(1, Math.round(metres / 78))             // ~12.8 min/km
  return { metres: Math.round(metres), minutes, estimated: true }
}
