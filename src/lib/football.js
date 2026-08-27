import { FOOTBALL_KEY, sb } from './supabase.js'
import { GROUNDS, byId, slug, toast } from './util.js'

const API = 'https://api.football-data.org/v4'
export const hasFootballKey = () => FOOTBALL_KEY.length > 10

// ---------------------------------------------------------------- caching --
// All calls go through this: memory cache for the session, then the
// ground_cache table (7-day TTL) shared across everyone using the app. With
// the free tier's 10 req/min this keeps the whole stadium page to ~3 API
// calls per ground per week no matter how many people look at it.
const mem = new Map()

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
    // API failed or quota exhausted: fall back to stale cache if we have one
    const { data: stale } = await sb.from('ground_cache')
      .select('payload').eq('cache_key', k).maybeSingle()
    if (stale) { mem.set(k, stale.payload); return stale.payload }
    throw err
  }
}

async function fdGet (path) {
  // Both dev and prod go through /fdapi -> api.football-data.org (Vite proxy
  // in dev, nginx location on the VPS in prod). The proxy injects the auth
  // header server-side, sidestepping the API's broken CORS policy and keeping
  // the key out of the client bundle.
  await rateGate()
  const res = await fetch('/fdapi/v4' + path)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const e = new Error(`football-data ${res.status}: ${body.slice(0, 140)}`)
    e.status = res.status
    throw e
  }
  return res.json()
}

// ---- rolling-minute rate gate -------------------------------------------
// The free tier allows 10 requests/minute and bursts of retries were eating
// the whole budget at once. Every API call passes through here: max 8 per
// rolling 60s, anything beyond waits its turn. Self-regulating — no user
// retry whack-a-mole.
const rate = { stamps: [] }
async function rateGate () {
  for (;;) {
    const now = Date.now()
    rate.stamps = rate.stamps.filter(t => now - t < 60000)
    if (rate.stamps.length < 9) { rate.stamps.push(now); return }
    const wait = 60000 - (now - rate.stamps[0]) + 250
    await new Promise(r => setTimeout(r, Math.max(wait, 500)))
  }
}

// ------------------------------------------------------------ team lookup --
// Match football-data.org team names to our bundled grounds. Exact name first,
// then a relaxed comparison; results are memoised because the free tier is
// strict about request rate.
const teamCache = new Map() // comp -> Map(lowername -> team object)

async function teamsForComp (comp) {
  if (teamCache.has(comp)) return teamCache.get(comp)
  const list = await cached('fd_teams', comp, 14 * 864e5, async () =>
    (await fdGet(`/competitions/${comp}/teams`)).teams || [])
  const map = new Map()
  list.forEach(t => {
    map.set(t.name.toLowerCase(), t)
    map.set((t.shortName || '').toLowerCase(), t)
    const tl = t.name.toLowerCase()
    map.set(tl.replace(/^fc /, '').replace(/ fc$/, '').replace(/ afc$/, ''), t)
  })
  teamCache.set(comp, map)
  return map
}

const matchTeam = (teamMap, club) =>
  teamMap.get(club.toLowerCase()) ||
  teamMap.get(club.toLowerCase().replace(/^fc /, '').replace(/ fc$/, '')) ||
  [...teamMap.values()].find(t => t.name.toLowerCase().includes(club.toLowerCase()) && club.length > 5) ||
  null

// --------------------------------------------------------------- fixtures --
// Fixtures + results for one competition, ±window around today. Cached 6h;
// finished matches never change, live ones bypass the cache entirely.
export async function getFixtures (comp) {
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const to = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10)
  return cached('fd_matches', comp, 6 * 3600e3, async () => {
    const j = await fdGet(`/competitions/${comp}/matches?dateFrom=${from}&dateTo=${to}`)
    return j.matches || []
  })
}

// Live matches right now — NEVER cached; called by the poller only.
export async function getLiveMatches (comp) {
  const j = await fdGet(`/competitions/${comp}/matches?status=IN_PLAY`)
  return j.matches || []
}

// Everything the stadium page needs for one ground: upcoming fixtures at this
// stadium, recent results there, and whether a match is on RIGHT NOW.
export async function getGroundFootball (ground) {
  if (!hasFootballKey() || !ground.comp) {
    return { supported: false }
  }
  const data = await cached('gf', ground.comp, 6 * 3600e3, async () => {
    const fixtures = await getFixtures(ground.comp)
    const teamMap = await teamsForComp(ground.comp)
    return { fixtures, clubToTeam: Object.fromEntries([...teamMap.keys()].map(k => [k, teamMap.get(k).id])) }
  })
  const teamMap = await teamsForComp(ground.comp)
  const team = matchTeam(teamMap, ground.club)

  if (!team) return { supported: true, linked: false, fixtures: [] }

  const matches = data.fixtures.filter(m =>
    m.homeTeam?.id === team.id || m.awayTeam?.id === team.id)
  // A match happens "at this stadium" when our ground's club is the home side
  // (or a neutral cup final hosted there — rare, ignored).
  const here = matches
    .filter(m => m.homeTeam?.id === team.id)
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
  const now = Date.now()
  const live = here.find(m => m.status === 'IN_PLAY')
  const upcoming = here.filter(m => ['SCHEDULED', 'TIMED'].includes(m.status))
    .filter(m => new Date(m.utcDate).getTime() > now - 2 * 3600e3)
  const results = here.filter(m => m.status === 'FINISHED')
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate)).slice(0, 5)

  return { supported: true, linked: true, team, live: live || null, upcoming, results }
}

// ------------------------------------------------------- attendance sync --
// For each visited date at this ground, find that club's home match played on
// that date (kickoff local dates can differ from UTC, so compare on both).
function matchOnDate (matches, teamId, ymd) {
  return matches.find(m => {
    if (m.homeTeam?.id !== teamId) return false
    if (!['FINISHED', 'AWARDED'].includes(m.status)) return false
    const d = new Date(m.utcDate)
    const utcYmd = d.toISOString().slice(0, 10)
    const uk = new Date(d.getTime() + 3600e3 * 1).toISOString().slice(0, 10) // UK/BST-ish
    return utcYmd === ymd || uk === ymd
  }) || null
}

export async function syncAttendance (me, visited) {
  if (!hasFootballKey()) return { synced: 0, found: 0 }
  const comps = [...new Set(Object.keys(visited).map(id => byId[id]).filter(Boolean).map(g => g.comp))]
  let synced = 0
  const rows = []

  // Only ever INSERT new matches — never overwrite existing rows, because an
  // update here would clobber scorers_json that the scorer pass filled in.
  const { data: existing } = await sb.from('attended_matches')
    .select('match_id').eq('user_id', me.id)
  const have = new Set((existing || []).map(r => r.match_id))

  for (const comp of comps) {
    if (!comp) continue
    const { fixtures } = await cached('gf', comp, 6 * 3600e3, async () => {
      const fx = await getFixtures(comp)
      const tm = await teamsForComp(comp)
      return { fixtures: fx, clubToTeam: {} }
    })
    const tm = await teamsForComp(comp)
    for (const gid of Object.keys(visited)) {
      const g = byId[gid]
      if (!g || g.comp !== comp) continue
      const team = matchTeam(tm, g.club)
      if (!team) continue
      const ymds = [visited[gid].visited_on].filter(Boolean)
      for (const ymd of ymds) {
        const m = matchOnDate(fixtures, team.id, ymd)
        if (!m || have.has(String(m.id))) continue
        const homeGoals = m.score.fullTime.home ?? m.score.fullTime.homeTeam
        const awayGoals = m.score.fullTime.away ?? m.score.fullTime.awayTeam
        rows.push({
          user_id: me.id,
          ground_id: gid,
          match_id: String(m.id),
          match_date: m.utcDate,
          home_team: m.homeTeam?.name || '',
          away_team: m.awayTeam?.name || '',
          home_goals: Number.isFinite(+homeGoals) ? +homeGoals : null,
          away_goals: Number.isFinite(+awayGoals) ? +awayGoals : null,
          competition: comp,
          scorers_json: null
        })
      }
    }
    synced++
  }

  if (rows.length) {
    const { error } = await sb.from('attended_matches').insert(rows)
    if (error) console.warn('[stadiumhub] attendance insert:', error.message)
  }
  return { synced, found: rows.length }
}

// ===========================================================================
//  FIXTURES TAB — day windows, live scores, and match plans
// ===========================================================================

// Free-tier competitions worth showing in a FOTMOB-style list.
export const FIXTURE_COMPS = ['PL', 'CL', 'BL1', 'PD', 'SA', 'FL1', 'DED', 'PPL', 'BSA']

// All matches of one competition in a date range. Cached 5 minutes: short
// enough that live scores move, long enough that browsing days is free.
export async function getWindowMatches (comp, fromStr, toStr, { skipCache = false } = {}) {
  const key = `${comp}|${fromStr}|${toStr}`
  if (skipCache) mem.delete('fdwin:' + key)
  return cached('fdwin', key, 5 * 60e3, async () => {
    const j = await fdGet(`/competitions/${comp}/matches?dateFrom=${fromStr}&dateTo=${toStr}`)
    return j.matches || []
  })
}

// All matches across every covered competition in a date range — ONE API
// call. football-data.org's /v4/matches endpoint returns the lot (64-81
// matches for a weekend), which replaces the old per-competition loop that
// burned 9 requests and kept tripping the rate limit.
export async function getFixturesForRange (fromStr, toStr, { skipCache = false } = {}) {
  const key = `${fromStr}|${toStr}`
  if (skipCache) mem.delete('fdall:' + key)
  const matches = await cached('fdall', key, 5 * 60e3, async () => {
    const j = await fdGet(`/matches?dateFrom=${fromStr}&dateTo=${toStr}`)
    return j.matches || []
  })
  return { matches, skipped: [] }
}

// Convert "I'm attending" plans into real attendance once matches finish.
// Idempotent: finished plans are flagged synced=true and never reprocessed.
export async function syncPlans (me) {
  const { data: plans, error } = await sb.from('match_plans')
    .select('*').eq('user_id', me.id).eq('synced', false)
  if (error || !plans?.length) return { synced: 0 }

  let done = 0
  for (const plan of plans) {
    try {
      const j = await fdGet(`/matches/${plan.match_id}`)
      const m = j.match
      const status = m?.status
      const hg = m?.score?.fullTime?.home ?? null
      const ag = m?.score?.fullTime?.away ?? null

      await sb.from('match_plans').update({
        home_goals: hg, away_goals: ag, status, synced: status === 'FINISHED'
      }).eq('id', plan.id)

      if (status === 'FINISHED') {
        // attendance row (only if not already there via visit-date matching)
        const { data: existing } = await sb.from('attended_matches')
          .select('id').eq('user_id', me.id).eq('match_id', plan.match_id).maybeSingle()
        let rowId = existing?.id
        if (!rowId) {
          const { data: made } = await sb.from('attended_matches').insert({
            user_id: me.id,
            ground_id: null,
            match_id: plan.match_id,
            match_date: m.utcDate,
            home_team: m.homeTeam?.name || plan.home_team,
            away_team: m.awayTeam?.name || plan.away_team,
            home_goals: hg,
            away_goals: ag,
            competition: plan.competition,
            scorers_json: (j.goals || []).map(g => ({
              player: g.scorer?.name || 'Unknown',
              team_side: g.team?.id === m.homeTeam?.id ? 'home' : 'away',
              minute: g.minute ?? null,
              penalty: /penalty/i.test(g.type || ''),
              own_goal: g.ownGoal === true
            }))
          }).select('id').single()
          rowId = made?.id
        }
        if (rowId && j.goals?.length) {
          await sb.from('goal_events').upsert(
            j.goals.map(g => ({
              user_id: me.id,
              match_row_id: rowId,
              player: g.scorer?.name || 'Unknown',
              team_side: g.team?.id === m.homeTeam?.id ? 'home' : 'away',
              minute: g.minute ?? null,
              penalty: /penalty/i.test(g.type || ''),
              own_goal: g.ownGoal === true
            })),
            { onConflict: 'match_row_id,player,minute', ignoreDuplicates: true })
        }
        done++
      }
    } catch { /* network/quota hiccup: leave unsynced, retried next time */ }
    await new Promise(r => setTimeout(r, 350))
  }
  if (done) window.dispatchEvent(new CustomEvent('gh:attendance-changed'))
  return { synced: done }
}
