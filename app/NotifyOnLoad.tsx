'use client'

import { useEffect, useRef } from 'react'

export function NotifyOnLoad() {
  const hasFired = useRef(false)

  useEffect(() => {
    if (hasFired.current) return
    hasFired.current = true

    fetch('/api/notify-me', { method: 'POST' }).catch(() => {
      // Fail silently
    })
  }, [])

  return null
}
