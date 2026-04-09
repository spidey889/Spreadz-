'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const EXIT_FEEDBACK_SESSION_KEY = 'spreadz_exit_feedback_seen'
const EXIT_FEEDBACK_HISTORY_BASE_KEY = '__spreadzExitFeedbackBase'
const EXIT_FEEDBACK_HISTORY_TRAP_KEY = '__spreadzExitFeedbackTrap'
const EXIT_FEEDBACK_CLOSE_DELAY_MS = 2000

const LOW_RATING_REASONS = [
  "Didn't find it useful",
  'Too much clutter',
  'App felt slow or buggy',
  'It was confusing',
  'Something else',
]

const MID_RATING_REASONS = [
  'Cleaner layout',
  'Better onboarding',
  'More active conversations',
  'Faster performance',
  'Something else',
]

const HIGH_RATING_REASONS = [
  'Loved the vibe',
  'Easy to jump in',
  'Interesting people',
  'Fresh conversations',
  'Something else',
]

type FeedbackStep = 'rating' | 'reason' | 'extra' | 'thanks'

const getReasonOptions = (rating: number | null) => {
  if (!rating) return LOW_RATING_REASONS
  if (rating <= 4) return LOW_RATING_REASONS
  if (rating <= 7) return MID_RATING_REASONS
  return HIGH_RATING_REASONS
}

const getReasonPrompt = (rating: number | null) => {
  if (!rating) {
    return 'What best describes your visit?'
  }

  if (rating <= 4) {
    return 'What went wrong?'
  }

  if (rating <= 7) {
    return 'What could be better?'
  }

  return 'What did you love?'
}

export default function ExitIntentFeedbackModal({ userId }: { userId?: string | null }) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<FeedbackStep>('rating')
  const [rating, setRating] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [otherText, setOtherText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const hasInterceptedSessionRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    hasInterceptedSessionRef.current = sessionStorage.getItem(EXIT_FEEDBACK_SESSION_KEY) === '1'

    const currentHistoryState =
      window.history.state && typeof window.history.state === 'object' ? window.history.state : {}

    const alreadyManaged = Boolean(
      currentHistoryState?.[EXIT_FEEDBACK_HISTORY_BASE_KEY] ||
      currentHistoryState?.[EXIT_FEEDBACK_HISTORY_TRAP_KEY]
    )

    if (!hasInterceptedSessionRef.current && !alreadyManaged) {
      const baseState = {
        ...currentHistoryState,
        [EXIT_FEEDBACK_HISTORY_BASE_KEY]: true,
      }

      window.history.replaceState(baseState, '', window.location.href)
      window.history.pushState(
        {
          ...baseState,
          [EXIT_FEEDBACK_HISTORY_TRAP_KEY]: true,
        },
        '',
        window.location.href
      )
    }

    const handlePopState = (event: PopStateEvent) => {
      const nextHistoryState =
        event.state && typeof event.state === 'object' ? event.state : {}
      const isFeedbackBaseState =
        Boolean(nextHistoryState?.[EXIT_FEEDBACK_HISTORY_BASE_KEY]) &&
        !Boolean(nextHistoryState?.[EXIT_FEEDBACK_HISTORY_TRAP_KEY])

      if (!isFeedbackBaseState || hasInterceptedSessionRef.current) {
        return
      }

      hasInterceptedSessionRef.current = true
      sessionStorage.setItem(EXIT_FEEDBACK_SESSION_KEY, '1')
      setIsOpen(true)
      setStep('rating')
      setRating(null)
      setReason('')
      setOtherText('')
      setErrorMessage('')
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (step !== 'thanks' || typeof window === 'undefined') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsOpen(false)
    }, EXIT_FEEDBACK_CLOSE_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [step])

  const handleDismiss = () => {
    setIsOpen(false)
  }

  const handleRatingSelect = (value: number) => {
    setRating(value)
    setReason('')
    setOtherText('')
    setErrorMessage('')
    setStep('reason')
  }

  const handleReasonSelect = (value: string) => {
    setReason(value)
    setErrorMessage('')
    setStep('extra')
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!rating) {
      setErrorMessage('Pick a rating before sending feedback.')
      return
    }

    if (!reason.trim()) {
      setErrorMessage('Choose the closest reason so we know what to improve.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    const { error } = await supabase.from('feedback').insert({
      rating,
      reason,
      other_text: otherText.trim() || null,
      user_id: userId?.trim() || null,
      created_at: new Date().toISOString(),
    })

    setIsSubmitting(false)

    if (error) {
      console.error('[Feedback] insert failed:', error)
      setErrorMessage('Something went wrong. Please try again.')
      return
    }

    setStep('thanks')
  }

  if (!isOpen) {
    return null
  }

  const reasonOptions = getReasonOptions(rating)
  const reasonPrompt = getReasonPrompt(rating)

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
          onClick={handleDismiss}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>

        {step === 'thanks' ? (
          <div className="exit-feedback-confirmation">
            <div className="exit-feedback-confirmation-badge">Feedback saved</div>
            <h2 id="exit-feedback-title" className="exit-feedback-title">Thanks for helping Spreadz.</h2>
            <p className="exit-feedback-subtitle">We will use this to improve the next visit.</p>
          </div>
        ) : (
          <>
            <div className="exit-feedback-copy">
              <div className="exit-feedback-kicker">Before you go</div>
              <h2 id="exit-feedback-title" className="exit-feedback-title">A quick 20-second check-in.</h2>
              <p className="exit-feedback-subtitle">One answer from you is worth more than a hundred guesses from us.</p>
            </div>

            {step === 'rating' && (
              <div className="exit-feedback-form">
                <div className="exit-feedback-section">
                  <div className="exit-feedback-label">How was your experience?</div>
                  <div className="exit-feedback-rating-grid" role="list" aria-label="Rate your experience from 1 to 10">
                    {Array.from({ length: 10 }, (_, index) => {
                      const value = index + 1
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`exit-feedback-rating${rating === value ? ' selected' : ''}`}
                          onClick={() => handleRatingSelect(value)}
                        >
                          <span className="exit-feedback-rating-star" aria-hidden="true">★</span>
                          <span>{value}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {step === 'reason' && (
              <div className="exit-feedback-form">
                <div className="exit-feedback-section">
                  <div className="exit-feedback-label">{reasonPrompt}</div>
                  <div className="exit-feedback-chip-grid">
                    {reasonOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`exit-feedback-chip${reason === option ? ' selected' : ''}`}
                        onClick={() => handleReasonSelect(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="exit-feedback-secondary"
                  onClick={() => {
                    setStep('rating')
                    setErrorMessage('')
                  }}
                >
                  Back
                </button>
              </div>
            )}

            {step === 'extra' && (
              <form className="exit-feedback-form" onSubmit={handleSubmit}>
                <div className="exit-feedback-section">
                  <div className="exit-feedback-label">Anything else you want us to know?</div>
                  <textarea
                    className="exit-feedback-textarea"
                    placeholder="Optional. Tell us what stood out."
                    value={otherText}
                    onChange={(event) => setOtherText(event.target.value)}
                    rows={4}
                    maxLength={280}
                  />
                </div>

                {errorMessage && <div className="exit-feedback-error">{errorMessage}</div>}

                <div className="exit-feedback-actions">
                  <button
                    type="button"
                    className="exit-feedback-secondary"
                    onClick={() => {
                      setStep('reason')
                      setErrorMessage('')
                    }}
                  >
                    Back
                  </button>
                  <button type="submit" className="exit-feedback-submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Send feedback'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
