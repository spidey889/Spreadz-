import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import {
  ADMIN_BROADCAST_COOKIE_NAME,
  hasAdminBroadcastSecretConfigured,
  isAuthorizedAdminBroadcastSession,
  isValidAdminBroadcastSecret,
  readAdminBroadcastSecretFromHeaders,
} from '@/lib/admin-auth'

const webpush = require('web-push')

export const runtime = 'nodejs'

type BroadcastPushRequestBody = {
  title?: string
  message?: string
  admin_key?: string
}

type StoredPushSubscription = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    auth: string
    p256dh: string
  }
}

type BroadcastNotificationPayload = {
  title: string
  body: string
  url: string
  tag: string
  icon: string
  badge: string
}

type PostgrestLikeError = {
  code?: string
  details?: string | null
  hint?: string | null
  message?: string
}

let vapidConfigured = false

const tryParseJson = (value: string) => {
  try {
    return JSON.parse(value) as Json
  } catch {
    return null
  }
}

const maskEndpoint = (endpoint: string) => {
  if (!endpoint) return 'unknown-endpoint'
  if (endpoint.length <= 24) return endpoint
  return `${endpoint.slice(0, 16)}...${endpoint.slice(-8)}`
}

const getPostgrestErrorText = (error: PostgrestLikeError | null | undefined) => {
  return [error?.message, error?.details, error?.hint]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .toLowerCase()
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

const ensureBroadcastConfig = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
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

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    throw new Error('Missing VAPID configuration')
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    vapidConfigured = true
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

  let body: BroadcastPushRequestBody | null = null

  try {
    body = (await request.json()) as BroadcastPushRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const adminKey = body?.admin_key || readAdminBroadcastSecretFromHeaders(request.headers)
  const adminSessionToken = request.cookies.get(ADMIN_BROADCAST_COOKIE_NAME)?.value || ''

  if (!isValidAdminBroadcastSecret(adminKey) && !isAuthorizedAdminBroadcastSession(adminSessionToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  let adminSupabase: ReturnType<typeof ensureBroadcastConfig>

  try {
    adminSupabase = ensureBroadcastConfig()
  } catch (error) {
    console.error('[BroadcastPush] Route configuration error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Configuration error' },
      { status: 500 }
    )
  }

  const { data: subscriptions, error: fetchError } = await adminSupabase
    .from('push_subscriptions')
    .select('id, user_uuid, subscription')

  if (fetchError) {
    console.error('[BroadcastPush] Failed to load subscriptions', fetchError)

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

  const notificationPayload: BroadcastNotificationPayload = {
    title,
    body: message,
    url: '/chat',
    tag: `spreadz-broadcast-${Date.now()}`,
    icon: '/spreadz-logo.png',
    badge: '/push-badge-monochrome.png',
  }

  let sent = 0
  let deleted = 0
  let failed = 0
  let invalid = 0
  let attempted = 0

  await Promise.all(
    (subscriptions || []).map(async (row) => {
      const subscription = normalizeSubscription(row.subscription)
      if (!subscription) {
        invalid += 1
        console.log('[BroadcastPush] Skipping invalid push subscription', {
          subscriptionId: row.id,
          userUuid: row.user_uuid,
        })
        return
      }

      try {
        attempted += 1
        await webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
        sent += 1
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || 0)

        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await adminSupabase
            .from('push_subscriptions')
            .delete()
            .eq('id', row.id)

          if (deleteError) {
            console.error('[BroadcastPush] Failed to delete expired subscription', deleteError)
            failed += 1
            return
          }

          deleted += 1
          console.log('[BroadcastPush] Deleted expired push subscription', {
            subscriptionId: row.id,
            endpoint: maskEndpoint(subscription.endpoint),
            statusCode,
          })
          return
        }

        failed += 1
        console.error('[BroadcastPush] Failed to send notification', {
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
    subscriptionsFound: subscriptions?.length ?? 0,
    attempted,
    sent,
    deleted,
    failed,
    invalid,
  }

  console.log('[BroadcastPush] Summary', summary)

  return NextResponse.json({
    ok: true,
    ...summary,
  })
}
