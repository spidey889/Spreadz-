import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

const webpush = require('web-push')

export const runtime = 'nodejs'

type SendPushRequestBody = {
  room_id?: string
  message_id?: string
}

type StoredPushSubscription = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    auth: string
    p256dh: string
  }
}

type PushNotificationPayload = {
  title: string
  body: string
  url: string
  tag: string
  icon: string
  badge: string
  image?: string
}

let vapidConfigured = false
const PUSH_NOTIFICATION_PREVIEW_MAX_LENGTH = 120

type PostgrestLikeError = {
  code?: string
  details?: string | null
  hint?: string | null
  message?: string
}

const maskEndpoint = (endpoint: string) => {
  if (!endpoint) return 'unknown-endpoint'
  if (endpoint.length <= 24) return endpoint
  return `${endpoint.slice(0, 16)}...${endpoint.slice(-8)}`
}

const ensureConfig = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT

  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL configuration')
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('Missing Supabase service role configuration')
  }

  const supabaseAuthKey = supabaseAnonKey || supabaseServiceRoleKey

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    throw new Error('Missing VAPID configuration')
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    vapidConfigured = true
  }

  return {
    authSupabase: createClient<Database>(supabaseUrl, supabaseAuthKey, {
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

const getPostgrestErrorText = (error: PostgrestLikeError | null | undefined) => {
  return [error?.message, error?.details, error?.hint]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .toLowerCase()
}

const isMissingMessagesUserUuidError = (error: PostgrestLikeError | null | undefined) => {
  const errorText = getPostgrestErrorText(error)

  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    (errorText.includes('messages') && errorText.includes('user_uuid'))
  )
}

const isMissingPushSubscriptionsSchemaError = (error: PostgrestLikeError | null | undefined) => {
  const errorText = getPostgrestErrorText(error)

  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST204' ||
    errorText.includes('push_subscriptions')
  )
}

const normalizeSubscription = (value: Json | null): StoredPushSubscription | null => {
  if (!value) return null

  const parsedValue = typeof value === 'string' ? tryParseJson(value) : value
  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    return null
  }

  const subscriptionRecord = parsedValue as Record<string, unknown>
  const endpoint =
    typeof subscriptionRecord.endpoint === 'string' && subscriptionRecord.endpoint.trim()
      ? subscriptionRecord.endpoint.trim()
      : null
  const rawKeys =
    subscriptionRecord.keys && typeof subscriptionRecord.keys === 'object' && !Array.isArray(subscriptionRecord.keys)
      ? (subscriptionRecord.keys as Record<string, unknown>)
      : null
  const auth =
    rawKeys && typeof rawKeys.auth === 'string' && rawKeys.auth.trim() ? rawKeys.auth.trim() : null
  const p256dh =
    rawKeys && typeof rawKeys.p256dh === 'string' && rawKeys.p256dh.trim() ? rawKeys.p256dh.trim() : null

  if (!endpoint || !auth || !p256dh) {
    return null
  }

  return {
    endpoint,
    expirationTime:
      typeof subscriptionRecord.expirationTime === 'number' ? subscriptionRecord.expirationTime : null,
    keys: {
      auth,
      p256dh,
    },
  }
}

const tryParseJson = (value: string) => {
  try {
    return JSON.parse(value) as Json
  } catch {
    return null
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

const buildMessagePreview = (messageContent: string | null | undefined) => {
  const trimmedContent = typeof messageContent === 'string' ? messageContent.trim() : ''

  if (!trimmedContent) {
    return 'sent a new message'
  }

  if (trimmedContent.length <= PUSH_NOTIFICATION_PREVIEW_MAX_LENGTH) {
    return trimmedContent
  }

  return `${trimmedContent.slice(0, PUSH_NOTIFICATION_PREVIEW_MAX_LENGTH - 3)}...`
}

export async function POST(request: Request) {
  let body: SendPushRequestBody | null = null

  try {
    body = (await request.json()) as SendPushRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const roomId = typeof body?.room_id === 'string' && body.room_id.trim() ? body.room_id.trim() : ''
  const messageId = typeof body?.message_id === 'string' && body.message_id.trim() ? body.message_id.trim() : ''
  const accessToken = getBearerToken(request)

  console.log('[Push] /api/send-push called', {
    roomId,
    messageId,
  })

  if (!roomId) {
    return NextResponse.json({ error: 'room_id is required' }, { status: 400 })
  }

  if (!messageId) {
    return NextResponse.json({ error: 'message_id is required' }, { status: 400 })
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Authorization is required' }, { status: 401 })
  }

  let authSupabase: ReturnType<typeof ensureConfig>['authSupabase']
  let adminSupabase: ReturnType<typeof ensureConfig>['adminSupabase']

  try {
    const config = ensureConfig()
    authSupabase = config.authSupabase
    adminSupabase = config.adminSupabase
  } catch (error) {
    console.error('[Push] Route configuration error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Configuration error' },
      { status: 500 }
    )
  }

  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser(accessToken)

  if (authError || !user) {
    console.error('[Push] Authorization failed', authError)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: message, error: messageError } = await adminSupabase
    .from('messages')
    .select('id, room_id, user_uuid, display_name, content')
    .eq('id', messageId)
    .eq('room_id', roomId)
    .eq('user_uuid', user.id)
    .maybeSingle()

  if (messageError) {
    console.error('[Push] Failed to verify message ownership', messageError)

    if (isMissingMessagesUserUuidError(messageError)) {
      return NextResponse.json(
        {
          error: 'Push delivery requires the messages.user_uuid column. Apply sql/add_messages_user_uuid.sql to Supabase.',
          code: 'MESSAGES_USER_UUID_MISSING',
        },
        { status: 503 }
      )
    }

    return NextResponse.json({ error: 'Failed to verify message' }, { status: 500 })
  }

  if (!message) {
    return NextResponse.json({ error: 'Message not found for current user' }, { status: 403 })
  }

  const senderName =
    typeof message.display_name === 'string' && message.display_name.trim() ? message.display_name.trim() : 'Someone'
  const messagePreview = buildMessagePreview(message.content)
  let senderAvatarUrl = ''

  if (typeof message.user_uuid === 'string' && message.user_uuid.trim()) {
    const { data: senderProfile, error: senderProfileError } = await adminSupabase
      .from('users')
      .select('avatar_url')
      .eq('uuid', message.user_uuid)
      .maybeSingle()

    if (senderProfileError) {
      console.error('[Push] Failed to load sender avatar', senderProfileError)
    } else if (typeof senderProfile?.avatar_url === 'string' && senderProfile.avatar_url.trim()) {
      senderAvatarUrl = senderProfile.avatar_url.trim()
    }
  }

  const { data: subscriptions, error: fetchError } = await adminSupabase
    .from('push_subscriptions')
    .select('id, user_uuid, subscription')

  if (fetchError) {
    console.error('[Push] Failed to load subscriptions', fetchError)

    if (isMissingPushSubscriptionsSchemaError(fetchError)) {
      return NextResponse.json(
        {
          error: 'Push delivery requires the push_subscriptions table. Apply the push subscription SQL setup to Supabase.',
          code: 'PUSH_SUBSCRIPTIONS_SCHEMA_MISSING',
        },
        { status: 503 }
      )
    }

    return NextResponse.json({ error: 'Failed to load subscriptions' }, { status: 500 })
  }

  console.log('[Push] Loaded push subscriptions', {
    roomId,
    subscriptionsFound: subscriptions?.length ?? 0,
  })

  const targetUrl = `/chat?${new URLSearchParams({ roomId, messageId: message.id }).toString()}`
  const notificationPayload: PushNotificationPayload = {
    title: senderName,
    body: messagePreview,
    url: targetUrl,
    tag: `spreadz-room-${roomId}`,
    icon: senderAvatarUrl || '/spreadz-logo.png',
    badge: '/push-badge-monochrome.png',
  }

  let sent = 0
  let skipped = 0
  let deleted = 0
  let failed = 0
  let invalid = 0
  let attempted = 0

  await Promise.all(
    (subscriptions || []).map(async (row) => {
      if (row.user_uuid && row.user_uuid === user.id) {
        skipped += 1
        return
      }

      const subscription = normalizeSubscription(row.subscription)
      if (!subscription) {
        invalid += 1
        console.log('[Push] Skipping invalid push subscription', {
          subscriptionId: row.id,
          userUuid: row.user_uuid,
        })
        return
      }

      try {
        attempted += 1
        await webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
        sent += 1
        console.log('[Push] Notification sent successfully', {
          subscriptionId: row.id,
          endpoint: maskEndpoint(subscription.endpoint),
        })
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || 0)

        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await adminSupabase
            .from('push_subscriptions')
            .delete()
            .eq('id', row.id)

          if (deleteError) {
            console.error('[Push] Failed to delete expired subscription', deleteError)
            failed += 1
            return
          }

          deleted += 1
          console.log('[Push] Deleted expired push subscription', {
            subscriptionId: row.id,
            endpoint: maskEndpoint(subscription.endpoint),
            statusCode,
          })
          return
        }

        failed += 1
        console.error('[Push] Failed to send notification', {
          subscriptionId: row.id,
          endpoint: maskEndpoint(subscription.endpoint),
          statusCode,
          message: error?.message,
          body: error?.body,
        })
      }
    })
  )

  const summary = {
    roomId,
    subscriptionsFound: subscriptions?.length ?? 0,
    attempted,
    sent,
    skipped,
    deleted,
    failed,
    invalid,
  }

  console.log('[Push] send-push summary', summary)

  return NextResponse.json({
    ok: true,
    ...summary,
    sent,
    skipped,
    deleted,
    failed,
  })
}
