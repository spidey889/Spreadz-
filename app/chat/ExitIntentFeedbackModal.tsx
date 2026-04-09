'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const FEEDBACK_REASONS = [
  "Didn't find it useful",
  'Too much clutter',
  'Just browsing',
  'App felt slow or buggy',
  'Other',
] as const

const EXIT_FEEDBACK_DISMISSED_STORAGE_KEY = 'spreadz_exit_feedback_dismissed'
const EXIT_FEEDBACK_SUBMITTED_STORAGE_KEY = 'spreadz_exit_feedback_submitted'
const EXIT_FEEDBACK_CLOSE_DELAY_MS = 2000

type FeedbackReason = typeof FEEDBACK_REASONS[number]
type PendingNavigation = { href: string } | null

export default function ExitIntentFeedbackModal({ userId }: { userId?: string | null }) {
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState<FeedbackReason | ''>('')
  const [otherText, setOtherText] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitState, setSubmitState] = useState<'idle' | 'done'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const isOpenRef = useRef(false)
  const dismissedRef = useRef(false)
  const submittedRef = useRef(false)
  const pendingNavigationRef = useRef<PendingNavigation>(null)
  const allowNavigationRef = useRef(false)
  const shouldShowAfterVisibilityReturnRef = useRef(false)

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  const openModal = useCallback((pendingNavigation?: PendingNavigation) => {
    if (dismissedRef.current || submittedRef.current || isOpenRef.current) {
      return false
    }

    pendingNavigationRef.current = pendingNavigation ?? null
    setErrorMessage('')
    setIsOpen(true)
    return true
  }, [])

  const dismissModal = useCallback(() => {
    dismissedRef.current = true
    pendingNavigationRef.current = null
    setIsOpen(false)
    setErrorMessage('')
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(EXIT_FEEDBACK_DISMISSED_STORAGE_KEY, '1')
    }
  }, [])

  const continuePendingNavigation = useCallback(() => {
    const pendingNavigation = pendingNavigationRef.current
    pendingNavigationRef.current = null

    if (!pendingNavigation || typeof window === 'undefined') {
      return
    }

    allowNavigationRef.current = true
    window.location.assign(pendingNavigation.href)
  }, [])

  useEffect(() => {
    if (submitState !== 'done' || typeof window === 'undefined') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsOpen(false)
      continuePendingNavigation()
    }, EXIT_FEEDBACK_CLOSE_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [continuePendingNavigation, submitState])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    dismissedRef.current = sessionStorage.getItem(EXIT_FEEDBACK_DISMISSED_STORAGE_KEY) === '1'
    submittedRef.current = sessionStorage.getItem(EXIT_FEEDBACK_SUBMITTED_STORAGE_KEY) === '1'

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current || dismissedRef.current || submittedRef.current || isOpenRef.current) {
        return
      }

      openModal()
      event.preventDefault()
      event.returnValue = ''
    }

    const handleVisibilityChange = () => {
      if (dismissedRef.current || submittedRef.current) {
        shouldShowAfterVisibilityReturnRef.current = false
        return
      }

      if (document.visibilityState === 'hidden') {
        shouldShowAfterVisibilityReturnRef.current = true
        return
      }

      if (shouldShowAfterVisibilityReturnRef.current) {
        shouldShowAfterVisibilityReturnRef.current = false
        openModal()
      }
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        allowNavigationRef.current ||
        dismissedRef.current ||
        submittedRef.current ||
        isOpenRef.current
      ) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) {
        return
      }

      if (anchor.target && anchor.target.toLowerCase() !== '_self') {
        return
      }

      if (anchor.hasAttribute('download')) {
        return
      }

      const nextUrl = new URL(anchor.href, window.location.href)
      const currentUrl = new URL(window.location.href)

      if (nextUrl.href === currentUrl.href) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      openModal({ href: nextUrl.toString() })
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpenRef.current) {
        dismissModal()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('click', handleDocumentClick, true)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('click', handleDocumentClick, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dismissModal, openModal])

  const handleReasonSelect = useCallback((nextReason: FeedbackReason) => {
    setReason(nextReason)
    if (nextReason !== 'Other') {
      setOtherText('')
    }
  }, [])

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedReason = reason
    const normalizedOtherText = otherText.trim()

    if (!normalizedReason) {
      setErrorMessage('Pick the reason that fits best.')
      return
    }

    if (normalizedReason === 'Other' && !normalizedOtherText) {
      setErrorMessage('Add a quick note so we know what to improve.')
      return
    }

    if (!rating) {
      setErrorMessage('Choose a rating from 1 to 10.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    const { error } = await supabase.from('feedback').insert({
      reason: normalizedReason,
      other_text: normalizedReason === 'Other' ? normalizedOtherText : null,
      rating,
      created_at: new Date().toISOString(),
      user_id: userId?.trim() || null,
    })

    setIsSubmitting(false)

    if (error) {
      console.error('[Feedback] insert failed:', error)
      setErrorMessage('Something went wrong. Please try again.')
      return
    }

    submittedRef.current = true
    setSubmitState('done')
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(EXIT_FEEDBACK_SUBMITTED_STORAGE_KEY, '1')
    }
  }, [otherText, rating, reason, userId])

  if (!isOpen) {
    return null
  }

  const isOtherSelected = reason === 'Other'
  const isSubmitDisabled = isSubmitting || !reason || !rating || (isOtherSelected && !otherText.trim())

  return (
    <div className="exit-feedback-overlay" role="presentation">
      <div
        className="exit-feedback-modal animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-feedback-title"
      >
        <button
          type="button"
          className="exit-feedback-close"
          aria-label="Dismiss feedback modal"
          onClick={dismissModal}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>

        {submitState === 'done' ? (
          <div className="exit-feedback-confirmation">
            <div className="exit-feedback-confirmation-badge">Feedback saved</div>
            <h2 id="exit-feedback-title" className="exit-feedback-title">Thanks! 🙌</h2>
            <p className="exit-feedback-subtitle">Your note is on its way to the Spreadz team.</p>
          </div>
        ) : (
          <form className="exit-feedback-form" onSubmit={handleSubmit}>
            <div className="exit-feedback-copy">
              <h2 id="exit-feedback-title" className="exit-feedback-title">Before you go 👋</h2>
              <p className="exit-feedback-subtitle">Help us improve Spreadz — takes 20 seconds</p>
            </div>

            <div className="exit-feedback-section">
              <div className="exit-feedback-label">What&apos;s your experience?</div>
              <div className="exit-feedback-chip-grid">
                {FEEDBACK_REASONS.map((option) => {
                  const isSelected = reason === option

                  return (
                    <button
                      key={option}
                      type="button"
                      className={`exit-feedback-chip${isSelected ? ' selected' : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => handleReasonSelect(option)}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
              {isOtherSelected && (
                <input
                  type="text"
                  className="exit-feedback-input"
                  placeholder="Tell us what we missed"
                  value={otherText}
                  onChange={(event) => setOtherText(event.target.value)}
                  maxLength={180}
                />
              )}
            </div>

            <div className="exit-feedback-section">
              <div className="exit-feedback-label">Rate your experience</div>
              <div className="exit-feedback-rating-grid">
                {Array.from({ length: 10 }, (_, index) => {
                  const value = index + 1
                  const isSelected = rating === value

                  return (
                    <button
                      key={value}
                      type="button"
                      className={`exit-feedback-rating${isSelected ? ' selected' : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => setRating(value)}
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
            </div>

            {errorMessage && <div className="exit-feedback-error">{errorMessage}</div>}

            <button type="submit" className="exit-feedback-submit" disabled={isSubmitDisabled}>
              {isSubmitting ? 'Sending...' : 'Send feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
