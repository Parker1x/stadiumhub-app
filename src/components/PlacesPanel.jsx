import React, { useEffect, useState } from 'react'
import { getGroundPlaces, gmaps, nearestStations } from '../lib/places.js'

// Pubs / Food / Hotels within ~1 mile of the ground, from OpenStreetMap.
export default function PlacesPanel ({ ground, kind }) {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let dead = false
    setState({ loading: true })
    ;(async () => {
      try {
        const p = await getGroundPlaces(ground)
        if (!dead) setState({ loading: false, places: p })
      } catch (err) {
        if (!dead) setState({ loading: false, error: err.message })
      }
    })()
    return () => { dead = true }
  }, [ground.id])

  if (state.loading) {
    return <div className="empty"><strong>Looking around the neighbourhood…</strong>Querying OpenStreetMap for what's within a mile of {ground.name}.</div>
  }
  if (state.error || !state.places) {
    return (
      <div className="empty">
        <strong>OpenStreetMap didn't answer</strong>
        {state.error || 'No coordinates for this ground.'} Try again in a moment — Overpass rate-limits bursts.
      </div>
    )
  }

  const { pubs, restaurants, hotels, transport } = state.places

  if (kind === 'pubs') return <List items={pubs} empty="No mapped pubs within a mile — rare!" kind={kind} />
  if (kind === 'hotels') return <List items={hotels} empty="No mapped hotels within a mile." kind={kind} />
  if (kind === 'food') {
    return (
      <>
        <List items={restaurants} empty="No mapped restaurants within a mile." kind={kind} />
        <p className="hint">
          Data © OpenStreetMap contributors — coverage near grounds is community-mapped, so
          quality varies. Tap any name for Google Maps reviews, photos and directions.
        </p>
      </>
    )
  }
  return null
}

function List ({ items, empty, kind }) {
  if (!items.length) return <div className="empty"><strong>Nothing found</strong>{empty}</div>
  const sorted = [...items].sort((a, b) => (a.name || 'zz').localeCompare(b.name || 'zz'))
  return (
    <ul className="place-list">
      {sorted.map(p => (
        <li key={p.id} className="place">
          <span className="place-icon" aria-hidden="true">{p.icon}</span>
          <span className="place-main">
            {p.name
              ? <a href={gmaps(p.name, p.lat, p.lon)} target="_blank" rel="noreferrer">{p.name}</a>
              : <span className="place-unnamed">{kind === 'pubs' ? 'Unnamed pub' : kind === 'hotels' ? 'Unnamed hotel' : 'Unnamed eatery'}</span>}
            <span className="place-tags">
              {[p.opening && '⏰ ' + p.opening, p.realAle && 'real ale',
                p.veggie && 'veggie options', p.outside && 'outdoor seating']
                .filter(Boolean).join(' · ')}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function TransportSummaryInline ({ ground, places }) {
  const st = nearestStations(ground, places.transport, 1)[0]
  return st ? <span>Nearest station: <b>{st.name}</b></span> : null
}
