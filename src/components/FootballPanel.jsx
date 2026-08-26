import React, { useEffect, useState } from 'react'
import { getGroundFootball, hasFootballKey } from '../lib/football.js'

  // Live score polling: 60s while a match is in play, stop when none is.
const POLL_MS = 60000

export default function FootballPanel ({ ground }) {
  const [state, setState] = useState({ loading: true })
  const liveId = state.live?.id

  async function load () {
    try {
      const d = await getGroundFootball(ground)
      setState({ loading: false, ...d })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }

  useEffect(() => { setState({ loading: true }); load() }, [ground.id])

  // Poll only while something is live; the interval clears itself otherwise.
  useEffect(() => {
    if (!liveId || !hasFootballKey()) return
    const t = setInterval(async () => {
      try {
        const d = await getGroundFootball(ground, { skipCache: true })
        if (d && d.supported) setState(s => ({ ...s, ...d }))
      } catch { /* keep last good data */ }
    }, POLL_MS)
    return () => clearInterval(t)
  }, [liveId, ground.id])

  if (state.loading) return <div className="empty"><strong>Loading…</strong>Asking football-data.org about {ground.club}.</div>

  if (state.error) {
    return (
      <div className="empty">
        <strong>Couldn't reach the football API</strong>
        {state.error}
      </div>
    )
  }

  if (!hasFootballKey()) {
    return (
      <div className="empty">
        <strong>Fixtures need one free key</strong>
        Create an account at football-data.org (free tier), then paste the key into
        <code> .env</code> as <code>VITE_FOOTBALL_DATA_KEY</code> and restart the dev server.
      </div>
    )
  }

  if (!state.linked) {
    return (
      <div className="empty">
        <strong>{ground.club} isn't in the covered leagues</strong>
        The free football-data.org tier covers major competitions only (Premier League,
        Championship playoffs aside, Bundesliga, La Liga, Serie A, Ligue 1 and others).
      </div>
    )
  }

  const { live, upcoming, results } = state

  return (
    <>
      {live ? <LiveCard m={live} ground={ground} /> : null}

      <h3 className="eyebrow" style={{ marginTop: 14 }}>Next at {ground.name}</h3>
      {upcoming.length
        ? upcoming.slice(0, 6).map(m => <MatchRow key={m.id} m={m} />)
        : <p className="hint">No upcoming home fixtures in the next 60 days.</p>}

      <h3 className="eyebrow" style={{ marginTop: 14 }}>Recent results here</h3>
      {results.length
        ? results.map(m => <MatchRow key={m.id} m={m} done />)
        : <p className="hint">No recent finished matches recorded at this stadium.</p>}
    </>
  )
}

function fmtKickoff (utc) {
  return new Date(utc).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

function LiveCard ({ m }) {
  const minute = m.minute ?? ''
  return (
    <div className="livewrap">
      <span className="live-dot" aria-hidden="true" />
      <b>LIVE</b> · {m.homeTeam.shortName || m.homeTeam.name}&nbsp;
      <span className="mono livetally">{m.score.fullTime.home ?? 0}–{m.score.fullTime.away ?? 0}</span>&nbsp;
      {m.awayTeam.shortName || m.awayTeam.name}
      {minute ? <span className="mono"> · {minute}'</span> : <span> · in play</span>}
    </div>
  )
}

function MatchRow ({ m, done }) {
  const h = m.homeTeam.shortName || m.homeTeam.name
  const a = m.awayTeam.shortName || m.awayTeam.name
  const ft = m.score.fullTime
  const started = ['IN_PLAY', 'FINISHED', 'AWARDED'].includes(m.status)
  return (
    <div className={'fx' + (done ? ' done' : '')}>
      <span className="fx-date">{fmtKickoff(m.utcDate)}</span>
      <span className="fx-teams">{h} v {a}</span>
      <span className="fx-score mono">
        {started ? `${ft.home ?? 0}–${ft.away ?? 0}` : '—'}
      </span>
      {m.status === 'IN_PLAY' && <span className="fxtag">LIVE</span>}
    </div>
  )
}
