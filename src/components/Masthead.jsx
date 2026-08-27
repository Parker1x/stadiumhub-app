import React from 'react'
import { Arch } from './AuthGate.jsx'

export default function Masthead ({ tallyN, tallyT, onSignOut }) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="masthead-left">
          <div className="tally"><b>{tallyN}</b>/<span>{tallyT}</span> grounds</div>
        </div>
        <div className="masthead-center">
          <div className="wordmark">
            <Arch />
            <span className="wm-text">StadiumHub</span>
          </div>
        </div>
        <div className="masthead-right">
          <button className="btn signout" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </header>
  )
}

export function Turnstiles ({ view, onView, counts }) {
  const tabs = [
    ['fixtures', 'Fixtures', ''],
    ['grounds', 'Grounds', counts.grounds],
    ['map', 'Map', counts.map],
    ['feed', 'Matchday', counts.feed],
    ['passport', 'My Profile', counts.passport],
    ['stats', 'Statistics', '']
  ]
  return (
    <nav className="turnstiles">
      <div className="turnstiles-inner" role="tablist" aria-label="Sections">
        {tabs.map(([k, label, n]) => (
          <button key={k} className="turnstile" role="tab"
            aria-selected={view === k} data-view={k}
            onClick={() => onView(k)}>
            {label}<span className="n">{n || ''}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
