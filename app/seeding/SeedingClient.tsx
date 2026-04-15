'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type SeedingClientProps = {
  isInitiallyAuthorized: boolean
  secretConfigured: boolean
}

type SeedMessage = {
  id: string
  username: string
  text: string
  delaySeconds: number
}

type ApiResponse = {
  ok?: boolean
  error?: string
  room?: {
    id: string
    headline: string
  }
}

const categories = [
  'General',
  'Tech',
  'Sports',
  'Entertainment',
  'Business',
  'Science',
  'Gaming',
  'Campus Life',
]

const pageStyle = {
  minHeight: '100dvh',
  background: '#f5f5f5',
  color: '#111',
  padding: '24px 16px 48px',
}

const shellStyle = {
  width: '100%',
  maxWidth: '760px',
  margin: '0 auto',
}

const sectionStyle = {
  background: '#fff',
  border: '1px solid #dcdcdc',
  borderRadius: '12px',
  padding: '18px',
  marginTop: '14px',
}

const labelStyle = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  marginBottom: '6px',
}

const inputStyle = {
  width: '100%',
  border: '1px solid #cfcfcf',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '14px',
  background: '#fff',
  color: '#111',
  fontFamily: 'inherit',
}

const buttonStyle = {
  border: '1px solid #cfcfcf',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '14px',
  background: '#fff',
  color: '#111',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const createLocalId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const formatLaunchTime = (value: string) => {
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return value
  return target.toLocaleString()
}

export default function SeedingClient({
  isInitiallyAuthorized,
  secretConfigured,
}: SeedingClientProps) {
  const [isAuthorized, setIsAuthorized] = useState(isInitiallyAuthorized)
  const [adminKey, setAdminKey] = useState('')
  const [topic, setTopic] = useState('')
  const [college, setCollege] = useState('')
  const [category, setCategory] = useState('General')
  const [draftUsername, setDraftUsername] = useState('')
  const [draftText, setDraftText] = useState('')
  const [draftDelay, setDraftDelay] = useState('0')
  const [messages, setMessages] = useState<SeedMessage[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [goLiveNow, setGoLiveNow] = useState(true)
  const [authPending, setAuthPending] = useState(false)
  const [launchState, setLaunchState] = useState<'idle' | 'scheduled' | 'running'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [logs, setLogs] = useState<string[]>([
    secretConfigured
      ? isInitiallyAuthorized
        ? 'Seeding access unlocked.'
        : 'Enter the admin secret to unlock this page.'
      : 'Set ADMIN_BROADCAST_SECRET or ADMIN_SECRET_KEY first.',
  ])
  const timeoutIdsRef = useRef<number[]>([])

  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
      timeoutIdsRef.current = []
    }
  }, [])

  const canAddMessage = useMemo(() => {
    return (
      draftUsername.trim().length > 0 &&
      draftText.trim().length > 0 &&
      draftDelay.trim().length > 0 &&
      Number.isFinite(Number(draftDelay)) &&
      Number(draftDelay) >= 0
    )
  }, [draftDelay, draftText, draftUsername])

  const canStart = useMemo(() => {
    return (
      isAuthorized &&
      topic.trim().length > 0 &&
      college.trim().length > 0 &&
      messages.length > 0 &&
      launchState === 'idle' &&
      (goLiveNow || scheduledAt.trim().length > 0)
    )
  }, [college, goLiveNow, isAuthorized, launchState, messages.length, scheduledAt, topic])

  const appendLog = (message: string) => {
    setLogs((currentLogs) => [...currentLogs, message])
  }

  const clearTimers = () => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    timeoutIdsRef.current = []
  }

  const scheduleTask = (callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((item) => item !== timeoutId)
      callback()
    }, delayMs)

    timeoutIdsRef.current.push(timeoutId)
  }

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!adminKey.trim()) {
      setErrorMessage('Enter the admin secret key.')
      return
    }

    setAuthPending(true)
    setErrorMessage('')
    setLogs(['Verifying admin key...'])

    try {
      const response = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ admin_key: adminKey.trim() }),
      })

      const payload = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok) {
        setErrorMessage(payload?.error || 'Admin key verification failed.')
        setLogs(['Unlock failed.'])
        return
      }

      setAdminKey('')
      setIsAuthorized(true)
      setLogs(['Seeding access unlocked.'])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Admin key verification failed.')
      setLogs(['Unlock failed.'])
    } finally {
      setAuthPending(false)
    }
  }

  const handleLogout = async () => {
    clearTimers()
    setLaunchState('idle')
    setErrorMessage('')

    try {
      await fetch('/api/admin-auth', { method: 'DELETE' })
    } catch (error) {
      console.error('[Seeding] Logout failed', error)
    }

    setIsAuthorized(false)
    setAdminKey('')
    setLogs(['Enter the admin secret to unlock this page.'])
  }

  const handleAddMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const delaySeconds = Number(draftDelay)
    if (!canAddMessage || !Number.isInteger(delaySeconds)) {
      setErrorMessage('Add a username, message, and a whole-number delay in seconds.')
      return
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: createLocalId(),
        username: draftUsername.trim(),
        text: draftText.trim(),
        delaySeconds,
      },
    ])
    setDraftUsername('')
    setDraftText('')
    setDraftDelay('0')
    setErrorMessage('')
  }

  const handleDeleteMessage = (messageId: string) => {
    setMessages((currentMessages) => currentMessages.filter((message) => message.id !== messageId))
  }

  const postSeedMessage = async (
    roomId: string,
    roomName: string,
    message: SeedMessage,
    shouldIncrementUserCount: boolean
  ) => {
    const response = await fetch('/api/seeding', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create-message',
        roomId,
        roomName,
        username: message.username,
        text: message.text,
        college: college.trim(),
        shouldIncrementUserCount,
      }),
    })

    const payload = (await response.json().catch(() => null)) as ApiResponse | null

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'Message seeding failed.')
    }
  }

  const runMessageChain = (roomId: string, roomName: string, roomMessages: SeedMessage[]) => {
    const firstMessageIndexByUser = new Map<string, number>()
    roomMessages.forEach((message, index) => {
      if (!firstMessageIndexByUser.has(message.username)) {
        firstMessageIndexByUser.set(message.username, index)
      }
    })

    const seedNextMessage = (index: number) => {
      const message = roomMessages[index]
      if (!message) {
        appendLog('Seeding complete.')
        setLaunchState('idle')
        return
      }

      const waitMs = Math.max(0, message.delaySeconds * 1000)
      appendLog(
        index === 0
          ? `Waiting ${message.delaySeconds}s before the first message.`
          : `Waiting ${message.delaySeconds}s before message ${index + 1}.`
      )

      scheduleTask(() => {
        void (async () => {
          try {
            appendLog(`Posting ${index + 1}/${roomMessages.length}: ${message.username}`)
            await postSeedMessage(
              roomId,
              roomName,
              message,
              firstMessageIndexByUser.get(message.username) === index
            )
            appendLog(`Posted: ${message.text}`)
            seedNextMessage(index + 1)
          } catch (error) {
            setLaunchState('idle')
            setErrorMessage(error instanceof Error ? error.message : 'Message seeding failed.')
            appendLog('Seeding stopped because a message failed.')
          }
        })()
      }, waitMs)
    }

    seedNextMessage(0)
  }

  const createRoomAndSeed = async () => {
    setLaunchState('running')
    setErrorMessage('')
    appendLog('Creating room...')

    try {
      const response = await fetch('/api/seeding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create-room',
          topic: topic.trim(),
          college: college.trim(),
          category,
        }),
      })

      const payload = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || !payload?.ok || !payload.room) {
        throw new Error(payload?.error || 'Room creation failed.')
      }

      appendLog(`Room created: ${payload.room.headline}`)
      runMessageChain(payload.room.id, payload.room.headline, messages)
    } catch (error) {
      setLaunchState('idle')
      setErrorMessage(error instanceof Error ? error.message : 'Room creation failed.')
      appendLog('Seeding stopped before messages started.')
    }
  }

  const handleStartSeeding = async () => {
    if (!canStart) {
      setErrorMessage('Fill out the room details and add at least one message.')
      return
    }

    clearTimers()
    setErrorMessage('')
    setLogs([])

    if (goLiveNow) {
      await createRoomAndSeed()
      return
    }

    const launchTime = new Date(scheduledAt)
    const delayMs = launchTime.getTime() - Date.now()

    if (Number.isNaN(launchTime.getTime()) || delayMs <= 0) {
      appendLog('Scheduled time is in the past, starting now.')
      await createRoomAndSeed()
      return
    }

    setLaunchState('scheduled')
    appendLog(`Seeding scheduled for ${formatLaunchTime(scheduledAt)}.`)
    scheduleTask(() => {
      void createRoomAndSeed()
    }, delayMs)
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700 }}>SpreadZ Seeding</h1>
        <p style={{ margin: '8px 0 0', color: '#555', fontSize: '14px' }}>
          Create a room, line up a conversation, then seed it on a timer.
        </p>

        <section style={sectionStyle}>
          {!secretConfigured && (
            <div style={{ fontSize: '14px', color: '#a33' }}>
              Add <code>ADMIN_BROADCAST_SECRET</code> to enable this page.
            </div>
          )}

          {secretConfigured && !isAuthorized && (
            <form onSubmit={handleUnlock}>
              <label htmlFor="admin-key" style={labelStyle}>
                Admin Secret
              </label>
              <input
                id="admin-key"
                type="password"
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                autoComplete="current-password"
                placeholder="Enter admin secret"
                style={inputStyle}
              />
              <button
                type="submit"
                disabled={authPending}
                style={{ ...buttonStyle, marginTop: '12px', width: '100%' }}
              >
                {authPending ? 'Unlocking...' : 'Unlock'}
              </button>
            </form>
          )}

          {secretConfigured && isAuthorized && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '14px' }}>Unlocked</div>
              <button type="button" onClick={handleLogout} style={buttonStyle}>
                Lock
              </button>
            </div>
          )}
        </section>

        {secretConfigured && isAuthorized && (
          <>
            <section style={sectionStyle}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Section 1 — Create Room</h2>

              <div style={{ marginTop: '14px' }}>
                <label htmlFor="room-topic" style={labelStyle}>
                  Room topic or name
                </label>
                <input
                  id="room-topic"
                  type="text"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="AI placement rumors"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginTop: '14px' }}>
                <label htmlFor="college-name" style={labelStyle}>
                  College name
                </label>
                <input
                  id="college-name"
                  type="text"
                  value={college}
                  onChange={(event) => setCollege(event.target.value)}
                  placeholder="Stanford"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginTop: '14px' }}>
                <label htmlFor="room-category" style={labelStyle}>
                  Category
                </label>
                <select
                  id="room-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  style={inputStyle}
                >
                  {categories.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section style={sectionStyle}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Section 2 — Build Conversation</h2>

              <form onSubmit={handleAddMessage} style={{ marginTop: '14px' }}>
                <div>
                  <label htmlFor="seed-username" style={labelStyle}>
                    Username
                  </label>
                  <input
                    id="seed-username"
                    type="text"
                    value={draftUsername}
                    onChange={(event) => setDraftUsername(event.target.value)}
                    placeholder="alex"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label htmlFor="seed-message" style={labelStyle}>
                    Message text
                  </label>
                  <textarea
                    id="seed-message"
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    placeholder="Anyone else hearing this?"
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical' as const }}
                  />
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label htmlFor="seed-delay" style={labelStyle}>
                    Delay after previous message (seconds)
                  </label>
                  <input
                    id="seed-delay"
                    type="number"
                    min="0"
                    step="1"
                    value={draftDelay}
                    onChange={(event) => setDraftDelay(event.target.value)}
                    style={inputStyle}
                  />
                </div>

                <button type="submit" style={{ ...buttonStyle, marginTop: '12px' }}>
                  Add Message
                </button>
              </form>

              <div style={{ marginTop: '18px' }}>
                {messages.length === 0 && (
                  <div style={{ fontSize: '14px', color: '#666' }}>No messages added yet.</div>
                )}

                {messages.map((message, index) => (
                  <div key={message.id}>
                    {index > 0 && (
                      <div style={{ fontSize: '13px', color: '#666', padding: '8px 0' }}>
                        ↓ {message.delaySeconds}s later
                      </div>
                    )}
                    <div
                      style={{
                        borderLeft: '2px solid #ddd',
                        padding: '10px 12px',
                        background: '#fafafa',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '12px',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{message.username}</div>
                          <div style={{ marginTop: '6px', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                            {message.text}
                          </div>
                          {index === 0 && message.delaySeconds > 0 && (
                            <div style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
                              Starts after {message.delaySeconds}s
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(message.id)}
                          style={buttonStyle}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={sectionStyle}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Section 3 — Launch</h2>

              <div style={{ marginTop: '14px' }}>
                <label htmlFor="seed-schedule" style={labelStyle}>
                  Schedule
                </label>
                <input
                  id="seed-schedule"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  disabled={goLiveNow}
                  style={{
                    ...inputStyle,
                    background: goLiveNow ? '#f1f1f1' : '#fff',
                  }}
                />
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '12px',
                  fontSize: '14px',
                }}
              >
                <input
                  type="checkbox"
                  checked={goLiveNow}
                  onChange={(event) => setGoLiveNow(event.target.checked)}
                />
                Go Live Now
              </label>

              <button
                type="button"
                onClick={() => void handleStartSeeding()}
                disabled={!canStart}
                style={{ ...buttonStyle, marginTop: '14px', width: '100%' }}
              >
                {launchState === 'running'
                  ? 'Seeding...'
                  : launchState === 'scheduled'
                    ? 'Scheduled'
                    : 'Start Seeding'}
              </button>
            </section>

            <section style={sectionStyle}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Status</h2>
              <div
                style={{
                  marginTop: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  background: '#fafafa',
                  padding: '12px',
                  minHeight: '120px',
                }}
              >
                {logs.length === 0 ? (
                  <div style={{ fontSize: '14px', color: '#666' }}>Nothing yet.</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={`${log}-${index}`} style={{ fontSize: '14px', lineHeight: 1.5 }}>
                      {log}
                    </div>
                  ))
                )}
                {errorMessage && (
                  <div style={{ marginTop: '10px', fontSize: '14px', color: '#b42318' }}>
                    {errorMessage}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
