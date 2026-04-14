import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export const runtime = 'nodejs'

type FeedbackRequestBody = {
  feedbackId?: string
  rating?: number
  reason?: string | null
  otherText?: string | null
}

const ensureFeedbackClients = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL configuration')
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing Supabase anon key configuration')
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('Missing Supabase service role configuration')
  }

  return {
    authSupabase: createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    adminSupabase: createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
  }
}

const getBearerToken = (request: Request) => {
  const authorizationHeader = request.headers.get('authorization') || request.headers.get('Authorization') || ''
  const [scheme, token] = authorizationHeader.split(' ')

  if (!/^Bearer$/i.test(scheme) || !token?.trim()) {
    return ''
  }

  return token.trim()
}

const normalizeFeedbackId = (value: unknown) => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

const normalizeRating = (value: unknown) => {
  const parsedRating = Number(value)
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return null
  }

  return parsedRating
}

const normalizeOptionalText = (value: unknown) => {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue || null
}

const getCurrentUserId = async (
  authSupabase: ReturnType<typeof ensureFeedbackClients>['authSupabase'],
  accessToken: string
) => {
  if (!accessToken) {
    return null
  }

  const {
    data: { user },
    error,
  } = await authSupabase.auth.getUser(accessToken)

  if (error) {
    console.error('[Feedback] Failed to resolve auth user', error)
    return null
  }

  return user?.id ?? null
}

export async function POST(request: Request) {
  let body: FeedbackRequestBody | null = null

  try {
    body = (await request.json()) as FeedbackRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  let authSupabase: ReturnType<typeof ensureFeedbackClients>['authSupabase']
  let adminSupabase: ReturnType<typeof ensureFeedbackClients>['adminSupabase']

  try {
    const clients = ensureFeedbackClients()
    authSupabase = clients.authSupabase
    adminSupabase = clients.adminSupabase
  } catch (error) {
    console.error('[Feedback] Route configuration error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Configuration error' },
      { status: 500 }
    )
  }

  const feedbackId = normalizeFeedbackId(body?.feedbackId)
  const hasRating = body?.rating !== undefined
  const normalizedRating = hasRating ? normalizeRating(body?.rating) : undefined
  const ratingToWrite = normalizedRating === null ? undefined : normalizedRating

  if (hasRating && normalizedRating === null) {
    return NextResponse.json({ error: 'rating must be an integer from 1 to 5' }, { status: 400 })
  }

  const normalizedReason = normalizeOptionalText(body?.reason)
  const normalizedOtherText = normalizeOptionalText(body?.otherText)

  if (!feedbackId) {
    if (ratingToWrite === undefined) {
      return NextResponse.json({ error: 'rating is required when creating feedback' }, { status: 400 })
    }

    const currentUserId = await getCurrentUserId(authSupabase, getBearerToken(request))
    const insertPayload: Database['public']['Tables']['feedback']['Insert'] = {
      rating: ratingToWrite,
      user_id: currentUserId,
      created_at: new Date().toISOString(),
    }

    if (normalizedReason !== undefined) {
      insertPayload.reason = normalizedReason
    }

    if (normalizedOtherText !== undefined) {
      insertPayload.other_text = normalizedOtherText
    }

    const { data, error } = await adminSupabase
      .from('feedback')
      .insert(insertPayload)
      .select('id')
      .single()

    if (error) {
      console.error('[Feedback] Failed to create feedback row', {
        payload: insertPayload,
        error,
      })
      return NextResponse.json({ error: 'Failed to create feedback row' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  }

  const updatePayload: Database['public']['Tables']['feedback']['Update'] = {}

  if (ratingToWrite !== undefined) {
    updatePayload.rating = ratingToWrite
  }

  if (normalizedReason !== undefined) {
    updatePayload.reason = normalizedReason
  }

  if (normalizedOtherText !== undefined) {
    updatePayload.other_text = normalizedOtherText
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No feedback fields were provided to update' }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from('feedback')
    .update(updatePayload)
    .eq('id', feedbackId)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[Feedback] Failed to update feedback row', {
      feedbackId,
      payload: updatePayload,
      error,
    })
    return NextResponse.json({ error: 'Failed to update feedback row' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Feedback row not found' }, { status: 404 })
  }

  return NextResponse.json({ id: data.id })
}
