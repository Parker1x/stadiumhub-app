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

async function cached (kind, key, ttlMs, fetcher, { skipCache = false } = {}) {
  const k = kind + ':' + key
  if (!skipCache && mem.has(k)) return mem.get(k)

  if (!skipCache) {
    const cutoff = new Date(Date.now() - ttlMs).toISOString()
    const { data: row } = await sb.from('ground_cache')
      .select('payload, fetched_at').eq('cache_key', k)
      .gte('fetched_at', cutoff).maybeSingle()
    if (row) { mem.set(k, row.payload); return row.payload }
  }

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
// The free tier allows 10 requests/minute. Every API call passes through
// here: max 10 per rolling 60s, anything beyond waits its turn. Matches the
// exact free-tier ceiling so all 10 covered competitions load in one burst.
const rate = { stamps: [] }
async function rateGate () {
  for (;;) {
    const now = Date.now()
    rate.stamps = rate.stamps.filter(t => now - t < 60000)
    if (rate.stamps.length < 10) { rate.stamps.push(now); return }
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
// PL + Championship + top-5 European + Champions League + a few more.
export const FIXTURE_COMPS = ['PL', 'ELC', 'CL', 'BL1', 'PD', 'SA', 'FL1', 'DED', 'PPL', 'BSA']

// All matches of one competition in a date range. Cached 5 minutes: short
// enough that live scores move, long enough that browsing days is free.
export async function getWindowMatches (comp, fromStr, toStr, { skipCache = false } = {}) {
  const key = `${comp}|${fromStr}|${toStr}`
  return cached('fdwin', key, 5 * 60e3, async () => {
    const j = await fdGet(`/competitions/${comp}/matches?dateFrom=${fromStr}&dateTo=${toStr}`)
    return j.matches || []
  }, { skipCache })
}

// All matches across every covered competition in a date range.
//
// We used to hit /matches?dateFrom=…&dateTo=… (a single call), but the free
// tier's aggregate endpoint is unreliable — it returns count:0 for many dates
// even when per-competition queries have real fixtures (e.g. it missed
// Crystal Palace v Man City on 2026-08-28). Per-comp queries in parallel are
// the trustworthy way. The rate gate spaces them inside the 10 req/min limit.
//
// TheSportsDB is merged in alongside for competitions the free tier omits
// (EFL Cup, FA Cup, League 1/2, Scottish leagues).
export async function getFixturesForRange (fromStr, toStr, { skipCache = false } = {}) {
  const key = `${fromStr}|${toStr}`
  const [fdMatches, sdbMatches] = await Promise.all([
    cached('fdall', key, 5 * 60e3, async () => {
      const results = await Promise.all(FIXTURE_COMPS.map(comp =>
        fdGet(`/competitions/${comp}/matches?dateFrom=${fromStr}&dateTo=${toStr}`)
          .then(j => j.matches || [])
          .catch(() => [])
      ))
      return results.flat()
    }, { skipCache }).catch(() => []),
    cached('sdball', key, 5 * 60e3,
      () => getSportsDbMatchesInRange(fromStr, toStr),
      { skipCache }).catch(() => [])
  ])

  return { matches: [...fdMatches, ...sdbMatches], skipped: [] }
}

// -------------------------------------------------------- TheSportsDB ------
// Free JSON API — no key needed, direct browser calls (CORS is fine). Covers
// the English/Scottish competitions football-data.org's free tier omits.
// League IDs verified against /lookupleague.php.
const SPORTSDB_LEAGUE_IDS = [
  4570, // EFL Cup (Carabao Cup)
  4482, // FA Cup
  4396, // English League 1
  4397, // English League 2
  4330, // Scottish Premier League
  4395, // Scottish Championship
  4669  // Scottish League 1
]

async function getSportsDbMatchesInRange (fromStr, toStr) {
  const days = daysBetween(fromStr, toStr)
  const buckets = await Promise.all(days.flatMap(d =>
    SPORTSDB_LEAGUE_IDS.map(id => sdbEventsForDay(d, id).catch(() => []))
  ))
  return buckets.flat().map(normaliseSdbEvent).filter(Boolean)
}

async function sdbEventsForDay (dateStr, leagueId) {
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Soccer&l=${leagueId}`
  const res = await fetch(url)
  if (!res.ok) return []
  const j = await res.json().catch(() => ({}))
  return j.events || []
}

function daysBetween (fromStr, toStr) {
  const out = []
  const from = new Date(fromStr + 'T00:00:00Z')
  const to = new Date(toStr + 'T00:00:00Z')
  for (let d = from; d <= to; d = new Date(d.getTime() + 864e5)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

// Convert TheSportsDB event → football-data-shaped match so FixturesView can
// render it with zero UI changes. IDs prefixed 'sdb:' to avoid colliding with
// football-data's numeric IDs and so syncPlans can skip them.
function normaliseSdbEvent (e) {
  if (!e || !e.strHomeTeam || !e.strAwayTeam) return null
  const iso = e.strTimestamp
    ? (e.strTimestamp.endsWith('Z') ? e.strTimestamp : e.strTimestamp + 'Z')
    : (e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime.slice(0, 8)}Z` : null)
  if (!iso) return null
  return {
    id: 'sdb:' + e.idEvent,
    utcDate: iso,
    status: mapSdbStatus(e.strStatus, iso),
    competition: {
      name: e.strLeague,
      code: 'SDB' + e.idLeague,
      emblem: e.strLeagueBadge || null
    },
    homeTeam: { id: e.idHomeTeam, name: e.strHomeTeam, shortName: e.strHomeTeam },
    awayTeam: { id: e.idAwayTeam, name: e.strAwayTeam, shortName: e.strAwayTeam },
    score: {
      fullTime: {
        home: e.intHomeScore == null ? null : Number(e.intHomeScore),
        away: e.intAwayScore == null ? null : Number(e.intAwayScore)
      }
    }
  }
}

function mapSdbStatus (raw, iso) {
  const s = (raw || '').toLowerCase()
  if (/(ft|match finished|full time|finished|aet|pen)/.test(s)) return 'FINISHED'
  if (/(1h|2h|ht|half time|et|in play|live)/.test(s)) return 'IN_PLAY'
  if (/postp|cancel|abandon/.test(s)) return 'POSTPONED'
  // No status yet: infer from kickoff time
  const t = Date.parse(iso)
  if (Number.isFinite(t) && t < Date.now() - 3 * 3600e3) return 'FINISHED'
  return 'TIMED'
}

// TheSportsDB counterpart to the football-data path in syncPlans below. Their
// free tier exposes /lookuptimeline.php with per-goal scorer + minute, so we
// get "goals seen" and "players seen scoring" for EFL Cup / L1 / L2 / Scottish
// matches without a paid API.
async function syncSdbPlan (me, plan) {
  const eventId = String(plan.match_id).slice(4) // strip 'sdb:'
  const res = await fetch(`https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${eventId}`)
  if (!res.ok) return false
  const e = (await res.json().catch(() => ({})))?.events?.[0]
  if (!e) return false

  const iso = e.strTimestamp
    ? (e.strTimestamp.endsWith('Z') ? e.strTimestamp : e.strTimestamp + 'Z')
    : (e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime.slice(0, 8)}Z` : plan.match_date)
  const status = mapSdbStatus(e.strStatus, iso)
  const hg = e.intHomeScore == null ? null : Number(e.intHomeScore)
  const ag = e.intAwayScore == null ? null : Number(e.intAwayScore)

  await sb.from('match_plans').update({
    home_goals: hg, away_goals: ag, status, synced: status === 'FINISHED'
  }).eq('id', plan.id)

  if (status !== 'FINISHED') return false

  const goals = await fetchSdbGoals(eventId, e.idHomeTeam)

  const { data: existing } = await sb.from('attended_matches')
    .select('id').eq('user_id', me.id).eq('match_id', plan.match_id).maybeSingle()
  let rowId = existing?.id
  if (!rowId) {
    const { data: made } = await sb.from('attended_matches').insert({
      user_id: me.id,
      ground_id: null,
      match_id: plan.match_id,
      match_date: iso,
      home_team: e.strHomeTeam || plan.home_team,
      away_team: e.strAwayTeam || plan.away_team,
      home_goals: hg,
      away_goals: ag,
      competition: plan.competition,
      scorers_json: goals
    }).select('id').single()
    rowId = made?.id
  }
  if (rowId && goals.length) {
    await sb.from('goal_events').upsert(
      goals.map(g => ({ user_id: me.id, match_row_id: rowId, ...g })),
      { onConflict: 'match_row_id,player,minute', ignoreDuplicates: true })
  }
  return true
}

async function fetchSdbGoals (eventId, homeTeamId) {
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/3/lookuptimeline.php?id=${eventId}`)
    if (!res.ok) return []
    const j = await res.json().catch(() => ({}))
    return (j.timeline || [])
      .filter(t => (t.strTimeline || '').toLowerCase() === 'goal')
      .map(t => ({
        player: t.strPlayer || 'Unknown',
        team_side: String(t.idTeam) === String(homeTeamId) ? 'home' : 'away',
        minute: t.intTime ? Number(t.intTime) : null,
        penalty: /penalty/i.test(t.strTimelineDetail || ''),
        own_goal: /own\s*goal/i.test(t.strTimelineDetail || '')
      }))
  } catch { return [] }
}

// Convert "I'm attending" plans into real attendance once matches finish.
// Idempotent: finished plans are flagged synced=true and never reprocessed.
export async function syncPlans (me) {
  const { data: plans, error } = await sb.from('match_plans')
    .select('*').eq('user_id', me.id).eq('synced', false)
  if (error || !plans?.length) return { synced: 0 }

  let done = 0
  for (const plan of plans) {
    // TheSportsDB matches take a different sync path (different API, no
    // per-goal scorer data on the free tier — final score only).
    if (String(plan.match_id).startsWith('sdb:')) {
      try { if (await syncSdbPlan(me, plan)) done++ } catch { /* try next time */ }
      await new Promise(r => setTimeout(r, 350))
      continue
    }
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
