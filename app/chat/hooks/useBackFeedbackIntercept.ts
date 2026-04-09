'use client'

import { useEffect, useRef } from 'react'

const BACK_FEEDBACK_MARKER = '__spreadzBackFeedbackIntercept'

type HistoryStateRecord = Record<string, unknown>

const getHistoryStateRecord = (state: unknown): HistoryStateRecord => {
  if (state && typeof state === 'object') {
    return state as HistoryStateRecord
  }

  return {}
}

export function useBackFeedbackIntercept(onOpen: () => void) {
  const onOpenRef = useRef(onOpen)
  const interceptionUsedRef = useRef(false)
  const listenerActiveRef = useRef(false)

  useEffect(() => {
    onOpenRef.current = onOpen
  }, [onOpen])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.history.pushState !== 'function') {
      return
    }

    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const currentState = getHistoryStateRecord(window.history.state)

    // React Strict Mode remounts client components in development, so we only push
    // a synthetic entry when the current history entry is not already our marker.
    if (currentState[BACK_FEEDBACK_MARKER] !== true) {
      // Preserve framework-owned state (Next.js stores router data here) and only
      // add our marker to a same-URL history entry.
      window.history.pushState(
        {
          ...currentState,
          [BACK_FEEDBACK_MARKER]: true,
        },
        '',
        currentUrl,
      )
    }

    listenerActiveRef.current = true
    interceptionUsedRef.current = false

    function disableInterception() {
      listenerActiveRef.current = false
      window.removeEventListener('popstate', handlePopState)
    }

    function handlePopState() {
      // Ignore any later popstate events after the one allowed interception.
      if (!listenerActiveRef.current || interceptionUsedRef.current) {
        return
      }

      interceptionUsedRef.current = true
      disableInterception()
      onOpenRef.current()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      disableInterception()
    }
  }, [])
}
