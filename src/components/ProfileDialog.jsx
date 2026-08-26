import React, { useEffect, useState } from 'react'
import { sb } from '../lib/supabase.js'

export default function ProfileDialog ({ open, me, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [user, setUser] = useState('')
  const [bio, setBio] = useState('')
  const [team, setTeam] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && me) {
      setName(me.display_name || '')
      setUser(me.username || '')
      setBio(me.bio || '')
      setTeam(me.favourite_team || '')
      setMsg('')
    }
  }, [open, me])

  if (!open) return null

  async function save () {
    if (!name.trim()) return setMsg('Give yourself a display name.')
    if (!/^[a-z0-9_]{3,20}$/.test(user))
      return setMsg('Usernames use lowercase letters, numbers and underscores, 3–20 characters.')
    setBusy(true)
    const { error } = await sb.from('profiles')
      .update({
        display_name: name.trim(),
        username: user.toLowerCase(),
        bio: bio.trim() || null,
        favourite_team: team.trim() || null
      })
      .eq('id', me.id)
    setBusy(false)
    if (error) {
      return setMsg(/duplicate|unique/i.test(error.message)
        ? 'That username is taken.' : error.message)
    }
    onSaved({
      display_name: name.trim(),
      username: user.toLowerCase(),
      bio: bio.trim() || null,
      favourite_team: team.trim() || null
    })
    onClose()
  }

  return (
    <div className="dlg-scrim dlg-blur">
      <div className="dlg" role="dialog" aria-modal="true" aria-label="Edit profile">
        <div className="dlg-head">
          <button className="dlg-close" aria-label="Close" onClick={onClose}>×</button>
          <h2>Edit profile</h2>
          <div className="sub">Your details, as other StadiumHub members see them</div>
        </div>
        <div className="dlg-body" style={{ display: 'block' }}>
          <label className="fieldlabel" htmlFor="pdName">Display name</label>
          <input id="pdName" value={name} maxLength={40} onChange={e => setName(e.target.value)} />

          <label className="fieldlabel" htmlFor="pdUser">Username</label>
          <input id="pdUser" value={user} pattern="[a-z0-9_]{3,20}"
            onChange={e => setUser(e.target.value.toLowerCase())} />

          <label className="fieldlabel" htmlFor="pdBio">Bio</label>
          <textarea id="pdBio" rows={2} maxLength={200}
            value={bio} onChange={e => setBio(e.target.value)} />

          <label className="fieldlabel" htmlFor="pdTeam">Favourite football team</label>
          <TeamPicker value={team} onChange={setTeam} />

          <p className="authmsg" role="alert">{msg}</p>
        </div>
        <div className="dlg-foot">
          <button className="btn btn-primary" onClick={save} disabled={busy}>Save</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// Type-to-filter dropdown over the bundled team list. Type narrows the options;
// pick with mouse or keyboard; the free-text field also allows a custom entry
// so nobody is locked out because their club isn't listed.
function TeamPicker ({ value, onChange }) {
  const [query, setQuery] = useState(value || '')
  const [openList, setOpenList] = useState(false)

  useEffect(() => { setQuery(value || '') }, [value])

  const q = query.trim().toLowerCase()
  const matches = q
    ? TEAMS.filter(t => t.toLowerCase().includes(q)).slice(0, 60)
    : TEAMS.slice(0, 60)

  function pick (t) {
    onChange(t)
    setQuery(t)
    setOpenList(false)
  }

  return (
    <div className="team-picker">
      <input
        id="pdTeam"
        type="text"
        placeholder="Type to search — e.g. United, Wednesday, Rangers…"
        value={query}
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpenList(true) }}
        onFocus={() => setOpenList(true)}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
      />
      {openList && matches.length > 0 && (
        <ul className="team-list" role="listbox">
          {matches.map(t => (
            <li key={t}>
              <button type="button" onMouseDown={e => { e.preventDefault(); pick(t) }}>
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Start typing to filter the list — or keep whatever you type as a custom entry.</p>
    </div>
  )
}

import { TEAMS } from '../data/teams.js'
