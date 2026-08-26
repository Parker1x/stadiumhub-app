import React, { useEffect, useState } from 'react'
import { sb } from '../lib/supabase.js'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function AuthGate ({ problem, build, entryError, onSignIn, onForgot }) {
  const [mode, setMode] = useState('in')
  const [identifier, setIdentifier] = useState('') // email, or a username on sign-in
  const [pass, setPass] = useState('')
  const [user, setUser] = useState('')
  const [userCheck, setUserCheck] = useState(null) // null|'checking'|'free'|'taken'|'bad'
  const [msg, setMsg] = useState({ text: '', kind: '' })
  const [busy, setBusy] = useState(false)

  function say (text, kind = '') { setMsg({ text, kind }) }

  // Live username availability while creating an account. profiles are
  // publicly readable by design, so this works signed-out.
  useEffect(() => {
    if (mode !== 'up') return
    const v = user.trim().toLowerCase()
    if (!v) { setUserCheck(null); return }
    if (!USERNAME_RE.test(v)) { setUserCheck('bad'); return }
    setUserCheck('checking')
    const t = setTimeout(async () => {
      try {
        const { data } = await sb.from('profiles').select('username').eq('username', v).maybeSingle()
        setUserCheck(data ? 'taken' : 'free')
      } catch { setUserCheck(null) }
    }, 400)
    return () => clearTimeout(t)
  }, [user, mode])

  // Resolve "joshua_10" -> its account email via the username_lookup function.
  // Returns { email } | { noUser: true } | { rpcMissing: true } | { error }.
  async function resolveIdentifier (v) {
    const { data, error } = await sb.rpc('username_lookup', { p_username: v })
    if (error) {
      if (/PGRST202|Could not find the function|schema cache/i.test(error.message || ''))
        return { rpcMissing: true }
      return { error: error.message }
    }
    return data ? { email: data } : { noUser: true }
  }

  const migrationHint = 'Username sign-in needs a one-time database step: run supabase/migration_username_login.sql in the Supabase SQL editor.'

  async function submit (e) {
    e.preventDefault()
    const idv = identifier.trim()
    if (!idv || !pass) return say('Enter your email or username, and your password.', 'bad')

    if (mode === 'up') {
      if (pass.length < 8) return say('Use at least 8 characters for your password.', 'bad')
      if (userCheck === 'taken') return say('That username is already taken — try another.', 'bad')
      if (user && !USERNAME_RE.test(user))
        return say('Usernames can use lowercase letters, numbers and underscores, 3–20 characters.', 'bad')
      if (!idv.includes('@')) return say('For sign-up we need your email — usernames are chosen below.', 'bad')
    }

    setBusy(true)
    say(mode === 'up' ? 'Creating your account…' : 'Signing in…')
    try {
      if (mode === 'up') {
        const out = await onSignIn(idv, pass, user.trim().toLowerCase(), 'up')
        setBusy(false)
        if (out && out.msg) say(out.msg, out.kind)
      } else {
        let email = idv
        if (!idv.includes('@')) {
          const r = await resolveIdentifier(idv.toLowerCase())
          if (r.rpcMissing) { setBusy(false); return say(migrationHint, 'bad') }
          if (r.noUser) { setBusy(false); return say('No account uses that username.', 'bad') }
          if (r.error) { setBusy(false); return say(r.error, 'bad') }
          email = r.email
        }
        await onSignIn(email, pass, '', 'in')
        // Success unmounts this screen; reaching this line means we're still here.
        setBusy(false)
      }
    } catch (err) {
      const m = /^Timed out/i.test(err.message) ? err.message
        : /USERNAME_TAKEN/i.test(err.message)
          ? 'That username was taken seconds before you — try another.'
          : /INVALID_USERNAME/i.test(err.message)
            ? 'Usernames use lowercase letters, numbers and underscores, 3–20 characters.'
            : /Invalid login/i.test(err.message)
              ? 'Those details do not match any account.'
              : /already registered/i.test(err.message)
                ? 'There is already an account with that email. Try signing in.'
                : err.message
      say(m, 'bad')
      setBusy(false)
    }
  }

  async function forgot () {
    let idv = identifier.trim()
    if (!idv) return say('Enter your email or username above first, then press this.', 'bad')
    if (!idv.includes('@')) {
      const r = await resolveIdentifier(idv.toLowerCase())
      if (r.rpcMissing) return say(migrationHint + ' Or enter your email instead.', 'bad')
      if (r.noUser) return say('No account uses that username — enter your email instead.', 'bad')
      if (r.error) return say(r.error, 'bad')
      idv = r.email
    }
    try {
      await onForgot(idv)
      say('If that account exists, a reset link is on its way.', 'good')
    } catch (err) { say(err.message, 'bad') }
  }

  const shown = entryError ? { text: entryError, kind: 'bad' } : msg

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="wordmark authmark">
          <Arch />
          <span className="wm-text">StadiumHub</span>
        </div>
        <p className="authblurb">Every football ground in the world, and a passport of the ones you've stood in.</p>

        <div className="authtabs" role="tablist">
          <button className="authtab" aria-selected={mode === 'in'}
            onClick={() => { setMode('in'); say('') }}>Sign in</button>
          <button className="authtab" aria-selected={mode === 'up'}
            onClick={() => { setMode('up'); say('') }}>Create account</button>
        </div>

        <form id="authForm" onSubmit={submit} noValidate>
          <label className="fieldlabel" htmlFor="authEmail">
            {mode === 'in' ? 'Email or username' : 'Email'}
          </label>
          <input id="authEmail"
            type={mode === 'in' ? 'text' : 'email'}
            autoComplete="username"
            required
            placeholder={mode === 'in' ? 'you@example.com or bigmatchpaul' : 'you@example.com'}
            value={identifier} onChange={e => setIdentifier(e.target.value)} />

          <label className="fieldlabel" htmlFor="authPass">Password</label>
          <input id="authPass" type="password" required minLength={8}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            placeholder="At least 8 characters" value={pass}
            onChange={e => setPass(e.target.value)} />

          {mode === 'up' && (
            <div>
              <label className="fieldlabel" htmlFor="authUser">Username</label>
              <input id="authUser" type="text" autoComplete="off"
                pattern="[a-z0-9_]{3,20}" placeholder="lowercase, 3–20 characters"
                value={user} onChange={e => setUser(e.target.value.toLowerCase())} />
              {userCheck === 'checking' && <p className="hint">Checking availability…</p>}
              {userCheck === 'free' && <p className="hint ok">✓ @{user.trim().toLowerCase()} is free — once claimed, it's locked to you for good.</p>}
              {userCheck === 'taken' && <p className="hint bad">That username is already taken.</p>}
              {userCheck === 'bad' && <p className="hint">Lowercase letters, numbers and underscores, 3–20 characters.</p>}
              {!userCheck && <p className="hint">This becomes your profile link and your sign-in name.</p>}
            </div>
          )}

          <button className="btn btn-primary authsubmit" type="submit"
            disabled={busy || !!problem || (mode === 'up' && userCheck === 'taken')}>
            {mode === 'up' ? 'Create account' : 'Sign in'}
          </button>
          <p className={'authmsg' + (shown.kind ? ' ' + shown.kind : '')} role="alert">
            {problem || shown.text}
          </p>
        </form>

        <p className="authfoot">
          <button className="linkbtn" type="button" onClick={forgot}>
            Forgotten your password?
          </button>
        </p>
        <p className="buildstamp">build {build}</p>
      </div>
    </div>
  )
}

function Arch () {
  // The Wembley arch is a tubular truss: two parallel chords tied by diagonal
  // lattice steel, with cable hangers dropping to the roof. Drawn here as
  // three path groups computed from the same two quadratic curves.
  const A = { p0: [12, 57], c: [120, -17], p1: [228, 57] } // top chord
  const B = { p0: [12, 62], c: [120, -7], p1: [228, 62] }  // bottom chord
  const pt = (a, t) => {
    const u = 1 - t
    return [
      u * u * a.p0[0] + 2 * u * t * a.c[0] + t * t * a.p1[0],
      u * u * a.p0[1] + 2 * u * t * a.c[1] + t * t * a.p1[1]
    ]
  }
  const seg = (a, t) => { const p = pt(a, t); return `${p[0].toFixed(1)} ${p[1].toFixed(1)}` }
  const chord = a => `M${seg(a, 0)} Q${a.c[0]} ${a.c[1]} ${a.p1[0]} ${a.p1[1]}`

  // One continuous zig-zag alternating between the two chords
  let lattice = ''
  const N = 13
  for (let i = 0; i <= N; i++) {
    const t = 0.04 + (i / N) * 0.92
    const onUpper = i % 2 === 0
    const p = pt(onUpper ? A : B, t)
    lattice += (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' '
  }
  // Cable hangers: plumb lines from the underside down toward the roof line
  // (only in the middle span, where the arch actually rides above the roof)
  let hangers = ''
  for (const t of [0.2, 0.32, 0.44, 0.56, 0.68, 0.8]) {
    const p = pt(B, t)
    if (p[1] > 38) continue
    hangers += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}V43 `
  }

  return (
    <svg className="arch" viewBox="0 0 240 62" preserveAspectRatio="none" aria-hidden="true">
      <path className="arch-cable" d={hangers} />
      <path className="arch-lattice" d={lattice} />
      <path className="arch-band" d={chord(A)} />
      <path className="arch-band" d={chord(B)} />
      <rect className="arch-foot" x="6" y="55" width="9" height="5" rx="1" />
      <rect className="arch-foot" x="225" y="55" width="9" height="5" rx="1" />
    </svg>
  )
}

export { Arch }
