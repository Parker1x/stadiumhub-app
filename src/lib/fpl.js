// Fantasy Premier League public API client.
// Uncapped, no key required — the only free source we've found that gives
// live match stats (goals, assists, cards, saves aggregated per team) during
// Premier League matches. Coverage: PL only. It does NOT publish lineups.
//
// Browser calls go through /fplapi (nginx proxy on the VPS) because the
// upstream doesn't set CORS headers.

const mem = new Map()

async function cached (key, ttlMs, fetcher) {
  const hit = mem.get(key)
  if (hit && Date.now() - hit.t < ttlMs) return hit.v
  const v = await fetcher()
  mem.set(key, { v, t: Date.now() })
  return v
}

async function fplGet (path) {
  const res = await fetch('/fplapi' + path)
  if (!res.ok) throw new Error(`fpl ${res.status}`)
  return res.json()
}

// Teams + current gameweek — barely changes, cache 24 hours.
export async function getFplBootstrap () {
  return cached('bootstrap', 24 * 3600e3, () => fplGet('/bootstrap-static/'))
}

// Fixtures for one gameweek incl. per-player stats after kickoff. Short TTL
// so live-polling picks up new goals/cards within a minute.
export async function getFplFixtures (event) {
  return cached('fx:' + event, 60e3, () => fplGet(`/fixtures/?event=${event}`))
}

// Match a football-data.org PL match to an FPL fixture, by TLA + kickoff.
export async function findFplFixture (match) {
  if (match?.competition?.code !== 'PL') return null
  const boot = await getFplBootstrap().catch(() => null)
  if (!boot) return null

  const teamsById = new Map(boot.teams.map(t => [t.id, t]))
  const tlaToId = new Map(boot.teams.map(t => [t.short_name, t.id]))
  const homeId = tlaToId.get(match.homeTeam?.tla)
  const awayId = tlaToId.get(match.awayTeam?.tla)
  if (!homeId || !awayId) return null

  // Pick the gameweek closest to the match kickoff. Bootstrap's `events`
  // carry a `deadline_time` per gameweek; the gameweek is the one whose
  // deadline is just before the match.
  const kick = new Date(match.utcDate).getTime()
  const events = boot.events || []
  const event = events.reduce((best, e) => {
    const dl = Date.parse(e.deadline_time)
    if (!Number.isFinite(dl) || dl > kick) return best
    return (!best || dl > Date.parse(best.deadline_time)) ? e : best
  }, null)
  if (!event) return null

  const fixtures = await getFplFixtures(event.id).catch(() => null)
  if (!Array.isArray(fixtures)) return null
  const fx = fixtures.find(f => f.team_h === homeId && f.team_a === awayId)
  return fx ? { ...fx, _teams: teamsById } : null
}

// Reduce FPL fixture.stats to team totals for the identifiers we want to show.
// Returns null when the match hasn't started yet (stats array is empty).
export function aggregateFplStats (fx) {
  if (!fx?.stats?.length) return null
  const wanted = ['goals_scored', 'assists', 'yellow_cards', 'red_cards',
    'saves', 'penalties_missed', 'penalties_saved', 'own_goals', 'bonus']
  const out = { home: {}, away: {}, started: !!fx.started, minutes: fx.minutes ?? null }
  for (const s of fx.stats) {
    if (!wanted.includes(s.identifier)) continue
    out.home[s.identifier] = (s.h || []).reduce((a, x) => a + (x.value || 0), 0)
    out.away[s.identifier] = (s.a || []).reduce((a, x) => a + (x.value || 0), 0)
  }
  return out
}

// Convenience: fetch + aggregate in one call. Used by the match preview modal
// on open and on the live-poll interval.
export async function getFplMatchStats (match) {
  const fx = await findFplFixture(match).catch(() => null)
  if (!fx) return null
  const stats = aggregateFplStats(fx)
  return stats ? { ...stats, fixtureId: fx.id } : null
}
