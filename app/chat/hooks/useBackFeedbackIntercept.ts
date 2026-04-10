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
  const hasReinforcedOnGestureRef = useRef(false)
  const didCreateHistoryEntryRef = useRef(false)

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
    function pushSyntheticHistoryEntry() {
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
      const historyLengthBeforePush = window.history.length
      console.log('[back-intercept] history.length before push', historyLengthBeforePush)
      window.history.replaceState(currentState, '', syntheticUrl.toString())
      window.history.pushState(currentState, '', actualCurrentUrl.toString())
      console.log('[back-intercept] href after push', window.location.href)
      console.log('[back-intercept] history.length after push', window.history.length)
      console.log('[back-intercept] hash after push', window.location.hash)
      console.log('[back-intercept] pushed hash entry')

      return window.history.length > historyLengthBeforePush
    }

    function removeGestureListeners() {
      window.removeEventListener('pointerdown', handleFirstGesture)
      window.removeEventListener('touchstart', handleFirstGesture)
      window.removeEventListener('click', handleFirstGesture)
    }

    function handleFirstGesture() {
      removeGestureListeners()
      console.log('[back-intercept] gesture received')

      if (
        hasReinforcedOnGestureRef.current ||
        isDisabledRef.current ||
        !syntheticHashRef.current ||
        !backInterceptWindow.__spreadzBackInterceptHash ||
        didCreateHistoryEntryRef.current
      ) {
        hasReinforcedOnGestureRef.current = true
        console.log('[back-intercept] gesture reinforcement skipped')
        return
      }

      hasReinforcedOnGestureRef.current = true
      console.log('[back-intercept] reinforcing hash entry after gesture')
      didCreateHistoryEntryRef.current = pushSyntheticHistoryEntry()
    }

    if (!backInterceptWindow.__spreadzBackInterceptHash) {
      didCreateHistoryEntryRef.current = pushSyntheticHistoryEntry()
    } else {
      syntheticHashRef.current = backInterceptWindow.__spreadzBackInterceptHash
      didCreateHistoryEntryRef.current = true
    }

    window.addEventListener('pointerdown', handleFirstGesture, { passive: true })
    window.addEventListener('touchstart', handleFirstGesture, { passive: true })
    window.addEventListener('click', handleFirstGesture, { passive: true })

    function disableInterception() {
      if (isDisabledRef.current) {
        return
      }

      isDisabledRef.current = true
      delete backInterceptWindow.__spreadzBackInterceptHash
      removeGestureListeners()
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
      removeGestureListeners()
      window.removeEventListener('popstate', handlePopState)
      resetBackInterceptTimer = window.setTimeout(() => {
        delete getBackInterceptWindow().__spreadzBackInterceptHash
        resetBackInterceptTimer = null
      }, 0)
    }
  }, [])
}
