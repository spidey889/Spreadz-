import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import SeedingClient from './SeedingClient'
import {
  ADMIN_BROADCAST_COOKIE_NAME,
  hasAdminBroadcastSecretConfigured,
  isAuthorizedAdminBroadcastSession,
} from '@/lib/admin-auth'

export const metadata: Metadata = {
  title: 'Admin Seeding | SpreadZ',
}

export const dynamic = 'force-dynamic'

export default function SeedingPage() {
  const cookieStore = cookies()
  const isAuthorized = isAuthorizedAdminBroadcastSession(
    cookieStore.get(ADMIN_BROADCAST_COOKIE_NAME)?.value || ''
  )

  return (
    <SeedingClient
      isInitiallyAuthorized={isAuthorized}
      secretConfigured={hasAdminBroadcastSecretConfigured()}
    />
  )
}
