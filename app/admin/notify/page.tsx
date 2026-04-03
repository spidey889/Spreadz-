import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import AdminNotifyClient from './AdminNotifyClient'
import {
  ADMIN_BROADCAST_COOKIE_NAME,
  hasAdminBroadcastSecretConfigured,
  isAuthorizedAdminBroadcastSession,
} from '@/lib/admin-auth'

export const metadata: Metadata = {
  title: 'Admin Broadcast | SpreadZ',
}

export const dynamic = 'force-dynamic'

export default function AdminNotifyPage() {
  const cookieStore = cookies()
  const isAuthorized = isAuthorizedAdminBroadcastSession(
    cookieStore.get(ADMIN_BROADCAST_COOKIE_NAME)?.value || ''
  )

  return (
    <AdminNotifyClient
      isInitiallyAuthorized={isAuthorized}
      secretConfigured={hasAdminBroadcastSecretConfigured()}
    />
  )
}
