import React, { useEffect, useState } from 'react'
import { byId, fmt } from '../lib/util.js'
import { getGroundFootball, hasFootballKey, syncAttendance } from '../lib/football.js'
import FootballPanel from './FootballPanel.jsx'
import PlacesPanel from './PlacesPanel.jsx'
import TransportPanel from './TransportPanel.jsx'

const TABS = [
  ['overview', 'Overview'],
  ['football', 'Fixtures & Live'],
  ['pubs', 'Pubs'],
  ['food', 'Food'],
  ['hotels', 'Hotels'],
  ['transport', 'Transport']
]

export default function GroundDetail ({ id, me, visited, readOnly, onClose, onToggle, onPost }) {
  const g = byId[id]
  const [tab, setTab] = useState('overview')

  // Esc closes, like a native <dialog>
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!g) return null
  const isVisited = !!visited[id]

  return (
    <div className="dlg-scrim" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={g.name}>
        <div className="dlg-head">
          <button className="dlg-close" aria-label="Close" onClick={onClose}>×</button>
          <h2>{g.name}</h2>
          <div className="sub">{g.city}, {g.country}</div>
          <div className="dlg-tabs" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k}
                className={'dlg-tab' + (tab === k ? ' on' : '')}
                onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="dlg-body">
          {tab === 'overview' && (
            <>
              <div className="facts">
                <Fact k="Home to" v={g.club} wide />
                <Fact k="Capacity" v={fmt(g.capacity)} />
                <Fact k="Opened" v={g.opened} />
                <Fact k="Region" v={g.region} wide />
              </div>
              {g.note && <div className="note">{g.note}</div>}
              {!readOnly && (
                <div className="visit-sync">
                  <h3 className="eyebrow">Your visits here</h3>
                  {isVisited ? (
                    <p className="hint">Ticked off {visited[id]?.visited_on || '—'}.
                      Match results from that date feed your statistics automatically.</p>
                  ) : (
                    <p className="hint">Tick this ground off to have matches you attended counted
                      in your statistics.</p>
                  )}
                  {!readOnly && me && isVisited && (
                    <SyncButton me={me} ground={g} visitedOn={visited[id]?.visited_on} />
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'football' && <FootballPanel ground={g} me={me} visited={visited} />}
          {(tab === 'pubs' || tab === 'food' || tab === 'hotels') && (
            <PlacesPanel ground={g} kind={tab} />
          )}
          {tab === 'transport' && <TransportPanel ground={g} />}
        </div>

        <div className="dlg-foot">
          {!readOnly && (
            <button className="btn btn-primary" onClick={onToggle}>
              {isVisited ? 'Remove from passport' : 'Tick off as visited'}
            </button>
          )}
          {!readOnly && (
            <button className="btn" onClick={onPost}>Post about this ground</button>
          )}
        </div>
      </div>
    </div>
  )
}

function Fact ({ k, v, wide }) {
  return (
    <div className="fact"><div className="k">{k}</div><div className={'v' + (wide ? ' wide' : '')}>{v}</div></div>
  )
}

// One-click: find the club's home match on the visit date, record it, pull scorers.
function SyncButton ({ me, ground, visitedOn }) {
  const [state, setState] = useState('idle') // idle | busy | done | none | err
  const [detail, setDetail] = useState('')

  async function run () {
    setState('busy')
    try {
      const res = await syncAttendance(me, { [ground.id]: { visited_on: visitedOn } })
      if (!res.found) {
        setState('none')
        setDetail(`No finished home ${ground.club} match found on ${visitedOn}. ` +
          'If the free football-data tier does not cover this competition, attendance cannot be auto-matched.')
      } else {
        setState('done')
        setDetail('Match recorded — check the Statistics tab.')
      }
      window.dispatchEvent(new CustomEvent('gh:attendance-changed'))
    } catch (err) {
      setState('err')
      setDetail(err.message || 'Something went wrong reaching the football API.')
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn" onClick={run} disabled={state === 'busy'}>
        {state === 'busy' ? 'Checking…'
          : !hasFootballKey() ? 'Needs a football-data.org key (.env)'
          : 'Find the match I attended'}
      </button>
      {detail && <p className="hint" style={{ marginTop: 6 }}>{detail}</p>}
    </div>
  )
}
