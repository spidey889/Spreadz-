'use client'

import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FeedbackPrompt } from './FeedbackPrompt'

const VISITED_FEEDBACK_ENTRY_KEY = 'visitedFeedbackEntry'

export default function FeedbackEntryPage() {
  const router = useRouter()
  const [showFeedback, setShowFeedback] = useState(false)
  const hasPushedChatRef = useRef(false)

  useEffect(() => {
    console.log('entered feedback-entry')

    const hasVisitedFeedbackEntry = window.sessionStorage.getItem(VISITED_FEEDBACK_ENTRY_KEY)

    if (hasVisitedFeedbackEntry) {
      console.log('returned via back -> showing feedback')
      setShowFeedback(true)
      return
    }

    if (hasPushedChatRef.current) {
      return
    }

    hasPushedChatRef.current = true
    window.sessionStorage.setItem(VISITED_FEEDBACK_ENTRY_KEY, 'true')
    console.log('first visit -> pushing chat')
    router.push('/chat')
  }, [router])

  const leaveSite = () => {
    window.history.back()
  }

  const handleSubmit = async (_feedback: string) => {
    leaveSite()
  }

  if (!showFeedback) {
    return (
      <main style={shellStyle}>
        <div style={statusCardStyle}>
          <div style={statusTitleStyle}>Opening Spreadz chat...</div>
          <div style={statusBodyStyle}>Keeping a route in history so browser Back returns to feedback first.</div>
        </div>
      </main>
    )
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

const statusCardStyle: CSSProperties = {
  width: 'min(100%, 420px)',
  borderRadius: '22px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: '#ffffff',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.12)',
  padding: '24px',
}

const statusTitleStyle: CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#0f172a',
}

const statusBodyStyle: CSSProperties = {
  marginTop: '10px',
  fontSize: '0.95rem',
  lineHeight: 1.55,
  color: '#475569',
}
