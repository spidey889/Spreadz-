import { createHash, timingSafeEqual } from 'node:crypto'

export const ADMIN_BROADCAST_COOKIE_NAME = 'spreadz_admin_broadcast'

const ADMIN_BROADCAST_MAX_AGE_SECONDS = 60 * 60 * 8

const normalizeSecretValue = (value: string | null | undefined) => {
  return typeof value === 'string' ? value.trim() : ''
}

const safeCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export const getAdminBroadcastSecret = () => {
  return normalizeSecretValue(process.env.ADMIN_BROADCAST_SECRET || process.env.ADMIN_SECRET_KEY)
}

export const hasAdminBroadcastSecretConfigured = () => {
  return Boolean(getAdminBroadcastSecret())
}

export const isValidAdminBroadcastSecret = (candidate: string | null | undefined) => {
  const configuredSecret = getAdminBroadcastSecret()
  const normalizedCandidate = normalizeSecretValue(candidate)

  if (!configuredSecret || !normalizedCandidate) {
    return false
  }

  return safeCompare(configuredSecret, normalizedCandidate)
}

export const getAdminBroadcastSessionToken = () => {
  const configuredSecret = getAdminBroadcastSecret()

  if (!configuredSecret) {
    return ''
  }

  return createHash('sha256').update(configuredSecret).digest('hex')
}

export const isAuthorizedAdminBroadcastSession = (candidate: string | null | undefined) => {
  const expectedToken = getAdminBroadcastSessionToken()
  const normalizedCandidate = normalizeSecretValue(candidate)

  if (!expectedToken || !normalizedCandidate) {
    return false
  }

  return safeCompare(expectedToken, normalizedCandidate)
}

export const readAdminBroadcastSecretFromHeaders = (headers: Headers) => {
  const directHeaderSecret = normalizeSecretValue(headers.get('x-admin-key'))
  if (directHeaderSecret) {
    return directHeaderSecret
  }

  const authorizationHeader = normalizeSecretValue(headers.get('authorization'))
  if (!authorizationHeader) {
    return ''
  }

  const [scheme, token] = authorizationHeader.split(' ')
  if (!/^Bearer$/i.test(scheme)) {
    return ''
  }

  return normalizeSecretValue(token)
}

export const getAdminBroadcastCookieOptions = () => {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_BROADCAST_MAX_AGE_SECONDS,
  }
}
