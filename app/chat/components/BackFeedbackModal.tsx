'use client'

import type { CSSProperties, FormEvent } from 'react'
import { useEffect, useState } from 'react'

type BackFeedbackModalProps = {
  open: boolean
  onClose: () => void
  onSubmit?: (feedback: string) => void | Promise<void>
  title?: string
  description?: string
  closeLabel?: string
  submitLabel?: string
}

export function BackFeedbackModal({
  open,
  onClose,
  onSubmit,
  title = 'Before you go',
  description = 'Anything we could improve before you leave?',
  closeLabel = 'Close',
  submitLabel = 'Send',
}: BackFeedbackModalProps) {
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    // Reset local UI state every time the modal closes so each visit starts clean.
    if (!open) {
      setFeedback('')
      setIsSubmitting(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSubmitting, onClose, open])

  if (!open) {
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!onSubmit || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      await onSubmit(feedback.trim())
      setFeedback('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="back-feedback-title"
        aria-describedby="back-feedback-description"
        style={cardStyle}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div style={copyStyle}>
          <h2 id="back-feedback-title" style={titleStyle}>{title}</h2>
          <p id="back-feedback-description" style={descriptionStyle}>{description}</p>
        </div>

        {onSubmit && (
          <>
            {/* Keep the feedback field local so the page using the modal stays tiny. */}
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Optional feedback"
              rows={3}
              style={textareaStyle}
            />
          </>
        )}

        <div style={actionsStyle}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle} disabled={isSubmitting}>
            {closeLabel}
          </button>
          {onSubmit && (
            <button type="submit" style={primaryButtonStyle} disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : submitLabel}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  backgroundColor: 'rgba(12, 18, 32, 0.52)',
}

const cardStyle: CSSProperties = {
  width: 'min(100%, 340px)',
  borderRadius: '18px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  backgroundColor: '#ffffff',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)',
  padding: '18px',
}

const copyStyle: CSSProperties = {
  display: 'grid',
  gap: '6px',
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 700,
  color: '#0f172a',
}

const descriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.92rem',
  lineHeight: 1.45,
  color: '#475569',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  marginTop: '14px',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  padding: '11px 12px',
  font: 'inherit',
  color: '#0f172a',
  backgroundColor: '#f8fafc',
  resize: 'vertical',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '14px',
}

const secondaryButtonStyle: CSSProperties = {
  border: 'none',
  borderRadius: '999px',
  padding: '10px 14px',
  font: 'inherit',
  fontWeight: 600,
  color: '#334155',
  backgroundColor: '#e2e8f0',
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = {
  border: 'none',
  borderRadius: '999px',
  padding: '10px 14px',
  font: 'inherit',
  fontWeight: 600,
  color: '#ffffff',
  backgroundColor: '#111827',
  cursor: 'pointer',
}
