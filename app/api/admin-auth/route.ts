import { NextRequest, NextResponse } from 'next/server'
import {
  ADMIN_BROADCAST_COOKIE_NAME,
  getAdminBroadcastCookieOptions,
  getAdminBroadcastSessionToken,
  hasAdminBroadcastSecretConfigured,
  isValidAdminBroadcastSecret,
  readAdminBroadcastSecretFromHeaders,
} from '@/lib/admin-auth'

export const runtime = 'nodejs'

type AdminAuthRequestBody = {
  admin_key?: string
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

  let body: AdminAuthRequestBody | null = null

  try {
    body = (await request.json()) as AdminAuthRequestBody
  } catch {
    body = null
  }

  const adminKey = body?.admin_key || readAdminBroadcastSecretFromHeaders(request.headers)

  if (!isValidAdminBroadcastSecret(adminKey)) {
    return NextResponse.json({ error: 'Invalid admin key' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(
    ADMIN_BROADCAST_COOKIE_NAME,
    getAdminBroadcastSessionToken(),
    getAdminBroadcastCookieOptions()
  )

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_BROADCAST_COOKIE_NAME, '', {
    ...getAdminBroadcastCookieOptions(),
    maxAge: 0,
  })

  return response
}
