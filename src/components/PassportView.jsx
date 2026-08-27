import React, { useEffect, useMemo, useState } from 'react'
import { GROUNDS, byId, initials, fmt } from '../lib/util.js'
import { sb } from '../lib/supabase.js'
import { toast } from '../lib/util.js'
import { PostCard } from './FeedView.jsx'
import StatsView from './StatsView.jsx'

export default function PassportView ({ me, subject, readOnly, visited, posts,
                                        onEditProfile, onViewProfile, onBackToMine }) {
  const who = subject || me
  const n = Object.keys(visited).length
  const [showStats, setShowStats] = useState(false)

  const vis = useMemo(() =>
    Object.keys(visited).map(id => byId[id]).filter(Boolean), [visited])

  const countries = new Set(vis.map(g => g.country)).size
  const seats = vis.reduce((a, g) => a + (g.capacity || 0), 0)
  const oldest = vis.length ? vis.reduce((a, g) => g.opened < a.opened ? g : a) : null
  const mine = posts.filter(p => p.user_id === who.id)

  return (
    <section className="view" role="tabpanel">
      {showStats && !readOnly && (
        <StatsModal me={me} visited={visited} onClose={() => setShowStats(false)} />
      )}
      {!readOnly && (
        <div className="statsview-banner">
          <button className="btn statsview-open" onClick={() => setShowStats(true)}>
            More Stats
          </button>
          <button className="statsview-prompt" onClick={() => setShowStats(true)}>
            Want to see more in depth stats?
            <span className="statsview-cta"> Click here</span>
          </button>
        </div>
      )}
      <div className="passport-head">
        <div className="avatar">{initials(who.display_name || who.username)}</div>
        <div style={{ minWidth: 0 }}>
          <h2>{who.display_name || who.username}</h2>
          <div className="since">@{who.username}
            {who.created_at && ' · collecting since ' +
              new Date(who.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </div>
          {who.favourite_team && (
            <div><span className="team-badge">⚽ {who.favourite_team}</span></div>
          )}
        </div>
        {!readOnly && (
          <div className="passport-actions">
            <button className="btn" onClick={() => {
              const url = `${location.origin}${location.pathname}?u=${who.username}`
              navigator.clipboard.writeText(url)
                .then(() => {}, () => prompt('Copy your profile link:', url))
            }}>Copy profile link</button>
            <button className="btn" onClick={onEditProfile}>Edit profile</button>
          </div>
        )}
        {readOnly && (
          <div className="passport-actions">
            <button className="btn" onClick={onBackToMine}>Back to my passport</button>
          </div>
        )}
      </div>

      {!readOnly && <PrivacyCard me={me} />}

      <StatsStrip who={who} vis={vis} countries={countries} seats={seats}
        oldest={oldest} postsCount={mine.length} />

      <div className="section-title"><h2>By region</h2></div>
      <RegionList vis={vis} />

      <div className="section-title"><h2>Grounds ticked off</h2><span className="n">{n}</span></div>
      {vis.length ? (
        <div className="visited-grid">
          {[...vis].sort((a, b) => a.name.localeCompare(b.name)).map(g => (
            <div key={g.id} className="vcard">
              <div className="n">{g.name}</div><div className="c">{g.city}, {g.country}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <strong>{readOnly ? 'Nothing to see' : 'Passport empty'}</strong>
          {readOnly
            ? 'This member keeps their tick-list private.'
            : 'Head to Grounds and tick off your first one.'}
        </div>
      )}

      <div className="section-title"><h2>Posts</h2><span className="n">{mine.length}</span></div>
      <div className="feed">
        {mine.length
          ? mine.map(p => <PostCard key={p.id} post={p} me={me} onViewProfile={onViewProfile} />)
          : <div className="empty"><strong>Nothing posted yet</strong>Matchday posts collect here.</div>}
      </div>
    </section>
  )
}

function PrivacyCard ({ me }) {
  async function setVis (v) {
    const { error } = await sb.from('profiles').update({ visibility: v }).eq('id', me.id)
    if (error) return toast('Could not save that setting')
    toast(v === 'public' ? 'Your passport is public'
      : v === 'posts_only' ? 'Posts public, tick-list private' : 'Your passport is private now')
  }
  return (
    <div className="card privacy">
      <div className="eyebrow">Who can see your passport</div>
      <div className="privacy-opts" onChange={e => e.target.name === 'vis' && setVis(e.target.value)}>
        <label><input type="radio" name="vis" value="public" defaultChecked={me.visibility === 'public'} /><b>Anyone</b><span>Your grounds, counts and posts are public.</span></label>
        <label><input type="radio" name="vis" value="posts_only" defaultChecked={me.visibility === 'posts_only'} /><b>Posts only</b><span>Your posts are public, your tick-list stays private.</span></label>
        <label><input type="radio" name="vis" value="private" defaultChecked={me.visibility === 'private'} /><b>Just me</b><span>Nobody else sees your grounds or posts.</span></label>
      </div>
    </div>
  )
}

// The original five passport stats plus the two new attendance ones.
function StatsStrip ({ who, vis, countries, seats, oldest, postsCount }) {
  const [att, setAtt] = useState(null)
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const { data } = await sb.from('attended_matches')
          .select('id, home_goals, away_goals').eq('user_id', who.id)
        if (!dead) setAtt(data || [])
      } catch { if (!dead) setAtt([]) }
    })()
    return () => { dead = true }
  }, [who.id])

  const matches = att ? att.length : null
  const goals = att ? att.reduce((a, m) => a + (m.home_goals || 0) + (m.away_goals || 0), 0) : null

  return (
    <div className="stats">
      <div className="stat accent">
        <div className="v">{fmt(vis.length)}<span className="of"> / {GROUNDS.length}</span></div>
        <div className="k eyebrow">Grounds visited</div>
      </div>
      <div className="stat"><div className="v">{countries}</div><div className="k eyebrow">Countries</div></div>
      <div className="stat"><div className="v">{fmt(seats)}</div><div className="k eyebrow">Combined seats</div></div>
      <div className="stat"><div className="v">{oldest ? oldest.opened : '—'}</div><div className="k eyebrow">Earliest opened</div></div>
      <div className="stat"><div className="v">{matches ?? '…'}</div><div className="k eyebrow">Matches attended</div></div>
      <div className="stat accent"><div className="v">{goals ?? '…'}</div><div className="k eyebrow">Goals witnessed</div></div>
      <div className="stat"><div className="v">{postsCount}</div><div className="k eyebrow">Posts</div></div>
    </div>
  )
}

function RegionList ({ vis }) {
  const totals = {}, done = {}
  GROUNDS.forEach(g => { totals[g.region] = (totals[g.region] || 0) + 1 })
  vis.forEach(g => { done[g.region] = (done[g.region] || 0) + 1 })
  const regions = [...new Set(GROUNDS.map(g => g.region))].sort()
  return (
    <div className="region-list">
      {regions.map(r => {
        const d = done[r] || 0, t = totals[r]
        return (
          <div key={r} className="region">
            <div className="rn">{r}</div>
            <div className="bar"><i style={{ width: (d / t * 100).toFixed(1) + '%' }} /></div>
            <div className="rv">{d}/{t}</div>
          </div>
        )
      })}
    </div>
  )
}

function StatsModal ({ me, visited, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="stats-scrim" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stats-dlg" role="dialog" aria-modal="true" aria-label="Statistics">
        <button className="stats-close" aria-label="Close statistics" onClick={onClose}>×</button>
        <div className="stats-body">
          <StatsView me={me} visited={visited} />
        </div>
      </div>
    </div>
  )
}
