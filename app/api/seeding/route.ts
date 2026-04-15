import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  ADMIN_BROADCAST_COOKIE_NAME,
  hasAdminBroadcastSecretConfigured,
  isAuthorizedAdminBroadcastSession,
  isValidAdminBroadcastSecret,
  readAdminBroadcastSecretFromHeaders,
} from '@/lib/admin-auth'

export const runtime = 'nodejs'

type SeedRun = {
  id: string
  room_name: string
  feed_position: number | null
  scheduled_for: string | null
  status: string | null
  messages_input: string | null
  total_messages: number | null
  posted_count: number | null
  room_id: string | null
  last_error: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
}

type CreateRunBody = {
  action: 'create-run'
  roomName?: string
  feedPosition?: number
  scheduledFor?: string
  messagesInput?: string
  totalMessages?: number
  admin_key?: string
}

type StartRunBody = {
  action: 'start-run'
  runId?: string
  admin_key?: string
}

type CreateMessageBody = {
  action: 'create-message'
  runId?: string
  roomId?: string
  displayName?: string
  college?: string
  messageText?: string
  shouldIncrementUserCount?: boolean
  admin_key?: string
}

type FailRunBody = {
  action: 'fail-run'
  runId?: string
  errorMessage?: string
  admin_key?: string
}

type SeedingRequestBody = CreateRunBody | StartRunBody | CreateMessageBody | FailRunBody

const selectSeedRunColumns =
  'id, room_name, feed_position, scheduled_for, status, messages_input, total_messages, posted_count, room_id, last_error, created_at, started_at, completed_at'

const normalizeText = (value: unknown) => {
  return typeof value === 'string' ? value.trim() : ''
}

const isUniqueViolation = (error: { code?: string } | null | undefined) => {
  return error?.code === '23505'
}

const normalizeInteger = (value: unknown) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

const ensureAdminSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL configuration')
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('Missing Supabase service role configuration')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

const isAuthorizedRequest = (request: NextRequest, adminKey?: string) => {
  const headerAdminKey = adminKey || readAdminBroadcastSecretFromHeaders(request.headers)
  const adminSessionToken = request.cookies.get(ADMIN_BROADCAST_COOKIE_NAME)?.value || ''

  return (
    isValidAdminBroadcastSecret(headerAdminKey) ||
    isAuthorizedAdminBroadcastSession(adminSessionToken)
  )
}

const fetchSeedRun = async (adminDb: any, runId: string) => {
  const { data, error } = await adminDb
    .from('seed_runs')
    .select(selectSeedRunColumns)
    .eq('id', runId)
    .maybeSingle()

  if (error) {
    return { run: null, error }
  }

  return { run: (data || null) as SeedRun | null, error: null }
}

const resolveSeedRoomId = (run: SeedRun) => {
  return normalizeText(run.room_id) || run.id
}

const getOrCreateRoomForRun = async (adminDb: any, run: SeedRun) => {
  const roomId = resolveSeedRoomId(run)

  const { data: existingRoom, error: existingRoomError } = await adminDb
    .from('rooms')
    .select('id')
    .eq('id', roomId)
    .maybeSingle()

  if (existingRoomError) {
    return { roomId: '', error: existingRoomError }
  }

  if (existingRoom?.id) {
    console.log('[Seeding] Reused room id', { runId: run.id, roomId: existingRoom.id })
    return { roomId: existingRoom.id, error: null }
  }

  const { data: insertedRoom, error: insertRoomError } = await adminDb
    .from('rooms')
    .insert({
      id: roomId,
      headline: run.room_name,
      feed_position: run.feed_position,
      message_count: 0,
      user_count: 0,
      total_seconds_spent: 0,
      time_spent_minutes: 0,
    })
    .select('id')
    .single()

  if (!insertRoomError && insertedRoom?.id) {
    console.log('[Seeding] Created room id', { runId: run.id, roomId: insertedRoom.id })
    return { roomId: insertedRoom.id, error: null }
  }

  if (!isUniqueViolation(insertRoomError)) {
    return { roomId: '', error: insertRoomError }
  }

  const { data: duplicateRoom, error: duplicateRoomError } = await adminDb
    .from('rooms')
    .select('id')
    .eq('id', roomId)
    .maybeSingle()

  if (duplicateRoomError) {
    return { roomId: '', error: duplicateRoomError }
  }

  if (!duplicateRoom?.id) {
    return { roomId: '', error: insertRoomError }
  }

  console.log('[Seeding] Reused room id after duplicate insert race', { runId: run.id, roomId })
  return { roomId: duplicateRoom.id, error: null }
}

export async function GET(request: NextRequest) {
  if (!hasAdminBroadcastSecretConfigured()) {
    return NextResponse.json(
      {
        error: 'Missing admin broadcast secret configuration',
        code: 'ADMIN_BROADCAST_SECRET_MISSING',
      },
      { status: 500 }
    )
  }

  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let adminDb: any

  try {
    adminDb = ensureAdminSupabase() as any
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Configuration error' },
      { status: 500 }
    )
  }

  const { data, error } = await adminDb
    .from('seed_runs')
    .select(selectSeedRunColumns)
    .order('scheduled_for', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message || 'Failed to load dashboard' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    runs: (data || []) as SeedRun[],
  })
}

export async function POST(request: NextRequest) {
  if (!hasAdminBroadcastSecretConfigured()) {
    return NextResponse.json(
      {
        error: 'Missing admin broadcast secret configuration',
        code: 'ADMIN_BROADCAST_SECRET_MISSING',
      },
      { status: 500 }
    )
  }

  let body: SeedingRequestBody | null = null

  try {
    body = (await request.json()) as SeedingRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!isAuthorizedRequest(request, body?.admin_key)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let adminDb: any

  try {
    adminDb = ensureAdminSupabase() as any
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Configuration error' },
      { status: 500 }
    )
  }

  if (body?.action === 'create-run') {
    const roomName = normalizeText(body.roomName)
    const feedPosition = normalizeInteger(body.feedPosition)
    const scheduledFor = normalizeText(body.scheduledFor)
    const messagesInput = normalizeText(body.messagesInput)
    const totalMessages = normalizeInteger(body.totalMessages)

    if (!roomName) {
      return NextResponse.json({ error: 'Room name is required' }, { status: 400 })
    }

    if (feedPosition === null || feedPosition < 1) {
      return NextResponse.json({ error: 'Feed position must be 1 or higher' }, { status: 400 })
    }

    if (!scheduledFor || Number.isNaN(new Date(scheduledFor).getTime())) {
      return NextResponse.json({ error: 'Scheduled time is invalid' }, { status: 400 })
    }

    if (!messagesInput) {
      return NextResponse.json({ error: 'Messages input is required' }, { status: 400 })
    }

    if (totalMessages === null || totalMessages < 1) {
      return NextResponse.json({ error: 'At least one message is required' }, { status: 400 })
    }

    const { data, error } = await adminDb
      .from('seed_runs')
      .insert({
        room_name: roomName,
        feed_position: feedPosition,
        scheduled_for: new Date(scheduledFor).toISOString(),
        status: 'scheduled',
        messages_input: messagesInput,
        total_messages: totalMessages,
        posted_count: 0,
        last_error: null,
      })
      .select(selectSeedRunColumns)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Failed to create run' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      run: data as SeedRun,
    })
  }

  if (body?.action === 'start-run') {
    const runId = normalizeText(body.runId)

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 })
    }

    const { run, error: runError } = await fetchSeedRun(adminDb, runId)

    if (runError) {
      return NextResponse.json({ error: runError.message || 'Failed to load run' }, { status: 500 })
    }

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    if (run.status === 'completed') {
      return NextResponse.json({ ok: true, run })
    }

    const { roomId, error: roomError } = await getOrCreateRoomForRun(adminDb, run)

    if (roomError || !roomId) {
      return NextResponse.json({ error: roomError?.message || 'Failed to create room' }, { status: 500 })
    }

    const { data, error } = await adminDb
      .from('seed_runs')
      .update({
        status: 'running',
        room_id: roomId,
        started_at: run.started_at || new Date().toISOString(),
        last_error: null,
      })
      .eq('id', runId)
      .select(selectSeedRunColumns)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Failed to start run' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      run: data as SeedRun,
    })
  }

  if (body?.action === 'create-message') {
    const runId = normalizeText(body.runId)
    const roomId = normalizeText(body.roomId)
    const displayName = normalizeText(body.displayName)
    const college = normalizeText(body.college)
    const messageText = normalizeText(body.messageText)

    if (!runId || !roomId || !displayName || !messageText) {
      return NextResponse.json(
        { error: 'runId, roomId, displayName, and messageText are required' },
        { status: 400 }
      )
    }

    const { run, error: runError } = await fetchSeedRun(adminDb, runId)

    if (runError) {
      return NextResponse.json({ error: runError.message || 'Failed to load run' }, { status: 500 })
    }

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    if (run.status === 'failed' || run.status === 'completed') {
      return NextResponse.json({ ok: true, run })
    }

    const { error: messageError } = await adminDb
      .from('messages')
      .insert({
        content: messageText,
        display_name: displayName,
        college: college || null,
        room_name: run.room_name,
        room_id: roomId,
        user_uuid: null,
      })

    if (messageError) {
      return NextResponse.json({ error: messageError.message || 'Failed to create message' }, { status: 500 })
    }

    console.log('[Seeding] Inserted message', {
      runId,
      roomId,
      displayName,
    })

    const { error: messageCountError } = await adminDb.rpc('increment_room_message_count', {
      room_id: roomId,
    })

    if (messageCountError) {
      return NextResponse.json(
        { error: messageCountError.message || 'Failed to update room message count' },
        { status: 500 }
      )
    }

    if (body.shouldIncrementUserCount) {
      const { error: userCountError } = await adminDb.rpc('increment_room_user_count', {
        room_id: roomId,
      })

      if (userCountError) {
        return NextResponse.json(
          { error: userCountError.message || 'Failed to update room user count' },
          { status: 500 }
        )
      }
    }

    const nextPostedCount = (run.posted_count || 0) + 1
    const nextStatus = nextPostedCount >= (run.total_messages || 0) ? 'completed' : 'running'

    const { data, error } = await adminDb
      .from('seed_runs')
      .update({
        posted_count: nextPostedCount,
        status: nextStatus,
        completed_at: nextStatus === 'completed' ? new Date().toISOString() : null,
        last_error: null,
      })
      .eq('id', runId)
      .select(selectSeedRunColumns)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Failed to update run' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      run: data as SeedRun,
    })
  }

  if (body?.action === 'fail-run') {
    const runId = normalizeText(body.runId)
    const errorMessage = normalizeText(body.errorMessage) || 'Run failed.'

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 })
    }

    const { data, error } = await adminDb
      .from('seed_runs')
      .update({
        status: 'failed',
        last_error: errorMessage,
      })
      .eq('id', runId)
      .select(selectSeedRunColumns)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Failed to update run' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      run: data as SeedRun,
    })
  }

  return NextResponse.json({ error: 'Unsupported seeding action' }, { status: 400 })
}
