'use client'

import { useEffect, useRef } from 'react'

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
    const shouldPushState = !window.location.hash.startsWith('#back-')

    console.log('[back-intercept] hook mounted')
    console.log('[back-intercept] current URL on mount:', currentUrl)
    console.log('[back-intercept] history.length on mount:', window.history.length)
    console.log('[back-intercept] history.state before pushState:', window.history.state)

    // React Strict Mode remounts client components in development, so we only push
    // a synthetic entry when the current URL does not already carry our back hash.
    if (shouldPushState) {
      const url = new URL(window.location.href)
      url.hash = `back-${Date.now()}`

      window.history.pushState({}, '', url.toString())
      console.log('[back-intercept] pushed hash entry')
    }

    console.log('[back-intercept] history.state after pushState:', window.history.state)
    console.log('[back-intercept] pushState succeeded:', shouldPushState)

    listenerActiveRef.current = true
    interceptionUsedRef.current = false

    function disableInterception(reason: 'cleanup' | 'popstate') {
      console.log('[back-intercept] hook disables itself:', reason)
      listenerActiveRef.current = false
      window.removeEventListener('popstate', handlePopState)
    }

    function handlePopState(event: PopStateEvent) {
      console.log('[back-intercept] popstate fired')
      console.log('[back-intercept] popstate event.state:', event.state)

      const shouldOpenModal = listenerActiveRef.current && !interceptionUsedRef.current
      console.log('[back-intercept] opening modal from popstate:', shouldOpenModal)

      // Ignore any later popstate events after the one allowed interception.
      if (!shouldOpenModal) {
        return
      }

      interceptionUsedRef.current = true
      disableInterception('popstate')
      onOpenRef.current()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      disableInterception('cleanup')
    }
  }, [])
}
