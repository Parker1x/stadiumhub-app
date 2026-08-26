import React, { useEffect, useMemo, useState } from 'react'
import { GROUNDS, REGIONS, byId, fmt } from '../lib/util.js'

export default function GroundsView ({ visited, readOnly, onToggle, onOpen }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')

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
