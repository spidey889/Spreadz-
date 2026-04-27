import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import Hell2Client from './Hell2Client'
import {
  ADMIN_BROADCAST_COOKIE_NAME,
  hasAdminBroadcastSecretConfigured,
  isAuthorizedAdminBroadcastSession,
} from '@/lib/admin-auth'

export const metadata: Metadata = {
  title: 'Seed Fake Profiles | SpreadZ',
}

export const dynamic = 'force-dynamic'

export default function Hell2Page() {
  const cookieStore = cookies()
  const isAuthorized = isAuthorizedAdminBroadcastSession(
    cookieStore.get(ADMIN_BROADCAST_COOKIE_NAME)?.value || ''
  )

  return (
    <Hell2Client
      isInitiallyAuthorized={isAuthorized}
      secretConfigured={hasAdminBroadcastSecretConfigured()}
    />
  )
}
