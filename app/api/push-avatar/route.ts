import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export const runtime = 'nodejs'

const FALLBACK_AVATAR_PATH = '/spreadz-logo.png'

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

const toFallbackUrl = (request: Request) => new URL(FALLBACK_AVATAR_PATH, request.url)

const redirectToFallback = (request: Request) => NextResponse.redirect(toFallbackUrl(request), 307)

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const userUuid = requestUrl.searchParams.get('user_uuid')?.trim() || ''

  if (!userUuid) {
    return redirectToFallback(request)
  }

  let adminSupabase: ReturnType<typeof ensureAdminSupabase>

  try {
    adminSupabase = ensureAdminSupabase()
  } catch (error) {
    console.error('[PushAvatar] Route configuration error', error)
    return redirectToFallback(request)
  }

  const { data: senderProfile, error: senderProfileError } = await adminSupabase
    .from('users')
    .select('avatar_url')
    .eq('uuid', userUuid)
    .maybeSingle()

  if (senderProfileError) {
    console.error('[PushAvatar] Failed to load sender avatar', senderProfileError)
    return redirectToFallback(request)
  }

  const avatarUrl =
    typeof senderProfile?.avatar_url === 'string' && senderProfile.avatar_url.trim()
      ? senderProfile.avatar_url.trim()
      : ''

  if (!avatarUrl) {
    return redirectToFallback(request)
  }

  let upstreamUrl: URL

  try {
    upstreamUrl = new URL(avatarUrl)
  } catch {
    console.error('[PushAvatar] Invalid avatar URL', { userUuid, avatarUrl })
    return redirectToFallback(request)
  }

  if (!/^https?:$/i.test(upstreamUrl.protocol)) {
    console.error('[PushAvatar] Unsupported avatar URL protocol', { userUuid, protocol: upstreamUrl.protocol })
    return redirectToFallback(request)
  }

  let upstreamResponse: Response

  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        accept: 'image/*,*/*;q=0.8',
      },
      cache: 'force-cache',
      next: { revalidate: 3600 },
    })
  } catch (error) {
    console.error('[PushAvatar] Failed to fetch avatar image', { userUuid, error })
    return redirectToFallback(request)
  }

  if (!upstreamResponse.ok) {
    console.error('[PushAvatar] Avatar image request failed', {
      userUuid,
      status: upstreamResponse.status,
      avatarUrl,
    })
    return redirectToFallback(request)
  }

  const contentType = upstreamResponse.headers.get('content-type') || 'image/png'
  const cacheControl = upstreamResponse.headers.get('cache-control') || 'public, max-age=3600, s-maxage=3600'

  return new NextResponse(upstreamResponse.body, {
    headers: {
      'content-type': contentType,
      'cache-control': cacheControl,
    },
  })
}
