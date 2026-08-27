import React, { useEffect, useState, useCallback } from 'react'
import { sb, configProblem, GH_BUILD } from './lib/supabase.js'
import { withTimeout, setToastFn } from './lib/util.js'
import { loadProfile, loadVisits, loadPosts } from './lib/data.js'

import AuthGate from './components/AuthGate.jsx'
import Masthead, { Turnstiles } from './components/Masthead.jsx'
import GroundsView from './components/GroundsView.jsx'
import FixturesView from './components/FixturesView.jsx'
import MapView from './components/MapView.jsx'
import FeedView from './components/FeedView.jsx'
import PassportView from './components/PassportView.jsx'
import StatsView from './components/StatsView.jsx'
import GroundDetail from './components/GroundDetail.jsx'
import ProfileDialog from './components/ProfileDialog.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

export default function App () {
  const [bootProblem] = useState(() => configProblem())
  const [authMode, setAuthMode] = useState('in')
  const [me, setMe] = useState(null)
  const [subject, setSubject] = useState(null)   // whose passport we're viewing
  const [visited, setVisited] = useState({})     // ground_id -> { visited_on }
  const [posts, setPosts] = useState([])
  const [readOnly, setReadOnly] = useState(false)
  const [view, setView] = useState(() => {
    // Initial tab comes from ?tab=… so refresh (and shared URLs) restore it.
    const t = new URLSearchParams(window.location.search).get('tab')
    return ['fixtures', 'grounds', 'feed', 'passport', 'stats'].includes(t) ? t : 'fixtures'
  })
  const [detailId, setDetailId] = useState(null)
  const [profileDlgOpen, setProfileDlgOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [entryError, setEntryError] = useState('')

  useEffect(() => { setToastFn(msg => setToastMsg(msg)) })
  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(''), 2400)
    return () => clearTimeout(t)
  }, [toastMsg])

  // Keep ?tab=… on the URL so refresh lands on the same section. Default
  // (fixtures) is omitted for a clean URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (view === 'fixtures') p.delete('tab'); else p.set('tab', view)
    const qs = p.toString()
    window.history.replaceState(null, '',
      window.location.pathname + (qs ? '?' + qs : '') + window.location.hash)
  }, [view])

  // ------------------------------------------------------------ data loads --
  const refreshPosts = useCallback(async (userId) => {
    const p = await loadPosts(userId)
    setPosts(p)
    return p
  }, [])

  async function enterApp (session) {
    try {
      const profile = await withTimeout(loadProfile(session.user), 20000,
        'Timed out waiting for Supabase. The project may be paused, or the Project URL may be wrong.')
      const [vis, ps] = await Promise.all([loadVisits(profile.id), loadPosts()])
      setMe(profile)
      setVisited(vis)
      setPosts(ps)
      const who = new URLSearchParams(location.search).get('u')
      if (who && who !== profile.username) await viewProfile(who, profile)
    } catch (err) {
      console.error('[stadiumhub] sign-in failed:', err)
      setEntryError(explainFailure(err))
    }
  }

  function explainFailure (err) {
    const m = (err && err.message) || String(err)
    if (/^Timed out/i.test(m)) return m
    if (/relation .*(profiles|grounds|visits|posts).* does not exist|schema cache/i.test(m))
      return 'Your database has no tables yet — run schema.sql in the Supabase SQL editor (step 2).'
    if (/row-level security/i.test(m))
      return 'The security policies rejected that. Re-run schema.sql to make sure they all exist.'
    if (/JWT|invalid.*token|expired/i.test(m))
      return 'Your session is not valid. Sign out and in again.'
    if (/Failed to fetch|NetworkError|fetch/i.test(m))
      return 'Could not reach Supabase. Check the Project URL, and that the project is not paused (free projects sleep after a week — opening the dashboard wakes them).'
    return 'Could not load your account: ' + m
  }

  // ------------------------------------------------------------------ auth --
  useEffect(() => {
    if (bootProblem) return
    let entering = false
    let entryFailed = false
    const run = async () => {
      try {
        const { data } = await withTimeout(sb.auth.getSession(), 15000,
          'Could not reach Supabase. Check the Project URL, and that the project is not paused.')
        if (data.session) await enterApp(data.session)
      } catch (err) {
        setEntryError(explainFailure(err))
      }
    }
    run()
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (!session || entryFailed) return
      if (!['SIGNED_IN', 'INITIAL_SESSION', 'TOKEN_REFRESHED'].includes(event)) return
      setTimeout(() => { if (!entering && me === null) enterApp(session) }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [bootProblem])

  async function handleSignIn (email, pass, username, mode) {
    const signUp = mode === 'up'
    if (signUp) {
      const { data, error } = await withTimeout(sb.auth.signUp({
        email, password: pass,
        options: { data: { username: username || undefined } }
      }), 25000, 'Timed out reaching Supabase. Check the Project URL, and that the project is not paused.')
      if (error) throw error
      if (!data.session) {
        return { msg: 'Check your email to confirm your address, then sign in.', kind: 'good' }
      }
      await enterApp(data.session)
      return null
    }
    const { data, error } = await withTimeout(
      sb.auth.signInWithPassword({ email, password: pass }), 25000,
      'Timed out reaching Supabase. Check the Project URL, and that the project is not paused.')
    if (error) throw error
    await enterApp(data.session)
    return null
  }

  async function handleForgot (email) {
    const { error } = await sb.auth.resetPasswordForEmail(email,
      { redirectTo: location.origin + location.pathname })
    if (error) throw error
  }

  // ------------------------------------------------------------- visiting  --
  async function toggleVisit (id) {
    if (readOnly || !me) return
    const wasVisited = !!visited[id]
    const next = { ...visited }
    if (wasVisited) delete next[id]
    else next[id] = { visited_on: new Date().toISOString().slice(0, 10) }
    setVisited(next)

    try {
      if (wasVisited) {
        await sb.from('attended_matches').delete()
          .eq('user_id', me.id).eq('ground_id', id)
        await sb.from('visits').delete().eq('user_id', me.id).eq('ground_id', id)
      } else {
        await sb.from('visits').insert({
          user_id: me.id, ground_id: id, visited_on: next[id].visited_on
        })
      }
    } catch {
      setVisited(visited)
      return
    }
    window.dispatchEvent(new CustomEvent('gh:visit-changed'))
  }

  async function viewProfile (username, myProfile) {
    const mine = myProfile || me
    if (mine && username === mine.username) return backToMine()
    const p = await loadProfileByUsername(username)
    if (!p) return
    setSubject(p)
    setReadOnly(true)
    setVisited(await loadVisits(p.id))   // RLS returns {} if they keep it private
    setPosts(await loadPosts(p.id))
    history.replaceState(null, '', `?u=${encodeURIComponent(username)}`)
    setView('passport')
  }

  async function backToMine () {
    setSubject(null)
    setReadOnly(false)
    setVisited(await loadVisits(me.id))
    setPosts(await loadPosts())
    history.replaceState(null, '', location.pathname)
    setView('passport')
  }

  // --------------------------------------------------------------- render --
  const nVisited = Object.keys(visited).length

  return (
    <>
      {!me && (
        <AuthGate
          problem={bootProblem}
          build={GH_BUILD}
          entryError={entryError}
          onSignIn={handleSignIn}
          onForgot={handleForgot}
          onSignOut={async () => { await sb.auth.signOut(); location.reload() }}
        />
      )}
      {me && (
        <div id="app-root">
          <Masthead
            tallyN={nVisited} tallyT={326}
            onSignOut={() => { sb.auth.signOut(); location.reload() }}
          />
          <Turnstiles view={view} onView={setView}
            counts={{ grounds: '', feed: posts.length, passport: nVisited }} />
          <main>
            {readOnly && subject && (
              <div className="viewing">
                Viewing <b>{subject.display_name || subject.username}</b>'s passport ·
                <button className="linkbtn" onClick={backToMine}>back to mine</button>
              </div>
            )}
            {view === 'fixtures' && (
              <ErrorBoundary key="fixtures">
                <FixturesView me={me} />
              </ErrorBoundary>
            )}
            {view === 'grounds' && (
              <ErrorBoundary key="grounds">
                <GroundsView visited={visited} readOnly={readOnly}
                  onToggle={toggleVisit} onOpen={id => setDetailId(id)} />
              </ErrorBoundary>
            )}
{view === 'feed' && (
              <ErrorBoundary key="feed">
                <FeedView me={me} posts={posts} readOnly={readOnly}
                  onRefresh={refreshPosts} visited={visited}
                  onViewProfile={viewProfile} />
              </ErrorBoundary>
            )}
            {view === 'passport' && (
              <ErrorBoundary key="passport">
                <PassportView me={me} subject={subject} readOnly={readOnly}
                  visited={visited} posts={posts}
                  onEditProfile={() => setProfileDlgOpen(true)}
                  onViewProfile={viewProfile}
                  onBackToMine={backToMine} />
              </ErrorBoundary>
            )}
            {view === 'stats' && !readOnly && (
              <ErrorBoundary key="stats">
                <StatsView me={me} visited={visited} />
              </ErrorBoundary>
            )}
          </main>
          {detailId && (
            <GroundDetail
              id={detailId} me={me} visited={visited} readOnly={readOnly}
              onClose={() => setDetailId(null)}
              onToggle={() => toggleVisit(detailId)}
              onPost={() => { setDetailId(null); setView('feed') }}
            />
          )}
          <ProfileDialog
            open={profileDlgOpen} me={me}
            onClose={() => setProfileDlgOpen(false)}
            onSaved={(upd) => { Object.assign(me, upd); setMe({ ...me }) }}
          />
        </div>
      )}
      {toastMsg && <div id="toast-react" role="status">{toastMsg}</div>}
    </>
  )
}
