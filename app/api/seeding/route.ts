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

type CreateRoomBody = {
  action: 'create-room'
  topic?: string
  college?: string
  category?: string
  admin_key?: string
}

type CreateMessageBody = {
  action: 'create-message'
  roomId?: string
  roomName?: string
  username?: string
  text?: string
  college?: string
  shouldIncrementUserCount?: boolean
  admin_key?: string
}

type SeedingRequestBody = CreateRoomBody | CreateMessageBody

const normalizeText = (value: unknown) => {
  return typeof value === 'string' ? value.trim() : ''
}

const buildRoomHeadline = (topic: string, college: string, category: string) => {
  return [topic, college, category].filter(Boolean).join(' · ')
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

  const adminKey = body?.admin_key || readAdminBroadcastSecretFromHeaders(request.headers)
  const adminSessionToken = request.cookies.get(ADMIN_BROADCAST_COOKIE_NAME)?.value || ''

  if (!isValidAdminBroadcastSecret(adminKey) && !isAuthorizedAdminBroadcastSession(adminSessionToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let adminSupabase: ReturnType<typeof ensureAdminSupabase>

  try {
    adminSupabase = ensureAdminSupabase()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Configuration error' },
      { status: 500 }
    )
  }

  if (body?.action === 'create-room') {
    const topic = normalizeText(body.topic)
    const college = normalizeText(body.college)
    const category = normalizeText(body.category) || 'General'

    if (!topic) {
      return NextResponse.json({ error: 'Room topic is required' }, { status: 400 })
    }

    if (!college) {
      return NextResponse.json({ error: 'College name is required' }, { status: 400 })
    }

    const headline = buildRoomHeadline(topic, college, category)

    const { data, error } = await adminSupabase
      .from('rooms')
      .insert({
        headline,
        message_count: 0,
        user_count: 0,
        total_seconds_spent: 0,
        time_spent_minutes: 0,
      })
      .select('id, headline')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Failed to create room' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      room: data,
    })
  }

  if (body?.action === 'create-message') {
    const roomId = normalizeText(body.roomId)
    const roomName = normalizeText(body.roomName)
    const username = normalizeText(body.username)
    const text = normalizeText(body.text)
    const college = normalizeText(body.college)

    if (!roomId || !roomName || !username || !text) {
      return NextResponse.json({ error: 'roomId, roomName, username, and text are required' }, { status: 400 })
    }

    const { error: insertError } = await adminSupabase
      .from('messages')
      .insert({
        content: text,
        display_name: username,
        college: college || null,
        room_name: roomName,
        room_id: roomId,
        user_uuid: null,
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message || 'Failed to create message' }, { status: 500 })
    }

    const { error: messageCountError } = await adminSupabase.rpc('increment_room_message_count', {
      room_id: roomId,
    })

    if (messageCountError) {
      return NextResponse.json({ error: messageCountError.message || 'Failed to update room stats' }, { status: 500 })
    }

    if (body.shouldIncrementUserCount) {
      const { error: userCountError } = await adminSupabase.rpc('increment_room_user_count', {
        room_id: roomId,
      })

      if (userCountError) {
        return NextResponse.json({ error: userCountError.message || 'Failed to update room stats' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unsupported seeding action' }, { status: 400 })
}
