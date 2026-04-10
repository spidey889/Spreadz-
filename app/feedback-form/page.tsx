'use client'

import type { CSSProperties } from 'react'
import { FeedbackPrompt } from './FeedbackPrompt'

export default function FeedbackFormPage() {
  const leaveSite = () => {
    window.history.back()
  }

  const handleSubmit = async (_feedback: string) => {
    leaveSite()
  }

  return (
    <main style={shellStyle}>
      <FeedbackPrompt onSubmit={handleSubmit} onSkip={leaveSite} />
    </main>
  )
}

const shellStyle: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 52%, #f8fafc 100%)',
}
