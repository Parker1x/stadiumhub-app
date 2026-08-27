import React, { useEffect, useMemo, useState } from 'react'
import { GROUNDS, REGIONS, byId, fmt } from '../lib/util.js'

const HELP_STORAGE_KEY = 'gh:groundsHelpSeen'

export default function GroundsView ({ visited, readOnly, onToggle, onOpen }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [showHelp, setShowHelp] = useState(() => {
    try { return localStorage.getItem(HELP_STORAGE_KEY) !== '1' }
    catch { return true }
  })

  // debounce the search box like the original (120ms)
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim().toLowerCase()), 120)
    return () => clearTimeout(t)
  }, [query])

  const opts = [['all', 'All'], ['todo', 'Not yet'], ['done', 'Visited'],
    ...REGIONS.map(r => ['r:' + r, r])]

  const list = useMemo(() => GROUNDS.filter(g => {
    if (filter === 'done' && !visited[g.id]) return false
    if (filter === 'todo' && visited[g.id]) return false
    if (filter.startsWith('r:') && g.region !== filter.slice(2)) return false
    if (!q) return true
    return (g.name + ' ' + g.club + ' ' + g.city + ' ' + g.country).toLowerCase().includes(q)
  }), [filter, q, visited])

  return (
    <section className="view" role="tabpanel">
      {showHelp && <GroundsHelpModal onClose={() => setShowHelp(false)} />}
      <div className="searchbar">
        <div className="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input id="search" type="search" placeholder="Search a ground, club, city or country…"
            autoComplete="off" aria-label="Search grounds"
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="filters">
          {opts.map(([v, l]) => (
            <button key={v} className="chip" aria-pressed={filter === v}
              onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="result-count">
        {fmt(list.length)} ground{list.length === 1 ? '' : 's'}
        {(q || filter !== 'all') && ` · ${fmt(GROUNDS.length)} total`}
      </div>
      <ul className="ground-list">
        {list.map(g => {
          const v = !!visited[g.id]
          return (
            <li key={g.id} className={'ground' + (v ? ' is-visited' : '')}>
              <button className="ground-open" onClick={() => onOpen(g.id)}>
                <svg className="gpin" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 22.5c0 0 7.2-7.9 7.2-13A7.2 7.2 0 1 0 4.8 9.5c0 5.1 7.2 13 7.2 13z" />
                  <circle className="dot" cx="12" cy="9.4" r="2.7" />
                </svg>
                <span className="gtext">
                  <span className="ground-name">{g.name}</span>
                  <span className="ground-meta">{g.club}<span className="sep">·</span>{g.city}, {g.country}</span>
                </span>
              </button>
              <div className="ground-cap">{fmt(g.capacity)}<small>{g.opened}</small></div>
              <button className="stamp-btn" aria-pressed={v} disabled={readOnly}
                onClick={() => onToggle(g.id)}
                aria-label={(v ? 'Remove ' : 'Mark ') + g.name + ' as visited'}>
                <span className="lbl">{readOnly ? '' : 'Tick off'}</span>
                <span className="stamp" aria-hidden="true">Been</span>
              </button>
            </li>
          )
        })}
        {!list.length && (
          <div className="empty"><strong>Nothing here</strong>Try a different search or filter.</div>
        )}
      </ul>
    </section>
  )
}

function GroundsHelpModal ({ onClose }) {
  const [dontShow, setDontShow] = useState(false)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function handleContinue () {
    if (dontShow) {
      try { localStorage.setItem(HELP_STORAGE_KEY, '1') } catch { /* ignore */ }
    }
    onClose()
  }

  return (
    <div className="help-scrim" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="help-dlg" role="dialog" aria-modal="true" aria-labelledby="ghHelpTitle">
        <div className="help-body">
          <h2 id="ghHelpTitle" className="help-title">Tap a stadium for the full picture</h2>
          <p className="help-text">
            If you need more information for each stadium such as transport routes,
            home/away team pubs, restaurants, hotels etc. Feel free to click on any stadium.
          </p>
        </div>
        <div className="help-foot">
          <label className="help-check">
            <input type="checkbox" checked={dontShow}
              onChange={e => setDontShow(e.target.checked)} />
            <span>Do not show again.</span>
          </label>
          <button className="btn help-continue" onClick={handleContinue} autoFocus>
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
