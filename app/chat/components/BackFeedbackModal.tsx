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

const LOW_RATING_REASONS = [
  "Didn't find it useful",
  'Too confusing',
  'App felt buggy',
  'Other',
]

const MID_RATING_REASONS = [
  'Needs more people',
  'Missing features',
  'UI felt off',
  'Other',
]

const HIGH_RATING_REASONS = [
  'The vibe',
  'Meeting new people',
  'The chats',
  'Other',
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

    // Brief pause so the selected star can visibly glow before the next screen.
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
      }, 1200)
    } catch (error) {
      console.error('[BackFeedbackModal] submit failed:', error)
      setSubmitError('Could not send feedback right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const reasonOptions = getReasonOptions(rating)

  return (
    <div style={overlayStyle}>
      <div style={modalShellStyle} role="dialog" aria-modal="true" aria-label="Feedback">
        {screen === 'rating' && (
          <div style={centerWrapStyle}>
            <div style={starRowStyle}>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => {
                const isActive = rating !== null && value <= rating

                return (
                  <button
                    key={value}
                    type="button"
                    style={{
                      ...starButtonStyle,
                      ...(isActive ? starButtonActiveStyle : null),
                    }}
                    onClick={() => handleRatingSelect(value)}
                    aria-label={`Rate ${value} out of 10`}
                  >
                    ★
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {screen === 'reason' && (
          <div style={centerWrapStyle}>
            <div style={chipWrapStyle}>
              {reasonOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  style={chipButtonStyle}
                  onClick={() => handleReasonSelect(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {screen === 'details' && (
          <div style={detailsWrapStyle}>
            <input
              type="text"
              value={otherText}
              onChange={(event) => setOtherText(event.target.value)}
              placeholder="Tell us how to improve..."
              style={textInputStyle}
              disabled={isSubmitting}
            />
            <button
              type="button"
              style={submitButtonStyle}
              onClick={() => void handleSave(true)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Submit'}
            </button>
            <button
              type="button"
              style={skipLinkStyle}
              onClick={() => void handleSave(false)}
              disabled={isSubmitting}
            >
              Skip
            </button>
            {submitError ? <div style={errorTextStyle}>{submitError}</div> : null}
          </div>
        )}

        {screen === 'thanks' && (
          <div style={centerWrapStyle}>
            <div style={thanksTextStyle}>Thanks 🙏</div>
          </div>
        )}
      </div>
    </div>
  )
}

function getReasonOptions(rating: number | null) {
  if (!rating) {
    return []
  }

  if (rating <= 4) {
    return LOW_RATING_REASONS
  }

  if (rating <= 7) {
    return MID_RATING_REASONS
  }

  return HIGH_RATING_REASONS
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'rgba(7, 7, 11, 0.7)',
  backdropFilter: 'blur(18px)',
}

const modalShellStyle: CSSProperties = {
  width: 'min(100%, 520px)',
  minHeight: '160px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1a1a1f',
}

const centerWrapStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const starRowStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '4px',
  flexWrap: 'nowrap',
}

const starButtonStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'rgba(255, 255, 255, 0.18)',
  fontSize: 'clamp(1rem, 3.7vw, 2rem)',
  lineHeight: 1,
  padding: '0',
  cursor: 'pointer',
  transition: 'color 120ms ease, transform 120ms ease, text-shadow 120ms ease',
}

const starButtonActiveStyle: CSSProperties = {
  color: '#facc15',
  transform: 'translateY(-1px) scale(1.06)',
  textShadow: '0 0 18px rgba(250, 204, 21, 0.68)',
}

const chipWrapStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '10px',
}

const chipButtonStyle: CSSProperties = {
  border: 'none',
  background: 'rgba(255, 255, 255, 0.08)',
  color: '#f5f5f5',
  padding: '10px 14px',
  borderRadius: '999px',
  font: 'inherit',
  fontSize: '0.92rem',
  cursor: 'pointer',
  transition: 'background 120ms ease, transform 120ms ease',
}

const detailsWrapStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
}

const textInputStyle: CSSProperties = {
  width: 'min(100%, 360px)',
  border: 'none',
  outline: 'none',
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#f5f5f5',
  padding: '12px 14px',
  font: 'inherit',
}

const submitButtonStyle: CSSProperties = {
  border: 'none',
  background: '#f5f5f5',
  color: '#111115',
  padding: '8px 14px',
  font: 'inherit',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const skipLinkStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'rgba(255, 255, 255, 0.58)',
  font: 'inherit',
  fontSize: '0.88rem',
  cursor: 'pointer',
  textDecoration: 'underline',
}

const errorTextStyle: CSSProperties = {
  color: '#fca5a5',
  fontSize: '0.84rem',
}

const thanksTextStyle: CSSProperties = {
  color: '#f5f5f5',
  fontSize: '1.15rem',
  fontWeight: 500,
}
