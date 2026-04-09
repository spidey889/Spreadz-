'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const EXIT_FEEDBACK_CLOSE_DELAY_MS = 2000
const USER_UUID_STORAGE_KEY = 'spreadz_user_uuid'

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
  if (!rating) return 'What best describes your visit?'
  if (rating <= 4) return 'What went wrong?'
  if (rating <= 7) return 'What could be better?'
  return 'What did you love?'
}

const getSafeReturnTo = (candidate: string | null) => {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return '/'
  }

  if (candidate.startsWith('/before-you-go')) {
    return '/'
  }

  return candidate
}

export default function BeforeYouGoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [step, setStep] = useState<FeedbackStep>('rating')
  const [rating, setRating] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [otherText, setOtherText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const returnTo = useMemo(
    () => getSafeReturnTo(searchParams.get('returnTo')),
    [searchParams]
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const storedUserId = localStorage.getItem(USER_UUID_STORAGE_KEY)?.trim() || ''
    if (storedUserId) {
      setUserId(storedUserId)
    }

    let cancelled = false

    const loadSessionUser = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (cancelled || error) {
        return
      }

      const sessionUserId = data.session?.user?.id?.trim() || ''
      if (sessionUserId) {
        localStorage.setItem(USER_UUID_STORAGE_KEY, sessionUserId)
        setUserId(sessionUserId)
      }
    }

    void loadSessionUser()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (step !== 'thanks') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      router.replace(returnTo)
    }, EXIT_FEEDBACK_CLOSE_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [returnTo, router, step])

  const handleDismiss = () => {
    router.replace(returnTo)
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

  const reasonOptions = getReasonOptions(rating)
  const reasonPrompt = getReasonPrompt(rating)

  return (
    <div className="exit-feedback-page">
      <div
        className="exit-feedback-modal animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-feedback-title"
      >
        <button
          type="button"
          className="exit-feedback-close"
          aria-label="Continue to Spreadz"
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
            <h1 id="exit-feedback-title" className="exit-feedback-title">Thanks for helping Spreadz.</h1>
            <p className="exit-feedback-subtitle">Taking you back in a moment.</p>
          </div>
        ) : (
          <>
            <div className="exit-feedback-copy">
              <div className="exit-feedback-kicker">Before you leave</div>
              <h1 id="exit-feedback-title" className="exit-feedback-title">A quick 20-second check-in.</h1>
              <p className="exit-feedback-subtitle">Help us understand why this visit did or did not click for you.</p>
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
                          <span className="exit-feedback-rating-star" aria-hidden="true">*</span>
                          <span>{value}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <button type="button" className="exit-feedback-secondary" onClick={handleDismiss}>
                  Continue to Spreadz
                </button>
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
                <div className="exit-feedback-actions">
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
                  <button type="button" className="exit-feedback-secondary" onClick={handleDismiss}>
                    Continue to Spreadz
                  </button>
                </div>
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
