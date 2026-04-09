'use client'

import { useEffect } from 'react'

const EXIT_FEEDBACK_HISTORY_INSTALLED_KEY = 'spreadz_exit_feedback_history_installed'
const EXIT_FEEDBACK_HISTORY_PAGE_KEY = '__spreadzExitFeedbackPage'
const EXIT_FEEDBACK_HISTORY_CURRENT_KEY = '__spreadzExitFeedbackCurrent'

export default function ExitIntentFeedbackTrap() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (window.location.pathname === '/before-you-go') {
      return
    }

    if (sessionStorage.getItem(EXIT_FEEDBACK_HISTORY_INSTALLED_KEY) === '1') {
      return
    }

    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const currentHistoryState =
      window.history.state && typeof window.history.state === 'object' ? window.history.state : {}

    if (
      currentHistoryState?.[EXIT_FEEDBACK_HISTORY_PAGE_KEY] ||
      currentHistoryState?.[EXIT_FEEDBACK_HISTORY_CURRENT_KEY]
    ) {
      sessionStorage.setItem(EXIT_FEEDBACK_HISTORY_INSTALLED_KEY, '1')
      return
    }

    const feedbackUrl = `/before-you-go?returnTo=${encodeURIComponent(currentUrl)}`
    const feedbackState = {
      ...currentHistoryState,
      [EXIT_FEEDBACK_HISTORY_PAGE_KEY]: true,
    }
    const currentState = {
      ...currentHistoryState,
      [EXIT_FEEDBACK_HISTORY_CURRENT_KEY]: true,
    }

    window.history.replaceState(feedbackState, '', feedbackUrl)
    window.history.pushState(currentState, '', currentUrl)
    sessionStorage.setItem(EXIT_FEEDBACK_HISTORY_INSTALLED_KEY, '1')
  }, [])

  return null
}
