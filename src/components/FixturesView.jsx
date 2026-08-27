import React, { useEffect, useMemo, useState } from 'react'
import { getFixturesForRange, syncPlans, hasFootballKey, FIXTURE_COMPS } from '../lib/football.js'
import { sb } from '../lib/supabase.js'
import { toast } from '../lib/util.js'

const ymd = d => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const today = () => ymd(new Date())

function fmtKick (utc) {
  return new Date(utc).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
const started = s => ['IN_PLAY', 'FINISHED', 'AWARDED', 'PAUSED'].includes(s)

export default function FixturesView ({ me }) {
  // which day is selected: offset from today (-1, 0, +1) or a picked date.
  // Persisted to ?day= / ?date= so refresh restores the same view.
  const [dayOffset, setDayOffset] = useState(() => {
    const d = new URLSearchParams(window.location.search).get('day')
    return d === 'yesterday' ? -1 : d === 'tomorrow' ? 1 : 0
  })
  const [picked, setPicked] = useState(() => {
    const d = new URLSearchParams(window.location.search).get('date')
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
  })
  const [state, setState] = useState({ loading: true })
  const [plans, setPlans] = useState({})       // match_id -> plan row
  const [syncNote, setSyncNote] = useState('')

  const day = picked || ymd(new Date(Date.now() + dayOffset * 864e5))

  // Sync current day selection to the URL so refresh keeps the same view.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (picked) { p.set('date', picked); p.delete('day') }
    else if (dayOffset === -1) { p.set('day', 'yesterday'); p.delete('date') }
    else if (dayOffset === 1) { p.set('day', 'tomorrow'); p.delete('date') }
    else { p.delete('day'); p.delete('date') }
    const qs = p.toString()
    window.history.replaceState(null, '',
      window.location.pathname + (qs ? '?' + qs : '') + window.location.hash)
  }, [dayOffset, picked])

  // load plans once
  useEffect(() => {
    if (!me) return
    ;(async () => {
      const { data } = await sb.from('match_plans').select('*').eq('user_id', me.id)
      const map = {}
      ;(data || []).forEach(p => { map[p.match_id] = p })
      setPlans(map)
    })()
  }, [me?.id])

  // fetch fixtures for the selected day; retries once automatically if the
  // rate gate had to queue requests into the next minute window
  async function load ({ skipCache = false } = {}) {
    if (!hasFootballKey()) { setState({ loading: false, noKey: true }); return }
    setState({ loading: true })
    try {
      let { matches, skipped } = await getFixturesForRange(day, day, { skipCache })
      if (skipped.length) {
        // second pass: the gate has spaced requests out by now
        const again = await getFixturesForRange(day, day, {})
        matches = matches.concat(again.matches)
        skipped = again.skipped
      }
      setState({ loading: false, matches, skipped })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }
  useEffect(() => { load() }, [day])

  // If any league was rate-limited, retry automatically once the minute rolls
  // over — the user shouldn't have to babysit the button.
  useEffect(() => {
    if (!state.skipped?.length) return
    const t = setTimeout(() => load(), 65000)
    return () => clearTimeout(t)
  }, [state.skipped?.length, day])

  // live polling: refresh today's matches every 60s while anything is in play.
  // Any attend-plan on a live/just-finished match also gets synced so stats
  // catch the final score without waiting for the next mount.
  const anyLive = (state.matches || []).some(m => m.status === 'IN_PLAY')
  useEffect(() => {
    if (!anyLive || picked || dayOffset !== 0) return
    const t = setInterval(() => {
      load({ skipCache: true })
      if (me) syncPlans(me).catch(() => {})
    }, 60000)
    return () => clearInterval(t)
  }, [anyLive, picked, dayOffset, me?.id])

  // fold finished plans into stats (runs on open; cheap when nothing to do)
  useEffect(() => {
    if (!me || !hasFootballKey()) return
    syncPlans(me).then(r => {
      if (r.synced) {
        setSyncNote(`${r.synced} finished match${r.synced === 1 ? '' : 'es'} added to your stats`)
        setTimeout(() => setSyncNote(''), 6000)
      }
    })
  }, [me?.id])

  async function toggleAttend (m) {
    if (!me) return
    const existing = plans[m.id]
    if (existing) {
      const next = { ...plans }
      delete next[m.id]
      setPlans(next)
      const { error } = await sb.from('match_plans').delete().eq('id', existing.id)
      if (error) { setPlans(plans); return toast('Could not undo that — try again') }
      toast('No longer attending')
    } else {
      const row = {
        user_id: me.id, match_id: String(m.id), match_date: m.utcDate,
        home_team: m.homeTeam?.name || '', away_team: m.awayTeam?.name || '',
        competition: m.competition?.code || ''
      }
      setPlans(p => ({ ...p, [m.id]: row }))
      const { data, error } = await sb.from('match_plans').insert(row).select().single()
      if (error) {
        setPlans(p => { const n = { ...p }; delete n[m.id]; return n })
        return toast('Could not save that — try again')
      }
      setPlans(p => ({ ...p, [m.id]: data }))
      const past = ['FINISHED', 'AWARDED'].includes(m.status)
      toast(past
        ? 'Marked as attended — folding into your stats…'
        : "You're attending — goals will count towards your stats")
      if (past) syncPlans(me).catch(() => {})
    }
  }

  // group by competition, FOTMOB style
  const grouped = useMemo(() => {
    const g = new Map()
    for (const m of state.matches || []) {
      const cname = m.competition?.name || 'Other'
      if (!g.has(cname)) g.set(cname, { emblem: m.competition?.emblem, matches: [] })
      g.get(cname).matches.push(m)
    }
    for (const { matches } of g.values()) {
      matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
    }
    return [...g.entries()]
  }, [state.matches])

  if (state.noKey) {
    return (
      <section className="view">
        <div className="empty">
          <strong>Fixtures need your free football-data.org key</strong>
          Add it to <code>.env</code> as <code>VITE_FOOTBALL_DATA_KEY</code> and restart —
          see the README in the project folder.
        </div>
      </section>
    )
  }
  if (state.error) {
    return <section className="view"><div className="empty"><strong>Couldn't load fixtures</strong>{state.error}</div></section>
  }

  const dayLabel = picked ? new Date(picked + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : dayOffset === -1 ? 'Yesterday' : dayOffset === 0 ? 'Today' : 'Tomorrow'

  return (
    <section className="view">
      <div className="fx-days">
        {[-1, 0, 1].map(off => (
          <button key={off}
            className={'chip' + (!picked && dayOffset === off ? ' on' : '')}
            aria-pressed={!picked && dayOffset === off}
            onClick={() => { setPicked(''); setDayOffset(off) }}>
            {off === -1 ? 'Yesterday' : off === 0 ? 'Today' : 'Tomorrow'}
          </button>
        ))}
        <label className="fx-datepick">
          <input type="date" value={picked} max={ymd(new Date(Date.now() + 365 * 864e5))}
            onChange={e => setPicked(e.target.value)} aria-label="Pick a date" />
        </label>
        {anyLive && <span className="live-dot" aria-hidden="true" />}
        {anyLive && <span className="fxtag">LIVE UPDATING</span>}
      </div>

      <div className="fx-daytitle">
        <h2>{dayLabel}</h2>
        <span className="since">{new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      {syncNote && <div className="viewing">{syncNote}</div>}

      {state.loading ? (
        <div className="empty"><strong>Fetching matchday…</strong>Working through the covered leagues — first load takes ~6 seconds, after that it's instant.</div>
      ) : !grouped.length ? (
        <div className="empty">
          <strong>{state.skipped?.length ? 'Partly loaded — some leagues were rate-limited' : `No fixtures on ${dayLabel.toLowerCase()}`}</strong>
          {state.skipped?.length
            ? <>The free API tier allows 10 requests a minute and {state.skipped.length} league{state.skipped.length === 1 ? ' was' : 's were'} left out.
               <button className="btn" style={{ marginLeft: 10 }} onClick={() => load()}>Load the rest</button></>
            : ' No matches in the covered leagues that day — international breaks and summer close seasons look like this. Try another day.'}
        </div>
      ) : (
        grouped.map(([cname, { emblem, matches }]) => (
          <div key={cname} className="fx-comp">
            <div className="fx-comp-head">
              {emblem && <img src={emblem} alt="" width="18" height="18" loading="lazy" />}
              <b>{cname}</b>
            </div>
            {matches.map(m => <FixtureRow key={m.id} m={m} plan={plans[m.id]} onToggle={() => toggleAttend(m)} />)}
          </div>
        ))
      )}
    </section>
  )
}

function FixtureRow ({ m, plan, onToggle }) {
  const live = m.status === 'IN_PLAY'
  const done = ['FINISHED', 'AWARDED'].includes(m.status)
  const ft = m.score?.fullTime
  const label = done
    ? (plan ? '✓ Attended' : 'I was there')
    : (plan ? '✓ Going' : 'Attend')
  const title = done
    ? (plan ? 'Marked as attended — click to undo' : 'I was at this match')
    : (plan ? 'Attending — click to undo' : 'I am attending this match')
  return (
    <div className={'fx-row' + (live ? ' is-live' : '')}>
      <div className="fx-teams">
        <span className="fx-home">{m.homeTeam?.shortName || m.homeTeam?.name}</span>
        <span className="fx-meet mono">
          {live && <span className="fxtag">LIVE</span>}
          {done && <span className="fx-ft">FT</span>}
          {started(m.status)
            ? <span className="fx-score">{`${ft?.home ?? 0}–${ft?.away ?? 0}`}</span>
            : <span className="fx-time">{fmtKick(m.utcDate)}</span>}
        </span>
        <span className="fx-away">{m.awayTeam?.shortName || m.awayTeam?.name}</span>
      </div>
      <button className={'attend-btn' + (plan ? ' on' : '') + (done ? ' past' : '')}
        aria-pressed={!!plan}
        title={title}
        onClick={onToggle}>
        {label}
      </button>
    </div>
  )
}
