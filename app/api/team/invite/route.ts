import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { MAX_OPERATORS, isMissingPortfolioTableError, normalizeInviteEmail } from '@/lib/portfolio'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const { userId, email } = await request.json()
    const ownerId = String(userId || '')
    const inviteEmail = normalizeInviteEmail(String(email || ''))
    if (!ownerId || !inviteEmail || !inviteEmail.includes('@')) {
      return NextResponse.json({ error: 'Introdu un email valid.' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: owner } = await admin.auth.admin.getUserById(ownerId)
    if (!owner.user) return NextResponse.json({ error: 'Cont invalid.' }, { status: 400 })
    if (normalizeInviteEmail(owner.user.email || '') === inviteEmail) {
      return NextResponse.json({ error: 'Nu te poți invita pe tine.' }, { status: 400 })
    }

    const existing = await admin
      .from('portfolio_members')
      .select('id, status, email')
      .eq('owner_user_id', ownerId)
    if (existing.error) {
      if (isMissingPortfolioTableError(existing.error)) {
        return NextResponse.json({ error: 'Rulează migrația 20260917_portfolio_members.sql în Supabase.' }, { status: 400 })
      }
      return NextResponse.json({ error: existing.error.message }, { status: 400 })
    }
    const rows = existing.data || []
    if (rows.some(row => normalizeInviteEmail(row.email) === inviteEmail)) {
      return NextResponse.json({ error: 'Acest email este deja în echipă.' }, { status: 400 })
    }
    if (rows.length >= MAX_OPERATORS) {
      return NextResponse.json({ error: `Poți avea cel mult ${MAX_OPERATORS} operator pe cabinet, deocamdată.` }, { status: 400 })
    }

    const insert = await admin
      .from('portfolio_members')
      .insert({
        owner_user_id: ownerId,
        email: inviteEmail,
        role: 'operator',
        status: 'pending'
      })
      .select('*')
      .single()
    if (insert.error || !insert.data) {
      return NextResponse.json({ error: insert.error?.message || 'Nu s-a putut crea invitația.' }, { status: 400 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const link = `${baseUrl}/invite/${insert.data.invite_token}`
    const ownerName = String(owner.user.user_metadata?.full_name || owner.user.email || 'Un coleg')
    const { error: mailError } = await resend.emails.send({
      from: 'Facturo <onboarding@resend.dev>',
      to: [inviteEmail],
      subject: `${ownerName} te-a invitat în Facturo`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <p style="color:#111">Bună,</p>
          <p style="color:#444">${ownerName} te-a invitat să lucrezi pe facturile firmelor din cabinetul său, ca operator.</p>
          <p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Acceptă invitația</a></p>
          <p style="color:#888;font-size:12px">Dacă ai deja cont, autentifică-te cu acest email și firmele apar automat.</p>
        </div>
      `
    })
    if (mailError) {
      return NextResponse.json({
        success: true,
        warning: 'Invitația este creată, dar emailul nu a plecat. Trimite manual linkul.',
        inviteUrl: link
      })
    }
    return NextResponse.json({ success: true, inviteUrl: link })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 })
  }
}
