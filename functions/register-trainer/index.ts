import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '')
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

async function createAuthUserViaAdminApi(params: {
  email: string
  password: string
  full_name?: string
  role: string
}) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      email_confirm: true,
      user_metadata: { full_name: params.full_name, role: params.role },
      app_metadata: { role: params.role }
    })
  })

  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    return {
      user: null,
      error: {
        message: (json as any)?.msg || (json as any)?.error_description || (json as any)?.error || `HTTP ${resp.status}`,
        code: (json as any)?.code || null,
        status: resp.status
      }
    }
  }

  return { user: (json as any)?.user || json, error: null }
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

    // Check admin claim in returned user object first, then fallback to users table
    const callerClaimRole = caller?.user_metadata?.role || caller?.role || caller?.app_metadata?.role || null
    if (callerClaimRole !== 'admin') {
      const { data: callerRow, error: callerError } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', callerId)
        .single()
      if (callerError || !callerRow || callerRow.role !== 'admin') {
        return makeResponse({ error: 'Insufficient permissions' }, 403, origin)
      }
    }

    // Parse body (already validated content-type)
    const body: any = await req.json()
    let { email, full_name, role, athleteData, trainer_id, bio } = body || {}

    // Default role to trainer if not provided
    if (!role) role = 'trainer'

    if (!email) return makeResponse({ error: 'Missing required fields' }, 400, origin)

    // Create auth user: use provided password if present, otherwise generate one
    const providedPassword = (body?.password || '').trim() || null
    const tempPass = providedPassword ? null : randomPassword()
    const passwordToUse = providedPassword || tempPass!
    const temp_password_provided = !providedPassword

    const { user: createdUser, error: authError } = await createAuthUserViaAdminApi({
      email,
      password: passwordToUse,
      full_name,
      role
    })
    if (authError) {
      console.error('register-trainer: createUser failed', authError)
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
    const newUserId = createdUser?.id
    if (!newUserId) {
      return makeResponse({ error: 'Failed to create user' }, 500, origin)
    }

    // Insert into public.users, copying extra top-level fields from the request
    const userInsert: any = { id: newUserId, email, full_name, role }
    // Don't copy role-specific profile fields into `users` (they belong in trainers/athletes)
    const excludeKeys = [
      'password', 'token', 'access_token', 'admin_token', 'athleteData',
      // trainer-specific
      'bio',
      // athlete-specific
      'position', 'height_cm', 'weight_lbs', 'birthday', 'throwing_side', 'batting_side', 'trainer_id'
    ]
    for (const [k, v] of Object.entries(body || {})) {
      if (excludeKeys.includes(k)) continue
      if (['email', 'full_name', 'role'].includes(k)) continue
      userInsert[k] = v
    }

    // Upsert users row (insert or update) so role is attached immediately
    const { error: usersError } = await supabaseAdmin.from('users').upsert([userInsert], { onConflict: 'id' })
    if (usersError) {
      console.error('register-trainer: users upsert failed', usersError)
      // cleanup: remove created auth user
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
      } catch (delErr) {
        console.error('register-trainer: rollback auth delete failed', delErr)
      }
      return makeResponse({ error: 'Failed to save user profile' }, 500, origin)
    }

    // Insert role-specific profile; if this fails, roll back users + auth user to avoid orphans
    try {
      if (role === 'trainer') {
        const { error: trainerErr } = await supabaseAdmin.from('trainers').insert([{ id: newUserId, bio: bio || null }])
        if (trainerErr) throw trainerErr
      } else if (role === 'athlete') {
        const athleteRow = {
          id: newUserId,
          trainer_id: trainer_id || athleteData?.trainer_id || null,
          position: athleteData?.position || null,
          height_cm: athleteData?.height_cm || null,
          weight_lbs: athleteData?.weight_lbs || null,
          birthday: athleteData?.birthday || null,
          throwing_side: athleteData?.throwing_side || null,
          batting_side: athleteData?.batting_side || null
        }
        const { error: athleteErr } = await supabaseAdmin.from('athletes').insert([athleteRow])
        if (athleteErr) throw athleteErr
      }
    } catch (profileErr) {
      console.error('register-trainer: role profile creation failed', profileErr)
      try {
        const { error: delUserErr } = await supabaseAdmin.from('users').delete().eq('id', newUserId)
        if (delUserErr) console.error('register-trainer: rollback users delete failed', delUserErr)
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
      } catch (rbErr) {
        console.error('register-trainer: rollback failed', rbErr)
      }
      return makeResponse({ error: 'Failed to create role profile' }, 500, origin)
    }

    // Send password reset email only when we generated a temp password
    let email_sent = false
    let reset_email_error: string | null = null
    // Send password reset email only when we generated a temp password and the
    // caller did not explicitly disable emails (useful for bulk test account creation).
    const sendResetEmail = !(body?.send_reset_email === false)
    if (temp_password_provided && sendResetEmail) {
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo: APP_REDIRECT_URL
      })
      if (resetError) {
        console.error('register-trainer: resetPasswordForEmail failed', resetError)
        email_sent = false
        reset_email_error = resetError.message || 'Failed to send auth email'
      } else {
        email_sent = true
      }
    }

    const responseBody: any = {
      user: { id: newUserId, email, role, full_name },
      temp_password_provided,
      temp_password: temp_password_provided ? passwordToUse : null,
      auth_email_requested: temp_password_provided && sendResetEmail,
      reset_email_error,
      email_sent
    }

    return makeResponse(responseBody, 201, origin)
  } catch (err) {
    console.error('register-trainer: unhandled error', err)
    return makeResponse({ error: 'Internal server error' }, 500)
  }
})
