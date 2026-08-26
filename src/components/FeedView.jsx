import React, { useEffect, useRef, useState } from 'react'
import { GROUNDS, byId, initials, ago, toast } from '../lib/util.js'
import { sb } from '../lib/supabase.js'

export function PostCard ({ post, me, onViewProfile }) {
  const g = byId[post.ground_id]
  const liked = me && post.likes.includes(me.id)
  const mine = me && post.user_id === me.id
  const [showComments, setShowComments] = useState(false)

  async function like () {
    if (!me) return
    const i = post.likes.indexOf(me.id)
    try {
      if (i === -1) {
        post.likes.push(me.id)
        await sb.from('likes').insert({ post_id: post.id, user_id: me.id })
      } else {
        post.likes.splice(i, 1)
        await sb.from('likes').delete().eq('post_id', post.id).eq('user_id', me.id)
      }
      window.dispatchEvent(new CustomEvent('gh:posts-changed'))
    } catch { toast('Could not save that like — try again') }
  }

  async function del () {
    const { error } = await sb.from('posts').delete().eq('id', post.id)
    if (error) return toast('Could not delete that')
    if (post.photo_path) await sb.storage.from('photos').remove([post.photo_path])
    window.dispatchEvent(new CustomEvent('gh:posts-changed'))
    toast('Post deleted')
  }

  async function comment (e) {
    e.preventDefault()
    const input = e.target.querySelector('input')
    const text = input.value.trim()
    if (!text) return
    const { data, error } = await sb.from('comments')
      .insert({ post_id: post.id, user_id: me.id, body: text }).select().single()
    if (error) return toast('Could not add that comment')
    post.comments.push({ ...data, author: me.display_name || me.username })
    input.value = ''
    setShowComments(true)
    window.dispatchEvent(new CustomEvent('gh:posts-changed'))
  }

  return (
    <article className="card post">
      <div className="post-head">
        <div className="avatar">{initials(post.author)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="post-author">
            {post.author}
            {post.username && (
              <button className="linkbtn at" onClick={() => onViewProfile(post.username)}>
                @{post.username}
              </button>
            )}
          </div>
          <div className="post-at">at <b>{g ? g.name : 'a ground'}</b>{g ? ' · ' + g.city : ''}</div>
        </div>
        <div className="post-time">{ago(post.created_at)}</div>
      </div>
      {post.body && <div className="post-body">{post.body}</div>}
      {post.photoUrl && (
        <img className="post-photo" src={post.photoUrl} loading="lazy"
          alt={'Photo from ' + (g ? g.name : 'a ground')} />
      )}
      <div className="post-actions">
        <button className={'act' + (liked ? ' on' : '')} aria-pressed={!!liked} onClick={like}>
          <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} strokeWidth="2"
            stroke="currentColor" aria-hidden="true">
            <path d="M12 20s-7-4.6-7-9.4A4 4 0 0 1 12 8a4 4 0 0 1 7 2.6C19 15.4 12 20 12 20z" />
          </svg>
          {post.likes.length || ''} Like{post.likes.length === 1 ? '' : 's'}
        </button>
        <button className="act" onClick={() => setShowComments(s => !s)}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />
          </svg>
          {post.comments.length || ''} Comment{post.comments.length === 1 ? '' : 's'}
        </button>
        {mine && <button className="act del" style={{ marginLeft: 'auto' }} onClick={del}>Delete</button>}
      </div>
      {showComments && (
        <div className="comments">
          {post.comments.map(c => (
            <div key={c.id} className="cmt"><span className="who">{c.author}</span><span className="txt">{c.body}</span></div>
          ))}
          {!post.comments.length && <div className="cmt"><span className="txt">No comments yet.</span></div>}
          <form className="cmt-form" onSubmit={comment}>
            <input className="cmt-input" placeholder="Add a comment…" aria-label="Add a comment" />
            <button className="btn" type="submit">Send</button>
          </form>
        </div>
      )}
    </article>
  )
}

// Downscale in the browser so uploads stay small and storage stays cheap.
function shrink (file, max = 1400, quality = 0.78) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file)
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')) }
    img.src = url
  })
}

export default function FeedView ({ me, posts, readOnly, onRefresh, visited, onViewProfile }) {
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [groundSel, setGroundSel] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    let t = null
    const refreshSoon = () => { clearTimeout(t); t = setTimeout(() => onRefresh(), 250) }
    window.addEventListener('gh:posts-changed', refreshSoon)
    return () => { clearTimeout(t); window.removeEventListener('gh:posts-changed', refreshSoon) }
  }, [onRefresh])

  async function submitPost () {
    if (!groundSel) { toast('Pick a ground first'); return }
    if (!text && !pendingPhoto) return toast('Add a photo or a few words')
    setBusy(true)
    try {
      let path = null
      if (pendingPhoto) {
        path = `${me.id}/${crypto.randomUUID()}.jpg`
        const { error } = await sb.storage.from('photos')
          .upload(path, pendingPhoto, { contentType: 'image/jpeg', upsert: false })
        if (error) throw error
      }
      const { error } = await sb.from('posts')
        .insert({ user_id: me.id, ground_id: groundSel, body: text || null, photo_path: path })
      if (error) throw error

      if (!visited[groundSel]) {
        await sb.from('visits').insert({
          user_id: me.id, ground_id: groundSel,
          visited_on: new Date().toISOString().slice(0, 10)
        })
        window.dispatchEvent(new CustomEvent('gh:visit-changed'))
      }
      setText(''); setGroundSel(''); setPendingPhoto(null); setPreviewUrl(null)
      await onRefresh()
      toast('Posted')
    } catch (err) {
      toast('Could not post: ' + err.message)
    } finally { setBusy(false) }
  }

  const sortedGrounds = [...GROUNDS].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section className="view" role="tabpanel">
      <div className="card composer">
        <div className="eyebrow">Post a visit</div>
        <div className="composer-row" style={{ marginTop: 8 }}>
          <select id="postGround" className="ground-select" aria-label="Which ground"
            value={groundSel} onChange={e => setGroundSel(e.target.value)}>
            <option value="">Choose a ground…</option>
            {sortedGrounds.map(g => (
              <option key={g.id} value={g.id}>{g.name} — {g.city}</option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: 9 }}>
          <textarea id="postText" rows={2} placeholder="How was it? Atmosphere, the away end, the pie…"
            value={text} onChange={e => setText(e.target.value)} />
        </div>
        {previewUrl && (
          <div className="photo-preview" style={{ display: 'block' }}>
            <img src={previewUrl} alt="Selected photo preview" />
            <button className="btn" type="button"
              onClick={() => { setPendingPhoto(null); setPreviewUrl(null) }}>Remove</button>
          </div>
        )}
        <div className="composer-row">
          <label className="photo-drop">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" strokeWidth="2"
              stroke="currentColor" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" />
            </svg>
            Add photo
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={async e => {
                const f = e.target.files[0]; if (!f) return
                try {
                  const small = await shrink(f)
                  setPendingPhoto(small)
                  setPreviewUrl(URL.createObjectURL(small))
                } catch { toast('That image could not be read') }
                e.target.value = ''
              }} />
          </label>
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }}
            disabled={busy} onClick={submitPost}>Post</button>
        </div>
        <div className="sync-note">Posts are public to anyone who can see your profile.</div>
      </div>
      <div className="feed">
        {posts.length
          ? posts.map(p => <PostCard key={p.id} post={p} me={me} onViewProfile={onViewProfile} />)
          : <div className="empty"><strong>No matchday posts yet</strong>Tick off a ground, add a photo, and start the feed.</div>}
      </div>
    </section>
  )
}
