import React, { useEffect, useState } from 'react'
import { getGroundPlaces, nearestStations, getLiveDepartures, getWalkRoute, plannerLinks, gmapsDir } from '../lib/places.js'

// Transport tab: nearest stations + lines served, live departures where
// available (TfL needs no key), walking time from station to turnstile.
export default function TransportPanel ({ ground }) {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let dead = false
    setState({ loading: true })
    ;(async () => {
      try {
        const places = await getGroundPlaces(ground)
        if (!places) { if (!dead) setState({ loading: false, none: true }); return }
        const stations = nearestStations(ground, places.transport, 3)

        // Walk route for the closest rail option (bus stops excluded)
        let walk = null
        if (stations[0]) {
          try {
            walk = await getWalkRoute(stations[0].lat, stations[0].lon, ground.lat, ground.lon)
          } catch { walk = null }
        }
        if (!dead) setState({ loading: false, stations, walk })
      } catch (err) {
        if (!dead) setState({ loading: false, error: err.message })
      }
    })()
    return () => { dead = true }
  }, [ground.id])

  if (state.loading) {
    return <div className="empty"><strong>Working out the journey…</strong>Finding stations and the walk to the turnstiles.</div>
  }
  if (state.error) {
    return <div className="empty"><strong>Couldn't load transport data</strong>{state.error}</div>
  }

  const stations = state.stations || []

  return (
    <>
      <h3 className="eyebrow">Getting there</h3>
      {!stations.length && (
        <p className="hint">No mapped stations within ~2 miles of this ground. Check the
          journey-planner links below — buses or coaches may serve it.</p>
      )}

      {stations.map((s, i) => (
        <StationRow key={s.id} ground={ground} station={s} first={i === 0}
          walk={i === 0 ? state.walk : null} />
      ))}

      <h3 className="eyebrow" style={{ marginTop: 16 }}>Plan a route</h3>
      <div className="planner-links">
        {plannerLinks(ground).map(l => (
          <a key={l.label} className="chip" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
        ))}
      </div>
    </>
  )
}

function StationRow ({ ground, station, first, walk }) {
  const [departures, setDepartures] = useState(null) // null = not tried
  const [open, setOpen] = useState(false)

  async function toggle () {
    const opening = !open
    setOpen(o => !o)
    if (departures === null && opening) {
      setDepartures('loading')
      const d = await getLiveDepartures(station)
      setDepartures(d || [])
    }
  }

  return (
    <div className="station">
      <div className="station-head">
        <div>
          <b>{station.name}</b>
          <span className="place-tags">
            {station.dist != null && `${(station.dist / 1000).toFixed(1)} km from the ground`}
            {walk && ` · about ${walk.minutes} min walk (${(walk.metres / 1000).toFixed(1)} km)`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" onClick={toggle}>
            {open ? 'Hide live board' : 'Live departures'}
          </button>
          {first && walk && (
            <a className="btn" target="_blank" rel="noreferrer"
              href={gmapsDir(station.lat, station.lon, ground.lat, ground.lon)}>
              Walk route
            </a>
          )}
        </div>
      </div>

      {open && (
        <div className="departures">
          {departures === 'loading' && <p className="hint">Asking for the next departures…</p>}
          {Array.isArray(departures) && !departures.length && (
            <p className="hint">
              No live departures board is available for this station here — live boards
              currently work for London stations. Try National Rail or Citymapper below.
            </p>
          )}
          {Array.isArray(departures) && departures.length > 0 && (
            <table className="dep-table">
              <tbody>
                {departures.map((d, i) => (
                  <tr key={i}>
                    <td className="mono dep-min">{d.mins}<small> min</small></td>
                    <td><b>{d.line}</b> → {d.towards}{d.platform && <span className="place-tags"> · {d.platform}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
