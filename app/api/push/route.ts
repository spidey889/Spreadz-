import { NextResponse } from 'next/server'
import webpush from 'web-push'

export const runtime = 'nodejs'

type PushSubscriptionBody = {
  endpoint?: string
  expirationTime?: number | null
  keys?: {
    auth?: string
    p256dh?: string
  }
}

type PushRequestBody = {
  subscription?: PushSubscriptionBody
  title?: string
  body?: string
  url?: string
  tag?: string
}

let vapidConfigured = false

const ensureVapidConfig = () => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    throw new Error('Missing VAPID configuration')
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    vapidConfigured = true
  }
}

const hasValidSubscription = (subscription?: PushSubscriptionBody) => {
  return Boolean(
    subscription?.endpoint &&
    subscription?.keys?.auth &&
    subscription?.keys?.p256dh
  )
}

export async function POST(request: Request) {
  let body: PushRequestBody | null = null

  try {
    body = (await request.json()) as PushRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!hasValidSubscription(body?.subscription)) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const payload = {
    title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'SpreadZ',
    body: typeof body?.body === 'string' && body.body.trim() ? body.body.trim() : 'You have a new update.',
    url: typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : '/chat',
    tag: typeof body?.tag === 'string' && body.tag.trim() ? body.tag.trim() : 'spreadz-prototype',
  }

  try {
    ensureVapidConfig()
    await webpush.sendNotification(body.subscription as webpush.PushSubscription, JSON.stringify(payload))
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 0)

    if (statusCode === 404 || statusCode === 410) {
      return NextResponse.json({ error: 'Push subscription expired' }, { status: 410 })
    }

    console.error('[Push] Send failed', {
      statusCode,
      message: error?.message,
      body: error?.body,
    })

    return NextResponse.json({ error: 'Push send failed' }, { status: 502 })
  }
}
