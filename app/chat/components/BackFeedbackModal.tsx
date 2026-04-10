'use client'

import type { CSSProperties, MutableRefObject } from 'react'
import { useEffect, useRef, useState } from 'react'

export type BackFeedbackSubmission = {
  rating: number
  reason: string
  otherText: string | null
}

type BackFeedbackModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (submission: BackFeedbackSubmission) => void | Promise<void>
}

type FlowScreen = 'rating' | 'reason' | 'details' | 'thanks'

const RATING_COPY = 'be honest, we can take it \u{1F605}'
const RATING_SUBTEXT = 'took us months to build this. 2 seconds to rate it.'
const LOW_RATING_HEADING = 'okay ouch \u{1F62C} what went wrong?'
const MID_RATING_HEADING = "so close! what's missing?"
const HIGH_RATING_HEADING = "you're our favorite person rn \u{1F64C} what clicked?"
const DETAILS_PLACEHOLDER = "anything else? go off, we're listening \u{1F442}"
const SUBMIT_LABEL = 'send it \u{1F680}'
const SKIP_LABEL = "nah I'm good"
const THANK_YOU_COPY = "you're a legend \u{1F64F} we'll make it better"

const LOW_RATING_REASONS = [
  'felt empty, no one to talk to',
  "didn't get what this was",
  'something broke',
  'just not for me',
]

const MID_RATING_REASONS = [
  'needs more people',
  'missing something I wanted',
  'a bit confusing',
  'almost but not quite',
]

const HIGH_RATING_REASONS = [
  'the vibe was right',
  'actually met someone cool',
  'love the live discussions',
  'finally something different',
]

export function BackFeedbackModal({ open, onClose, onSubmit }: BackFeedbackModalProps) {
  const [screen, setScreen] = useState<FlowScreen>('rating')
  const [rating, setRating] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [otherText, setOtherText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const closeTimerRef = useRef<number | null>(null)
  const screenTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) {
      clearTimer(closeTimerRef)
      clearTimer(screenTimerRef)
      setScreen('rating')
      setRating(null)
      setReason('')
      setOtherText('')
      setIsSubmitting(false)
      setSubmitError('')
    }
  }, [open])

  useEffect(() => {
    return () => {
      clearTimer(closeTimerRef)
      clearTimer(screenTimerRef)
    }
  }, [])

  if (!open) {
    return null
  }

  function clearTimer(timerRef: MutableRefObject<number | null>) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function handleRatingSelect(nextRating: number) {
    if (isSubmitting) {
      return
    }

    clearTimer(screenTimerRef)
    setRating(nextRating)
    setReason('')
    setOtherText('')
    setSubmitError('')

    screenTimerRef.current = window.setTimeout(() => {
      setScreen('reason')
      screenTimerRef.current = null
    }, 120)
  }

  function handleReasonSelect(nextReason: string) {
    if (isSubmitting) {
      return
    }

    setReason(nextReason)
    setSubmitError('')
    setScreen('details')
  }

  async function handleSave(includeText: boolean) {
    if (!rating || !reason || isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setSubmitError('')

    try {
      await onSubmit({
        rating,
        reason,
        otherText: includeText ? otherText.trim() || null : null,
      })

      setScreen('thanks')
      clearTimer(closeTimerRef)
      closeTimerRef.current = window.setTimeout(() => {
        onClose()
      }, 2000)
    } catch (error) {
      console.error('[BackFeedbackModal] submit failed:', error)
      setSubmitError('Could not send feedback right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const heading = getHeading(rating)
  const reasonOptions = getReasonOptions(rating)

  return (
    <div style={overlayStyle}>
      <div style={cardStyle} role="dialog" aria-modal="true" aria-label="Feedback">
        {screen === 'rating' && (
          <div style={contentStackStyle}>
            <div style={metaTextStyle}>{RATING_COPY}</div>
            <div style={subTextStyle}>{RATING_SUBTEXT}</div>
            <div style={starsRowStyle}>
              {Array.from({ length: 5 }, (_, index) => index + 1).map((value) => {
                const isFilled = rating !== null && value <= rating

                return (
                  <button
                    key={value}
                    type="button"
                    style={starButtonStyle}
                    onClick={() => handleRatingSelect(value)}
                    aria-label={`Rate ${value} out of 5`}
                  >
                    <StarIcon filled={isFilled} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {screen === 'reason' && (
          <div style={contentStackStyle}>
            <h2 style={headingStyle}>{heading}</h2>
            <div style={reasonsListStyle}>
              {reasonOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  style={reasonButtonStyle}
                  onClick={() => handleReasonSelect(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {screen === 'details' && (
          <div style={contentStackStyle}>
            <textarea
              value={otherText}
              onChange={(event) => setOtherText(event.target.value)}
              placeholder={DETAILS_PLACEHOLDER}
              rows={5}
              style={textareaStyle}
              disabled={isSubmitting}
            />
            <button
              type="button"
              style={submitButtonStyle}
              onClick={() => void handleSave(true)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'sending...' : SUBMIT_LABEL}
            </button>
            <button
              type="button"
              style={skipLinkStyle}
              onClick={() => void handleSave(false)}
              disabled={isSubmitting}
            >
              {SKIP_LABEL}
            </button>
            {submitError ? <div style={errorTextStyle}>{submitError}</div> : null}
          </div>
        )}

        {screen === 'thanks' && (
          <div style={thanksWrapStyle}>
            <div style={thanksTextStyle}>{THANK_YOU_COPY}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function getHeading(rating: number | null) {
  if (!rating) {
    return ''
  }

  if (rating <= 2) {
    return LOW_RATING_HEADING
  }

  if (rating <= 4) {
    return MID_RATING_HEADING
  }

  return HIGH_RATING_HEADING
}

function getReasonOptions(rating: number | null) {
  if (!rating) {
    return []
  }

  if (rating <= 2) {
    return LOW_RATING_REASONS
  }

  if (rating <= 4) {
    return MID_RATING_REASONS
  }

  return HIGH_RATING_REASONS
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="36"
      height="36"
      aria-hidden="true"
      style={{
        display: 'block',
        filter: filled ? 'drop-shadow(0 8px 14px rgba(250, 204, 21, 0.32))' : 'none',
      }}
    >
      <path
        d="M12 2.65l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17.25 6.28 20.26l1.09-6.37L2.74 9.38l6.4-.93L12 2.65z"
        fill={filled ? '#F4C542' : '#D4D4D8'}
      />
    </svg>
  )
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'rgba(15, 23, 42, 0.16)',
  backdropFilter: 'blur(12px)',
}

const cardStyle: CSSProperties = {
  width: 'min(100%, 420px)',
  minHeight: '290px',
  background: '#ffffff',
  borderRadius: '28px',
  boxShadow: '0 24px 64px rgba(15, 23, 42, 0.16)',
  padding: '28px 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const contentStackStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
}

const metaTextStyle: CSSProperties = {
  color: '#6b7280',
  fontSize: '0.92rem',
  lineHeight: 1.4,
}

const subTextStyle: CSSProperties = {
  marginTop: '8px',
  color: '#9ca3af',
  fontSize: '0.8rem',
  lineHeight: 1.45,
}

const starsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  marginTop: '30px',
}

const starButtonStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: '0',
  cursor: 'pointer',
}

const headingStyle: CSSProperties = {
  margin: 0,
  color: '#111827',
  fontSize: '1.4rem',
  lineHeight: 1.25,
  fontWeight: 700,
}

const reasonsListStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginTop: '22px',
}

const reasonButtonStyle: CSSProperties = {
  width: '100%',
  borderRadius: '999px',
  border: '1px solid #1f2937',
  background: '#ffffff',
  color: '#111827',
  padding: '12px 16px',
  font: 'inherit',
  fontSize: '0.94rem',
  lineHeight: 1.35,
  cursor: 'pointer',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: '120px',
  borderRadius: '18px',
  border: '1px solid #e5e7eb',
  background: '#ffffff',
  color: '#111827',
  padding: '14px 16px',
  font: 'inherit',
  lineHeight: 1.5,
  resize: 'vertical',
}

const submitButtonStyle: CSSProperties = {
  width: '100%',
  marginTop: '16px',
  border: 'none',
  borderRadius: '16px',
  background: '#111827',
  color: '#ffffff',
  padding: '12px 16px',
  font: 'inherit',
  fontSize: '0.96rem',
  fontWeight: 700,
  cursor: 'pointer',
}

const skipLinkStyle: CSSProperties = {
  marginTop: '12px',
  border: 'none',
  background: 'transparent',
  color: '#9ca3af',
  font: 'inherit',
  fontSize: '0.88rem',
  cursor: 'pointer',
}

const errorTextStyle: CSSProperties = {
  marginTop: '12px',
  color: '#dc2626',
  fontSize: '0.84rem',
}

const thanksWrapStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
}

const thanksTextStyle: CSSProperties = {
  color: '#111827',
  fontSize: '1.08rem',
  lineHeight: 1.55,
  fontWeight: 600,
}
