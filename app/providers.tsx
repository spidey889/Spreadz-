'use client'

import type { ReactNode } from 'react'
import { PostHogProvider } from 'posthog-js/react'

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

export default function Providers({ children }: { children: ReactNode }) {
  if (!posthogKey || !posthogHost) {
    return <>{children}</>
  }

  return (
    <PostHogProvider
      apiKey={posthogKey}
      options={{
        api_host: posthogHost,
        defaults: '2026-01-30',
        // posthog-js enables autocapture by default.
        loaded: (posthog) => {
          posthog.startSessionRecording()
        },
      }}
    >
      {children}
    </PostHogProvider>
  )
}
