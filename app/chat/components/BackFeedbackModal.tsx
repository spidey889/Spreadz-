'use client'

import type { CSSProperties, FormEvent } from 'react'
import { useEffect, useState } from 'react'

type BackFeedbackModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (feedback: string) => void | Promise<void>
}

export function BackFeedbackModal({ open, onClose, onSubmit }: BackFeedbackModalProps) {
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setFeedback('')
      setIsSubmitting(false)
    }
  }, [open])

  if (!open) {
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      await onSubmit(feedback.trim())
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form
        style={modalStyle}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="back-feedback-title"
      >
        <div style={eyebrowStyle}>Spreadz</div>
        <h2 id="back-feedback-title" style={titleStyle}>Why are you leaving?</h2>
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="Optional feedback"
          rows={4}
          style={textareaStyle}
        />
        <div style={actionsStyle}>
          <button type="button" style={skipButtonStyle} onClick={onClose} disabled={isSubmitting}>
            Skip
          </button>
          <button type="submit" style={submitButtonStyle} disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  background: 'rgba(2, 6, 23, 0.76)',
  backdropFilter: 'blur(8px)',
}

const modalStyle: CSSProperties = {
  width: 'min(100%, 360px)',
  borderRadius: '20px',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98))',
  boxShadow: '0 28px 70px rgba(0, 0, 0, 0.45)',
  padding: '20px',
}

const eyebrowStyle: CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#60a5fa',
}

const titleStyle: CSSProperties = {
  margin: '10px 0 0',
  fontSize: '1.2rem',
  lineHeight: 1.2,
  color: '#f8fafc',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  marginTop: '16px',
  borderRadius: '14px',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  background: 'rgba(15, 23, 42, 0.88)',
  color: '#e2e8f0',
  padding: '12px 13px',
  font: 'inherit',
  resize: 'vertical',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '16px',
}

const sharedButtonStyle: CSSProperties = {
  border: 'none',
  borderRadius: '999px',
  padding: '10px 16px',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}

const skipButtonStyle: CSSProperties = {
  ...sharedButtonStyle,
  color: '#cbd5e1',
  background: 'rgba(51, 65, 85, 0.9)',
}

const submitButtonStyle: CSSProperties = {
  ...sharedButtonStyle,
  color: '#0f172a',
  background: '#f8fafc',
}
