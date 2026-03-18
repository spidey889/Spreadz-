import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

const webpush = require('web-push')

export const runtime = 'nodejs'

type SendPushRequestBody = {
  room_id?: string
  sender_name?: string
  message_preview?: string
  sender_uuid?: string
}

type StoredPushSubscription = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    auth: string
    p256dh: string
  }
}

let vapidConfigured = false

const ensureConfig = () => {
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

  return {
    supabase: createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
  }
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

export async function POST(request: Request) {
  let body: SendPushRequestBody | null = null

  try {
    body = (await request.json()) as SendPushRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const roomId = typeof body?.room_id === 'string' && body.room_id.trim() ? body.room_id.trim() : ''
  const senderName =
    typeof body?.sender_name === 'string' && body.sender_name.trim() ? body.sender_name.trim() : 'Someone'
  const messagePreview =
    typeof body?.message_preview === 'string' && body.message_preview.trim()
      ? body.message_preview.trim()
      : 'sent a new message'
  const senderUuid =
    typeof body?.sender_uuid === 'string' && body.sender_uuid.trim() ? body.sender_uuid.trim() : ''

  if (!roomId) {
    return NextResponse.json({ error: 'room_id is required' }, { status: 400 })
  }

  let supabase: ReturnType<typeof ensureConfig>['supabase']

  try {
    supabase = ensureConfig().supabase
  } catch (error) {
    console.error('[Push] Route configuration error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Configuration error' },
      { status: 500 }
    )
  }

  const { data: subscriptions, error: fetchError } = await supabase
    .from('push_subscriptions')
    .select('id, user_uuid, subscription')

  if (fetchError) {
    console.error('[Push] Failed to load subscriptions', fetchError)
    return NextResponse.json({ error: 'Failed to load subscriptions' }, { status: 500 })
  }

  const targetUrl = `/chat?${new URLSearchParams({ roomId }).toString()}`
  const notificationPayload = JSON.stringify({
    title: senderName,
    body: messagePreview,
    url: targetUrl,
    tag: `spreadz-room-${roomId}`,
  })

  let sent = 0
  let skipped = 0
  let deleted = 0
  let failed = 0

  await Promise.all(
    (subscriptions || []).map(async (row) => {
      if (row.user_uuid && senderUuid && row.user_uuid === senderUuid) {
        skipped += 1
        return
      }

      const subscription = normalizeSubscription(row.subscription)
      if (!subscription) {
        failed += 1
        return
      }

      try {
        await webpush.sendNotification(subscription, notificationPayload)
        sent += 1
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || 0)

        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', row.id)

          if (deleteError) {
            console.error('[Push] Failed to delete expired subscription', deleteError)
            failed += 1
            return
          }

          deleted += 1
          return
        }

        failed += 1
        console.error('[Push] Failed to send notification', {
          statusCode,
          message: error?.message,
        })
      }
    })
  )

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    deleted,
    failed,
  })
}
