'use client'

import type { CSSProperties } from 'react'
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
  'Not what I expected',
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

  useEffect(() => {
    if (!open) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
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
      clearCloseTimer()
    }
  }, [])

  if (!open) {
    return null
  }

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function handleRequestClose() {
    if (isSubmitting) {
      return
    }

    onClose()
  }

  function handleRatingSelect(nextRating: number) {
    setRating(nextRating)
    setReason('')
    setOtherText('')
    setSubmitError('')
    setScreen('reason')
  }

  function handleReasonSelect(nextReason: string) {
    setReason(nextReason)
    setSubmitError('')
    setScreen('details')
  }

  async function handleSubmit() {
    if (!rating || !reason || isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setSubmitError('')

    try {
      await onSubmit({
        rating,
        reason,
        otherText: otherText.trim() || null,
      })

      setScreen('thanks')
      clearCloseTimer()

      // Give the thank-you state a moment to land before we close the modal.
      closeTimerRef.current = window.setTimeout(() => {
        onClose()
      }, 2000)
    } catch (error) {
      console.error('[BackFeedbackModal] submit failed:', error)
      setSubmitError('Could not send feedback right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const reasonOptions = getReasonOptions(rating)
  const currentStep = screen === 'rating' ? 1 : screen === 'reason' ? 2 : 3

  return (
    <div style={overlayStyle} onClick={handleRequestClose}>
      <div
        style={modalStyle}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="back-feedback-title"
      >
        <div style={headerRowStyle}>
          <div>
            <div style={eyebrowStyle}>Spreadz feedback</div>
            {screen !== 'thanks' && <div style={stepLabelStyle}>Step {currentStep} of 3</div>}
          </div>
          {screen !== 'thanks' && (
            <button
              type="button"
              style={iconButtonStyle}
              onClick={handleRequestClose}
              aria-label="Close feedback modal"
              disabled={isSubmitting}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>

        <div style={progressTrackStyle} aria-hidden="true">
          {[1, 2, 3].map((step) => {
            const isActive = step === currentStep
            const isComplete = step < currentStep || screen === 'thanks'

            return (
              <div
                key={step}
                style={{
                  ...progressSegmentStyle,
                  ...(isActive ? progressSegmentActiveStyle : null),
                  ...(isComplete ? progressSegmentCompleteStyle : null),
                }}
              />
            )
          })}
        </div>

        {screen === 'rating' && (
          <>
            <h2 id="back-feedback-title" style={titleStyle}>How was your experience?</h2>
            <p style={bodyTextStyle}>A quick rating helps us understand what this chat felt like for you.</p>
            <div style={ratingGridStyle}>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <button
                  key={value}
                  type="button"
                  style={{
                    ...ratingButtonStyle,
                    ...(value <= 4 ? ratingButtonLowStyle : value <= 7 ? ratingButtonMidStyle : ratingButtonHighStyle),
                  }}
                  onClick={() => handleRatingSelect(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <div style={ratingHintRowStyle}>
              <span>Rough</span>
              <span>Great</span>
            </div>
          </>
        )}

        {screen === 'reason' && (
          <>
            <h2 id="back-feedback-title" style={titleStyle}>What stood out most?</h2>
            <p style={bodyTextStyle}>Pick the closest reason. We’ll use it to improve the experience fast.</p>
            <div style={chipGridStyle}>
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
            <div style={footerActionsStyle}>
              <button type="button" style={ghostButtonStyle} onClick={() => setScreen('rating')}>
                Back
              </button>
            </div>
          </>
        )}

        {screen === 'details' && (
          <>
            <h2 id="back-feedback-title" style={titleStyle}>Anything else? We read every response 🙏</h2>
            <p style={bodyTextStyle}>
              {reason ? `You picked “${reason}”. Add anything extra if you want.` : 'Add any extra context if you want.'}
            </p>
            <textarea
              value={otherText}
              onChange={(event) => setOtherText(event.target.value)}
              placeholder="Optional note"
              rows={5}
              style={textareaStyle}
              disabled={isSubmitting}
            />
            {submitError && <div style={errorTextStyle}>{submitError}</div>}
            <div style={footerActionsStyle}>
              <button
                type="button"
                style={ghostButtonStyle}
                onClick={() => setScreen('reason')}
                disabled={isSubmitting}
              >
                Back
              </button>
              <button
                type="button"
                style={submitButtonStyle}
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending...' : 'Submit'}
              </button>
            </div>
          </>
        )}

        {screen === 'thanks' && (
          <div style={thanksWrapStyle}>
            <div style={thanksBadgeStyle}>✓</div>
            <h2 id="back-feedback-title" style={titleStyle}>Thanks! 🙌</h2>
            <p style={{ ...bodyTextStyle, marginBottom: 0 }}>
              Your feedback is safely in. Closing this in a moment.
            </p>
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
  padding: '20px',
  background: 'rgba(2, 6, 23, 0.82)',
  backdropFilter: 'blur(14px)',
}

const modalStyle: CSSProperties = {
  width: 'min(100%, 420px)',
  borderRadius: '28px',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98))',
  boxShadow: '0 32px 90px rgba(0, 0, 0, 0.48)',
  padding: '20px',
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
}

const eyebrowStyle: CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#60a5fa',
}

const stepLabelStyle: CSSProperties = {
  marginTop: '6px',
  fontSize: '0.82rem',
  color: '#94a3b8',
}

const iconButtonStyle: CSSProperties = {
  border: 'none',
  background: 'rgba(30, 41, 59, 0.82)',
  color: '#cbd5e1',
  width: '34px',
  height: '34px',
  borderRadius: '999px',
  cursor: 'pointer',
  fontSize: '1.3rem',
  lineHeight: 1,
}

const progressTrackStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '8px',
  marginTop: '16px',
}

const progressSegmentStyle: CSSProperties = {
  height: '8px',
  borderRadius: '999px',
  background: 'rgba(51, 65, 85, 0.78)',
}

const progressSegmentActiveStyle: CSSProperties = {
  background: 'linear-gradient(90deg, #60a5fa, #93c5fd)',
}

const progressSegmentCompleteStyle: CSSProperties = {
  background: 'linear-gradient(90deg, #34d399, #86efac)',
}

const titleStyle: CSSProperties = {
  margin: '18px 0 0',
  fontSize: '1.45rem',
  lineHeight: 1.15,
  color: '#f8fafc',
}

const bodyTextStyle: CSSProperties = {
  margin: '10px 0 0',
  fontSize: '0.98rem',
  lineHeight: 1.55,
  color: '#cbd5e1',
}

const ratingGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: '10px',
  marginTop: '18px',
}

const ratingButtonStyle: CSSProperties = {
  minHeight: '54px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: '18px',
  color: '#f8fafc',
  fontSize: '1.05rem',
  fontWeight: 800,
  cursor: 'pointer',
  transition: 'transform 140ms ease, box-shadow 140ms ease',
}

const ratingButtonLowStyle: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(127, 29, 29, 0.96), rgba(69, 10, 10, 0.98))',
  boxShadow: '0 16px 34px rgba(69, 10, 10, 0.28)',
}

const ratingButtonMidStyle: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(120, 53, 15, 0.96), rgba(67, 20, 7, 0.98))',
  boxShadow: '0 16px 34px rgba(120, 53, 15, 0.22)',
}

const ratingButtonHighStyle: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(22, 101, 52, 0.96), rgba(20, 83, 45, 0.98))',
  boxShadow: '0 16px 34px rgba(20, 83, 45, 0.24)',
}

const ratingHintRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '10px',
  fontSize: '0.82rem',
  color: '#64748b',
}

const chipGridStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
  marginTop: '18px',
}

const chipButtonStyle: CSSProperties = {
  width: '100%',
  border: '1px solid rgba(96, 165, 250, 0.18)',
  borderRadius: '18px',
  background: 'rgba(15, 23, 42, 0.94)',
  color: '#e2e8f0',
  padding: '14px 16px',
  textAlign: 'left',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  marginTop: '18px',
  borderRadius: '18px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: 'rgba(15, 23, 42, 0.88)',
  color: '#e2e8f0',
  padding: '14px 15px',
  font: 'inherit',
  lineHeight: 1.5,
  resize: 'vertical',
}

const footerActionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  marginTop: '18px',
}

const sharedButtonStyle: CSSProperties = {
  border: 'none',
  borderRadius: '999px',
  padding: '12px 18px',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}

const ghostButtonStyle: CSSProperties = {
  ...sharedButtonStyle,
  color: '#cbd5e1',
  background: 'rgba(51, 65, 85, 0.8)',
}

const submitButtonStyle: CSSProperties = {
  ...sharedButtonStyle,
  color: '#0f172a',
  background: '#f8fafc',
  minWidth: '116px',
}

const errorTextStyle: CSSProperties = {
  marginTop: '12px',
  color: '#fda4af',
  fontSize: '0.9rem',
}

const thanksWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '36px 10px 14px',
}

const thanksBadgeStyle: CSSProperties = {
  width: '56px',
  height: '56px',
  borderRadius: '999px',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(180deg, rgba(52, 211, 153, 0.26), rgba(34, 197, 94, 0.18))',
  color: '#86efac',
  fontSize: '1.4rem',
  fontWeight: 900,
  boxShadow: '0 18px 38px rgba(22, 163, 74, 0.16)',
}
