import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

const BUCKET = 'avatars'
const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function extFor(type: string) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/gif') return 'gif'
  return 'jpg'
}

async function userFromRequest(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { user: null, error: 'Autentificare lipsă.' }
  const admin = supabaseAdmin()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return { user: null, error: 'Sesiune invalidă.' }
  return { user: data.user, error: null, admin }
}

async function ensureBucket(admin: ReturnType<typeof supabaseAdmin>) {
  const { data } = await admin.storage.listBuckets()
  if (data?.some(bucket => bucket.id === BUCKET || bucket.name === BUCKET)) return
  const created = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  })
  if (created.error && !/already exists/i.test(created.error.message)) {
    throw new Error(created.error.message)
  }
}

async function removeUserAvatars(admin: ReturnType<typeof supabaseAdmin>, userId: string) {
  const listed = await admin.storage.from(BUCKET).list(userId)
  const names = (listed.data || []).map(file => `${userId}/${file.name}`)
  if (names.length) await admin.storage.from(BUCKET).remove(names)
}

function publicAvatarUrl(admin: ReturnType<typeof supabaseAdmin>, path: string) {
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function POST(request: NextRequest) {
  try {
    const auth = await userFromRequest(request)
    if (!auth.user || !auth.admin) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Alege o fotografie.' }, { status: 400 })
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: 'Folosește JPG, PNG, WEBP sau GIF.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Fotografia trebuie să aibă maxim 2 MB.' }, { status: 400 })
    }

    await ensureBucket(auth.admin)
    await removeUserAvatars(auth.admin, auth.user.id)
    const path = `${auth.user.id}/avatar.${extFor(file.type)}`
    const bytes = Buffer.from(await file.arrayBuffer())
    const uploaded = await auth.admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: true
    })
    if (uploaded.error) {
      return NextResponse.json({ error: uploaded.error.message }, { status: 400 })
    }

    const avatarUrl = publicAvatarUrl(auth.admin, path)
    const { error } = await auth.admin.auth.admin.updateUserById(auth.user.id, {
      user_metadata: { ...auth.user.user_metadata, avatar_url: avatarUrl }
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, avatarUrl })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Nu s-a putut salva fotografia.'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await userFromRequest(request)
    if (!auth.user || !auth.admin) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }
    await ensureBucket(auth.admin)
    await removeUserAvatars(auth.admin, auth.user.id)
    const { error } = await auth.admin.auth.admin.updateUserById(auth.user.id, {
      user_metadata: { ...auth.user.user_metadata, avatar_url: '' }
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, avatarUrl: '' })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Nu s-a putut șterge fotografia.'
    }, { status: 500 })
  }
}
