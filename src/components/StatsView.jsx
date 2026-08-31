import React, { useEffect, useMemo, useState } from 'react'
import { byId, fmt, initials, slug } from '../lib/util.js'
import { sb } from '../lib/supabase.js'
import { hasFootballKey, syncAttendance, syncPlans } from '../lib/football.js'

// The Statistics page: what your groundhopping has actually witnessed.
// Everything here derives from attended_matches + goal_events, which are
// filled automatically when a visit date matches a finished home fixture.
export default function StatsView ({ me, visited }) {
  const [state, setState] = useState({ loading: true })
  const [syncing, setSyncing] = useState(false)

  async function load () {
    setState({ loading: true })
    try {
      const [att, goals, plans] = await Promise.all([
        sb.from('attended_matches').select('*').eq('user_id', me.id).order('match_date', { ascending: false }),
        sb.from('goal_events').select('*').eq('user_id', me.id),
        sb.from('match_plans').select('*').eq('user_id', me.id).order('match_date', { ascending: false })
      ])
      // PostgREST signals a missing table with code 42P01 / an HTTP 404-ish
      // relation error. Translate that into something actionable.
      const missing = [att.error, goals.error].find(e =>
        e && (/does not exist|schema cache|404|PGRST205|42P01/i.test(e.message || '') || e.code === '42P01'))
      if (missing) {
        setState({
          loading: false,
          needsMigration: true,
          raw: missing.message
        })
        return
      }
      if (att.error) throw att.error
      if (goals.error) throw goals.error
      setState({ loading: false,
        attended: att.data || [],
        goals: goals.data || [],
        plans: plans?.data || [] })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }
  useEffect(() => { load() }, [me.id])
  useEffect(() => {
    const h = () => load()
    window.addEventListener('gh:attendance-changed', h)
    return () => window.removeEventListener('gh:attendance-changed', h)
  }, [me.id])

  // ------------------------------------------------------------- syncing --
  // Re-match every visit against fixtures. Idempotent: upserts on
  // (user_id, match_id), so running it twice changes nothing.
  async function syncAll () {
    setSyncing(true)
    try {
      let found = 0
      // Manual "re-check" always bypasses the fixture caches — otherwise a
      // 6h-stale fixtures row can mask a match that finished after the row
      // was written (e.g. today's PL game not yet in a warm cache).
      const res = await syncAttendance(me, visited, { skipCache: true })
      found = res.found

      // Also fold in any Attend-button plans that have finished since the
      // Fixtures page was last opened — otherwise they'd sit unsynced until
      // the user next visited that tab.
      const plansRes = await syncPlans(me).catch(() => ({ synced: 0 }))
      found += plansRes.synced || 0

      // Pull scorer details for any attended match that lacks them yet.
      const { data: missing } = await sb.from('attended_matches')
        .select('*').eq('user_id', me.id).is('scorers_json', null)
      for (const row of (missing || []).slice(0, 25)) {   // stay inside rate limits
        try {
          const j = await fetch(`/fdapi/v4/matches/${row.match_id}`)
          if (!j.ok) continue
          const raw = await j.json()
          // v4 returns the match at the root; older shape was { match: {...} }.
          const full = raw.match || raw
          const goals = (raw.goals || full.goals || []).map(g => ({
            player: g.scorer?.name || 'Unknown',
            team_side: g.team?.id === full.homeTeam?.id ? 'home' : 'away',
            minute: g.minute ?? null,
            penalty: /penalty/i.test(g.type || '') || undefined,
            own_goal: g.ownGoal === true || undefined
          }))
          await sb.from('attended_matches').update({ scorers_json: goals }).eq('id', row.id)
          if (goals.length) {
            await sb.from('goal_events').upsert(
              goals.map(g => ({
                user_id: me.id, match_row_id: row.id,
                player: g.player, team_side: g.team_side,
                minute: g.minute ?? null,
                penalty: !!g.penalty, own_goal: !!g.own_goal
              })),
              { onConflict: 'match_row_id,player,minute' })
          }
        } catch { /* leave for next run */ }
      }
      await load()
      if (found === 0 && !(missing || []).length) {
        // nothing new — surface why
        alert('No matches could be matched to your visit dates. Auto-matching needs a finished HOME fixture of the club on exactly the day you recorded visiting.')
      }
    } finally {
      setSyncing(false)
    }
  }

  // ------------------------------------------------------------ analysis --
  const stats = useMemo(() => {
    const attended = state.attended || []
    const goals = state.goals || []

    const totalGoals = attended.reduce((a, m) => a + (m.home_goals || 0) + (m.away_goals || 0), 0)
    const homeTeamGoals = attended.reduce((a, m) => a + (m.home_goals || 0), 0)
    const awayTeamGoals = attended.reduce((a, m) => a + (m.away_goals || 0), 0)

    const scorers = {}
    goals.forEach(g => {
      const k = g.player
      scorers[k] = (scorers[k] || 0) + 1
    })
    const topScorers = Object.entries(scorers).sort((a, b) => b[1] - a[1])

    const groundsSet = new Set(attended.map(m => m.ground_id))
    const comps = {}
    attended.forEach(m => { comps[m.competition] = (comps[m.competition] || 0) + 1 })

    return { attended, goals, totalGoals, homeTeamGoals, awayTeamGoals, topScorers, groundsSet, comps }
  }, [state])

  if (state.loading) {
    return <section className="view"><div className="empty"><strong>Counting…</strong>Totting up your witnessed football.</div></section>
  }

  if (state.needsMigration) {
    return (
      <section className="view">
        <div className="empty">
          <strong>One database step is missing</strong>
          The statistics tables don't exist yet. Open the Supabase dashboard →
          <b> SQL Editor</b> → paste in
          <code> groundhopper-app/supabase/migration_ground_info.sql</code> → Run.
          Then come back here — no restart needed.
        </div>
      </section>
    )
  }

  if (state.error) {
    return (
      <section className="view">
        <div className="empty">
          <strong>Statistics aren't loading</strong>
          {state.error}
          {!hasFootballKey() && <> If you haven't added a VITE_FOOTBALL_DATA_KEY to .env yet, auto-tracking stays off — that's fine, everything else still works.</>}
        </div>
      </section>
    )
  }

  const s = stats
  const nVisited = Object.keys(visited).length

  return (
    <section className="view">
      <div className="passport-head">
        <div className="avatar">{initials(me.display_name)}</div>
        <div style={{ minWidth: 0 }}>
          <h2>My Matchday Stats</h2>
          <div className="since">Every goal and game behind your {nVisited} tick{plural(nVisited)}</div>
        </div>
        <div className="passport-actions">
          <button className="btn" onClick={syncAll} disabled={syncing || !hasFootballKey()}>
            {syncing ? 'Matching…' : 'Re-check my visits'}
          </button>
        </div>
      </div>

      {!hasFootballKey() && (
        <div className="card privacy">
          <div className="eyebrow">Auto-tracking is one key away</div>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            Add a free football-data.org key as <code>VITE_FOOTBALL_DATA_KEY</code> in <code>.env</code>,
            then press <b>Re-check my visits</b>. Every visit that lands on a covered home fixture
            fills these numbers in automatically.
          </p>
        </div>
      )}

      {(state.plans || []).length > 0 && (
        <details className="card privacy" style={{ marginBottom: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>
            Attend-plans diagnostic ({state.plans.length})
          </summary>
          <table style={{ width: '100%', fontSize: 12, marginTop: 8, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ textAlign: 'left', padding: 4 }}>Match</th>
              <th style={{ textAlign: 'left', padding: 4 }}>Date</th>
              <th style={{ textAlign: 'left', padding: 4 }}>Status</th>
              <th style={{ textAlign: 'left', padding: 4 }}>Score</th>
              <th style={{ textAlign: 'left', padding: 4 }}>Synced</th>
              <th style={{ textAlign: 'left', padding: 4 }}>Match&nbsp;ID</th>
            </tr></thead>
            <tbody>
              {state.plans.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: 4 }}>{p.home_team} v {p.away_team}</td>
                  <td style={{ padding: 4 }}>{p.match_date?.slice(0, 10)}</td>
                  <td style={{ padding: 4 }}>{p.status || '—'}</td>
                  <td style={{ padding: 4 }}>{p.home_goals ?? '—'}–{p.away_goals ?? '—'}</td>
                  <td style={{ padding: 4 }}>{p.synced ? '✓' : '✗'}</td>
                  <td style={{ padding: 4, fontFamily: 'monospace' }}>{p.match_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <div className="stats">
        <Big label="Matches attended" v={fmt(s.attended.length)} />
        <Big label="Goals witnessed" v={fmt(s.totalGoals)} accent />
        <Big label="Home team goals" v={fmt(s.homeTeamGoals)} />
        <Big label="Away team goals" v={fmt(s.awayTeamGoals)} />
        <Big label="Players seen score" v={fmt(s.topScorers.length)} />
        <Big label="Goals per game" v={s.attended.length ? (s.totalGoals / s.attended.length).toFixed(1) : '—'} />
      </div>

      <div className="section-title"><h2>Players you've seen score</h2><span className="n">{s.goals.length} goals</span></div>
      {s.topScorers.length ? (
        <ul className="scorer-list">
          {s.topScorers.slice(0, 30).map(([name, count]) => (
            <li key={name} className="scorer">
              <span className="avatar sm">{initials(name)}</span>
              <span className="scorer-name">{name}</span>
              <span className="bar"><i style={{ width: Math.max(6, count / s.topScorers[0][1] * 100) + '%' }} /></span>
              <span className="rv mono">{count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">
          No scorers recorded yet. They fill in automatically when "Re-check my visits"
          finds your attended matches — or use the button on a ground's page.
        </p>
      )}

      <div className="section-title"><h2>Match-by-match</h2><span className="n">{s.attended.length}</span></div>
      {s.attended.length ? (
        <div className="fx-table">
          {s.attended.map(m => {
            const g = byId[m.ground_id]
            return (
              <div key={m.id} className={'fx done'}>
                <span className="fx-date">{m.match_date ? new Date(m.match_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : ''}</span>
                <span className="fx-teams">{m.home_team} v {m.away_team}</span>
                <span className="fx-score mono">{m.home_goals ?? '-'}–{m.away_goals ?? '-'}</span>
                {g && <span className="place-tags">{g.name}</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="hint">
          Nothing here yet. Tick off a ground on the day your club plays at home, then
          press <b>Re-check my visits</b>.
        </p>
      )}
    </section>
  )
}

function Big ({ label, v, accent }) {
  return (
    <div className={'stat' + (accent ? ' accent' : '')}>
      <div className="v">{v}</div><div className="k eyebrow">{label}</div>
    </div>
  )
}

const plural = n => n === 1 ? '' : 's'
