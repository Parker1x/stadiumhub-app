import { sb } from './supabase.js'

export async function loadProfile (user) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (data) return data

  // No profile row: account predates schema.sql, so the sign-up trigger never
  // ran. Make the row now — the insert policy allows only self-creation.
  const base = ((user.email || 'hopper').split('@')[0] || 'hopper')
    .toLowerCase().replace(/[^a-z0-9_]/g, '') || 'hopper'
  let candidate = (base.length < 3 ? 'hopper' + base : base).slice(0, 16)
  for (let i = 0; i < 25; i++) {
    const { data: made, error: e2 } = await sb.from('profiles')
      .insert({ id: user.id, username: candidate, display_name: candidate })
      .select().single()
    if (!e2) return made
    if (!/duplicate|unique/i.test(e2.message || '')) throw e2
    candidate = base.slice(0, 14) + (i + 1)
  }
  throw new Error('Could not create a profile for this account.')
}

export async function loadProfileByUsername (username) {
  const { data } = await sb.from('profiles').select('*').eq('username', username).maybeSingle()
  return data
}

export async function loadVisits (userId) {
  const { data, error } = await sb.from('visits')
    .select('ground_id, visited_on').eq('user_id', userId)
  if (error) throw error
  const out = {}
  ;(data || []).forEach(v => { out[v.ground_id] = { visited_on: v.visited_on } })
  return out
}

// userId omitted = the global feed. The !posts_user_id_fkey hint is NOT
// optional: `likes` has a composite PK so PostgREST sees two relation paths
// posts↔profiles and refuses to choose. Naming the constraint settles it.
export async function loadPosts (userId) {
  let q = sb.from('posts')
    .select('id, user_id, ground_id, body, photo_path, created_at, ' +
            'profiles!posts_user_id_fkey(username, display_name), ' +
            'likes(user_id), ' +
            'comments(id, user_id, body, created_at, ' +
                     'profiles!comments_user_id_fkey(username, display_name))')
    .order('created_at', { ascending: false })
    .limit(100)
  if (userId) q = q.eq('user_id', userId)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(p => ({
    ...p,
    author: p.profiles?.display_name || p.profiles?.username || 'Someone',
    username: p.profiles?.username,
    likes: (p.likes || []).map(l => l.user_id),
    comments: (p.comments || [])
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(c => ({ ...c, author: c.profiles?.display_name || c.profiles?.username || 'Someone' })),
    photoUrl: p.photo_path
      ? sb.storage.from('photos').getPublicUrl(p.photo_path).data.publicUrl
      : null
  }))
}
