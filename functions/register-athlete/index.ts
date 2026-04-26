import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_REDIRECT_URL = Deno.env.get('APP_REDIRECT_URL') || 'https://oy-yuji.github.io/yoy-baseball-app/'
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://oy-yuji.github.io,http://localhost:3000,http://localhost:5173,http://localhost:5500,http://127.0.0.1:5500')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

function randomPassword() {
  const arr = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(arr).map((b) => ('0' + b.toString(16)).slice(-2)).join('')
}

function resolveAllowedOrigin(origin?: string) {
  if (!origin || origin === 'null') return null
  return ALLOWED_ORIGINS.includes(origin) ? origin : null
}

function getCorsHeaders(origin?: string) {
  const allowedOrigin = resolveAllowedOrigin(origin)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  }
  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin
  return headers
}

function makeResponse(obj: any, status = 200, origin?: string) {
  return new Response(JSON.stringify(obj), { status, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  try {
    const origin = req.headers.get('origin') || ''
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(origin) })
    }
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: getCorsHeaders(origin) })

    // Require JSON Content-Type
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return makeResponse({ error: 'Content-Type must be application/json' }, 400, origin)
    }

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) {
      return makeResponse({ error: 'Missing Authorization token' }, 401, origin)
    }

    // Validate token server-side using Supabase auth endpoint and the service role key
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY }
    })
    if (!userResp.ok) {
      return makeResponse({ error: 'Invalid token' }, 401, origin)
    }
    const caller = await userResp.json()
    const callerId = caller?.id
    if (!callerId) {
      return makeResponse({ error: 'Cannot determine caller from token' }, 401, origin)
    }

    // Allow both admin and trainer roles
    const callerClaimRole = caller?.user_metadata?.role || caller?.role || caller?.app_metadata?.role || null
    let allowed = false
    if (callerClaimRole === 'admin' || callerClaimRole === 'trainer') {
      allowed = true
    } else {
      // fallback to users table
      const { data: callerRow, error: callerError } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', callerId)
        .single()
      if (!callerError && callerRow && (callerRow.role === 'admin' || callerRow.role === 'trainer')) {
        allowed = true
      }
    }
    if (!allowed) {
      return makeResponse({ error: 'Insufficient permissions' }, 403, origin)
    }

    // Parse body
    const body: any = await req.json()
    let { email, full_name, athleteData, trainer_id } = body || {}
    if (!email) return makeResponse({ error: 'Missing required fields' }, 400, origin)

    // Create auth user
    const providedPassword = (body?.password || '').trim() || null
    const tempPass = providedPassword ? null : randomPassword()
    const passwordToUse = providedPassword || tempPass!
    const temp_password_provided = !providedPassword

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passwordToUse,
      email_confirm: true,
      user_metadata: { full_name, role: 'athlete' },
      app_metadata: { role: 'athlete' }
    })
    if (authError) {
      console.error('register-athlete: createUser failed', authError)
      return makeResponse(
        {
          error: authError.message || 'Failed to create auth user',
          code: (authError as any)?.code || null,
          details: (authError as any)?.status || null
        },
        400,
        origin
      )
    }
    const newUserId = authUser.user?.id
    if (!newUserId) {
      return makeResponse({ error: 'Failed to create user' }, 500, origin)
    }

    // Upsert users row
    const userInsert: any = { id: newUserId, email, full_name, role: 'athlete' }
    const { error: usersError } = await supabaseAdmin.from('users').upsert([userInsert], { onConflict: 'id' })
    if (usersError) {
      try { await supabaseAdmin.auth.admin.deleteUser(newUserId) } catch {}
      console.error('register-athlete: users upsert failed', usersError)
      return makeResponse({ error: 'Failed to save user profile' }, 500, origin)
    }

    // Insert athlete profile
    try {
      const athleteRow = {
        id: newUserId,
        trainer_id: trainer_id || athleteData?.trainer_id || callerId,
        position: athleteData?.position || null,
        height_cm: athleteData?.height_cm || null,
        weight_lbs: athleteData?.weight_lbs || null,
        birthday: athleteData?.birthday || null,
        throwing_side: athleteData?.throwing_side || null,
        batting_side: athleteData?.batting_side || null
      }
      const { data: athleteInserted, error: athleteErr } = await supabaseAdmin.from('athletes').insert([athleteRow]).select('*')
      if (athleteErr) throw athleteErr
      // attach the inserted athlete row for the response
      var insertedAthlete = athleteInserted && athleteInserted.length ? athleteInserted[0] : null
    } catch (profileErr) {
      try {
        await supabaseAdmin.from('users').delete().eq('id', newUserId)
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
      } catch {}
      console.error('register-athlete: athlete profile creation failed', profileErr)
      return makeResponse({ error: 'Failed to create athlete profile' }, 500, origin)
    }

    // Always send onboarding/reset email by default so new athletes can activate access.
    // Can be disabled only when caller explicitly sets send_reset_email = false.
    let email_sent = false
    const sendResetEmail = !(body?.send_reset_email === false)
    if (sendResetEmail) {
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo: APP_REDIRECT_URL
      })
      if (!resetError) email_sent = true
    }

    const responseBody: any = {
      user: { id: newUserId, email, role: 'athlete', full_name },
      athlete: insertedAthlete || null,
      temp_password_provided,
      auth_email_requested: sendResetEmail,
      email_sent
    }

    return makeResponse(responseBody, 201, origin)
  } catch (err) {
    console.error('register-athlete: unhandled error', err)
    return makeResponse({ error: 'Internal server error' }, 500)
  }
})
