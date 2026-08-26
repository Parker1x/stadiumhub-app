import React, { useEffect, useRef, useState } from 'react'
import { GROUNDS, byId, esc } from '../lib/util.js'
import { LAND_PATHS } from '../data/mapdata.js'

const MAPW = 360, MAPH = 136
const px = lon => lon + 180, py = lat => 78 - lat
const REGION_VIEWS = [
  ['World', null], ['UK & Ireland', [-11, 49.5, 2.5, 59.8]], ['Europe', [-11, 34, 32, 62]],
  ['Africa', [-19, -36, 52, 38]], ['Asia', [25, -10, 150, 56]], ['S. America', [-82, -56, -33, 14]],
  ['N. America', [-130, 12, -60, 56]], ['Oceania', [110, -48, 179, -8]]
]

export default function MapView ({ visited, onOpen }) {
  const [view, setView] = useState({ s: 1, tx: 0, ty: 0 })
  const [showTodo, setShowTodo] = useState(true)
  const [tip, setTip] = useState(null) // { x, y, name, sub }
  const drag = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    let g = ''
    for (let lon = -150; lon <= 150; lon += 30) g += `<path class="mgrat" d="M${px(lon)} 0V${MAPH}" />`
    for (let lat = -40; lat <= 60; lat += 20) g += `<path class="mgrat" d="M0 ${py(lat)}H${MAPW}" />`
    const el = document.getElementById('mapGrat')
    if (el) el.innerHTML = g
  }, [])

  function applyZoom (mut) {
    setView(v => {
      const n = mut({ ...v })
      n.tx = Math.min(0, Math.max(-(n.s - 1) * MAPW, n.tx))
      n.ty = Math.min(0, Math.max(-(n.s - 1) * MAPH, n.ty))
      return n
    })
  }

  function zoomTo (box) {
    if (!box) return applyZoom(() => ({ s: 1, tx: 0, ty: 0 }))
    const [lo0, la0, lo1, la1] = box
    const w = Math.abs(px(lo1) - px(lo0)), h = Math.abs(py(la0) - py(la1))
    const s = Math.max(1, Math.min(16, Math.min(MAPW / w, MAPH / h) * 0.94))
    const cx = (px(lo0) + px(lo1)) / 2, cy = (py(la0) + py(la1)) / 2
    applyZoom(() => ({ s, tx: MAPW / 2 - cx * s, ty: MAPH / 2 - cy * s }))
  }

  function zoomAt (ptx, pty, f) {
    applyZoom(m => {
      const ns = Math.max(1, Math.min(16, m.s * f))
      m.tx = ptx - (ptx - m.tx) * (ns / m.s)
      m.ty = pty - (pty - m.ty) * (ns / m.s)
      m.s = ns
      return m
    })
  }

  function mapPoint (e) {
    const r = wrapRef.current.querySelector('svg').getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width * MAPW, y: (e.clientY - r.top) / r.height * MAPH }
  }

  const placed = GROUNDS.filter(g => g.lat !== null)
  const done = placed.filter(g => visited[g.id])
  const todo = showTodo ? placed.filter(g => !visited[g.id]) : []
  const k = 1 / view.s

  return (
    <section className="view" role="tabpanel">
      <div className="map-bar"><div className="eyebrow">Jump to</div>
        <div className="map-zooms">
          {REGION_VIEWS.map(([l, box], i) => (
            <button key={l} className="chip" aria-pressed={i === 0 && view.s === 1}
              onClick={() => zoomTo(box)}>{l}</button>
          ))}
        </div>
      </div>
      <div className={'map-wrap' + (drag.current ? ' dragging' : '')} ref={wrapRef}
        onWheel={e => { e.preventDefault(); const p = mapPoint(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.18 : 1 / 1.18) }}
        onPointerDown={e => {
          if (e.target.closest('.mapbtn')) return
          const marker = e.target.closest('[data-mid]')
          drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false, mid: marker?.dataset.mid || null }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={e => {
          if (drag.current) {
            const r = wrapRef.current.querySelector('svg').getBoundingClientRect()
            if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 3) drag.current.moved = true
            applyZoom(m => {
              m.tx = drag.current.tx + (e.clientX - drag.current.x) / r.width * MAPW
              m.ty = drag.current.ty + (e.clientY - drag.current.y) / r.height * MAPH
              return m
            })
            return
          }
          const marker = e.target.closest('[data-mid]')
          if (marker) {
            const g = byId[marker.dataset.mid]
            const wr = wrapRef.current.getBoundingClientRect()
            setTip({ x: e.clientX - wr.left, y: e.clientY - wr.top, name: g.name, sub: `${g.city}, ${g.country}` })
          } else setTip(null)
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          if (d && !d.moved && d.mid) onOpen(d.mid)
        }}
        onPointerLeave={() => { setTip(null) }}
      >
        <svg id="worldMap" viewBox={`0 0 ${MAPW} ${MAPH}`} role="img" aria-label="World map of grounds visited">
          <g transform={`translate(${view.tx.toFixed(3)} ${view.ty.toFixed(3)}) scale(${view.s.toFixed(4)})`}>
            <g id="mapGrat" />
            <g>{LAND_PATHS.map((d, i) => <path key={i} className="mland" d={d} />)}</g>
            <g>
              {todo.map(g => (
                <g key={g.id} className="mdot" data-mid={g.id}
                  transform={`translate(${px(g.lon).toFixed(2)} ${py(g.lat).toFixed(2)}) scale(${(0.85 * k).toFixed(4)})`}>
                  <circle r="1.5" />
                </g>
              ))}
            </g>
            <g>
              {done.map(g => (
                <g key={g.id} className="mpin" data-mid={g.id}
                  transform={`translate(${px(g.lon).toFixed(2)} ${py(g.lat).toFixed(2)}) scale(${(0.72 * k).toFixed(4)})`}>
                  <path className="pin-body" d="M0 0c-2.7-3.5-4.8-5.9-4.8-8.4a4.8 4.8 0 1 1 9.6 0C4.8-5.9 2.7-3.5 0 0z" />
                  <path className="pin-tick" d="M-2.2-8.7 -0.6-7 2.4-10.4" />
                </g>
              ))}
            </g>
          </g>
        </svg>
        {tip && (
          <div className="map-tip"
            style={{ left: tip.x + 14, top: tip.y + 14 }} hidden={false}>
            <b>{esc(tip.name)}</b><span>{esc(tip.sub)}</span>
          </div>
        )}
        <div className="map-ctrls">
          <button className="mapbtn" aria-label="Zoom in" onClick={() => zoomAt(MAPW / 2, MAPH / 2, 1.5)}>+</button>
          <button className="mapbtn" aria-label="Zoom out" onClick={() => zoomAt(MAPW / 2, MAPH / 2, 1 / 1.5)}>−</button>
          <button className="mapbtn" onClick={() => zoomTo(null)}>Reset</button>
        </div>
      </div>
      <div className="map-foot">
        <span className="map-key done"><i /> Been there</span>
        <span className="map-key"><i /> Not yet</span>
        <label className="toggle">
          <input type="checkbox" checked={showTodo} onChange={e => setShowTodo(e.target.checked)} />
          Show grounds not visited
        </label>
        <span id="mapCount" className="mono" style={{ marginLeft: 'auto' }}>
          {done.length} pinned · {new Set(done.map(g => g.country)).size} countries
        </span>
      </div>
    </section>
  )
}
