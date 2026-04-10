'use client'

import { useEffect, useRef } from 'react'

type BackInterceptWindow = Window & {
  __spreadzBackInterceptHash?: string
}

let resetBackInterceptTimer: number | null = null

const getBackInterceptWindow = () => window as BackInterceptWindow

export function useBackFeedbackIntercept(onOpen: () => void) {
  const onOpenRef = useRef(onOpen)
  const syntheticHashRef = useRef<string | null>(null)
  const isDisabledRef = useRef(false)

  useEffect(() => {
    onOpenRef.current = onOpen
  }, [onOpen])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (resetBackInterceptTimer !== null) {
      window.clearTimeout(resetBackInterceptTimer)
      resetBackInterceptTimer = null
    }

    console.log('[back-intercept] mounted immediately')

    const backInterceptWindow = getBackInterceptWindow()
    if (!backInterceptWindow.__spreadzBackInterceptHash) {
      const currentState = window.history.state ?? {}
      const actualCurrentUrl = new URL(window.location.href)
      actualCurrentUrl.hash = ''
      const syntheticHash = `back-${Date.now()}`
      const syntheticUrl = new URL(actualCurrentUrl.toString())

      syntheticUrl.hash = syntheticHash
      syntheticHashRef.current = syntheticHash
      backInterceptWindow.__spreadzBackInterceptHash = syntheticHash

      console.log('[back-intercept] clean chat url', actualCurrentUrl.toString())
      console.log('[back-intercept] synthetic url', syntheticUrl.toString())
      console.log('[back-intercept] href before push', window.location.href)
      console.log('[back-intercept] history.length before push', window.history.length)
      window.history.replaceState(currentState, '', syntheticUrl.toString())
      window.history.pushState(currentState, '', actualCurrentUrl.toString())
      console.log('[back-intercept] href after push', window.location.href)
      console.log('[back-intercept] history.length after push', window.history.length)
      console.log('[back-intercept] hash after push', window.location.hash)
      console.log('[back-intercept] pushed hash entry')
    } else {
      syntheticHashRef.current = backInterceptWindow.__spreadzBackInterceptHash
    }

    function disableInterception() {
      if (isDisabledRef.current) {
        return
      }

      isDisabledRef.current = true
      delete backInterceptWindow.__spreadzBackInterceptHash
      window.removeEventListener('popstate', handlePopState)
      console.log('[back-intercept] interception disabled')
    }

    function handlePopState(event: PopStateEvent) {
      console.log('[back-intercept] popstate fired')
      console.log('[back-intercept] popstate event.state', event.state)
      console.log('[back-intercept] current href during popstate', window.location.href)
      console.log('[back-intercept] current hash during popstate', window.location.hash)

      const syntheticHash = syntheticHashRef.current
      if (!syntheticHash || isDisabledRef.current || window.location.hash !== `#${syntheticHash}`) {
        return
      }

      console.log('[back-intercept] opening modal')
      disableInterception()
      onOpenRef.current()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      resetBackInterceptTimer = window.setTimeout(() => {
        delete getBackInterceptWindow().__spreadzBackInterceptHash
        resetBackInterceptTimer = null
      }, 0)
    }
  }, [])
}
