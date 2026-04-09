'use client'

import type { CSSProperties, FormEvent } from 'react'
import { useState } from 'react'

type FeedbackPromptProps = {
  onSkip: () => void
  onSubmit: (feedback: string) => void | Promise<void>
}

export function FeedbackPrompt({ onSkip, onSubmit }: FeedbackPromptProps) {
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    <form style={cardStyle} onSubmit={handleSubmit}>
      <div style={eyebrowStyle}>Leaving so soon?</div>
      <h1 style={titleStyle}>Why are you leaving?</h1>
      <p style={bodyStyle}>A quick note helps us understand what pushed you away from chat.</p>
      <textarea
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        placeholder="Optional feedback"
        rows={5}
        style={textareaStyle}
      />
      <div style={actionsStyle}>
        <button type="button" style={skipButtonStyle} onClick={onSkip} disabled={isSubmitting}>
          Skip
        </button>
        <button type="submit" style={submitButtonStyle} disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Submit'}
        </button>
      </div>
    </form>
  )
}

const cardStyle: CSSProperties = {
  width: 'min(100%, 420px)',
  borderRadius: '22px',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  background: '#ffffff',
  boxShadow: '0 28px 70px rgba(15, 23, 42, 0.16)',
  padding: '24px',
}

const eyebrowStyle: CSSProperties = {
  marginBottom: '10px',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#2563eb',
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.45rem',
  lineHeight: 1.15,
  color: '#0f172a',
}

const bodyStyle: CSSProperties = {
  margin: '10px 0 0',
  fontSize: '0.96rem',
  lineHeight: 1.55,
  color: '#475569',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  marginTop: '18px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  padding: '14px 15px',
  font: 'inherit',
  color: '#0f172a',
  background: '#f8fafc',
  resize: 'vertical',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '18px',
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
  color: '#334155',
  background: '#e2e8f0',
}

const submitButtonStyle: CSSProperties = {
  ...sharedButtonStyle,
  color: '#ffffff',
  background: '#111827',
}
