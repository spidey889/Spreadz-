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
      const currentUrl = new URL(window.location.href)
      const syntheticHash = `back-${Date.now()}`
      const syntheticUrl = new URL(currentUrl.toString())

      syntheticUrl.hash = syntheticHash
      syntheticHashRef.current = syntheticHash
      backInterceptWindow.__spreadzBackInterceptHash = syntheticHash

      window.history.replaceState({}, '', syntheticUrl.toString())
      window.history.pushState({}, '', currentUrl.toString())
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

    function handlePopState() {
      console.log('[back-intercept] popstate fired')

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
