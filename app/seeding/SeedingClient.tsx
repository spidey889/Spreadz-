'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type SeedingClientProps = {
  isInitiallyAuthorized: boolean
  secretConfigured: boolean
}

type SeedRun = {
  id: string
  room_name: string
  feed_position: number | null
  scheduled_for: string | null
  status: string | null
  messages_input: string | null
  total_messages: number | null
  posted_count: number | null
  room_id: string | null
  last_error: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
}

type ParsedSeedMessage = {
  displayName: string
  college: string
  messageText: string
  postAtSeconds: number
  order: number
}

type SeedingResponse = {
  ok?: boolean
  error?: string
  run?: SeedRun
  runs?: SeedRun[]
}

const pageStyle = {
  height: '100dvh',
  boxSizing: 'border-box' as const,
  overflowY: 'auto' as const,
  background:
    'radial-gradient(circle at top, rgba(124,255,183,0.12), transparent 24%), linear-gradient(180deg, #111214, #171a20)',
  color: '#f5f7fa',
  padding: '32px 16px 48px',
}

const shellStyle = {
  width: '100%',
  maxWidth: '720px',
  margin: '0 auto',
}

const cardStyle = {
  background: 'rgba(19, 22, 27, 0.96)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '24px',
  padding: '24px',
  boxShadow: '0 24px 48px rgba(0,0,0,0.28)',
  backdropFilter: 'blur(16px)',
}

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#9da7b5',
  marginBottom: '8px',
}

const inputStyle = {
  width: '100%',
  borderRadius: '16px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(8, 10, 13, 0.8)',
  color: '#f5f7fa',
  padding: '14px 16px',
  fontSize: '15px',
  outline: 'none',
  fontFamily: 'inherit',
}

const buttonStyle = {
  border: 'none',
  borderRadius: '16px',
  padding: '14px 18px',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const sectionTitleStyle = {
  fontSize: '18px',
  fontWeight: 700,
  margin: '0 0 16px',
  color: '#f5f7fa',
}

const tableCellStyle = {
  padding: '12px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  textAlign: 'left' as const,
  verticalAlign: 'top' as const,
  fontSize: '14px',
  color: '#dce2ea',
}

const parseClockToSeconds = (value: string) => {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])

  if (minutes >= 60 || seconds >= 60) {
    return null
  }

  return hours * 3600 + minutes * 60 + seconds
}

const parseMessagesInput = (value: string) => {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const messages: ParsedSeedMessage[] = []
  const errors: string[] = []

  lines.forEach((line, index) => {
    const parts = line.split(' - ')

    if (parts.length < 4) {
      errors.push(`Line ${index + 1} is invalid.`)
      return
    }

    const displayName = parts[0]?.trim() || ''
    const college = parts[1]?.trim() || ''
    const timeValue = parts[parts.length - 1]?.trim() || ''
    const messageText = parts.slice(2, -1).join(' - ').trim()
    const postAtSeconds = parseClockToSeconds(timeValue)

    if (!displayName || !college || !messageText || postAtSeconds === null) {
      errors.push(`Line ${index + 1} is invalid.`)
      return
    }

    messages.push({
      displayName,
      college,
      messageText,
      postAtSeconds,
      order: index,
    })
  })

  messages.sort((left, right) => {
    if (left.postAtSeconds !== right.postAtSeconds) {
      return left.postAtSeconds - right.postAtSeconds
    }

    return left.order - right.order
  })

  return { messages, errors }
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—'

  const dateValue = new Date(value)
  if (Number.isNaN(dateValue.getTime())) return value

  return dateValue.toLocaleString()
}

const sortRuns = (runs: SeedRun[]) => {
  return [...runs].sort((left, right) => {
    const leftPrimary = left.completed_at || left.scheduled_for || left.created_at || ''
    const rightPrimary = right.completed_at || right.scheduled_for || right.created_at || ''
    return rightPrimary.localeCompare(leftPrimary)
  })
}

export default function SeedingClient({
  isInitiallyAuthorized,
  secretConfigured,
}: SeedingClientProps) {
  const [isAuthorized, setIsAuthorized] = useState(isInitiallyAuthorized)
  const [adminKey, setAdminKey] = useState('')
  const [feedPosition, setFeedPosition] = useState('1')
  const [roomName, setRoomName] = useState('')
  const [messagesInput, setMessagesInput] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [authPending, setAuthPending] = useState(false)
  const [actionPending, setActionPending] = useState<'now' | 'schedule' | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [runs, setRuns] = useState<SeedRun[]>([])
  const [statusLogs, setStatusLogs] = useState<string[]>([
    secretConfigured
      ? isInitiallyAuthorized
        ? 'Seeding access unlocked.'
        : 'Enter the admin secret to unlock this page.'
      : 'Set ADMIN_BROADCAST_SECRET or ADMIN_SECRET_KEY first.',
  ])
  const [errorMessage, setErrorMessage] = useState('')
  const startTimeoutsRef = useRef<Map<string, number>>(new Map())
  const runTimeoutsRef = useRef<Map<string, number>>(new Map())
  const startingRunIdsRef = useRef<Set<string>>(new Set())
  const runningRunIdsRef = useRef<Set<string>>(new Set())
  const actionLockRef = useRef(false)

  const appendLog = (message: string) => {
    setStatusLogs((currentLogs) => [...currentLogs, message])
  }

  const clearRunTimers = (runId: string) => {
    const startTimeoutId = startTimeoutsRef.current.get(runId)
    if (startTimeoutId !== undefined) {
      window.clearTimeout(startTimeoutId)
      startTimeoutsRef.current.delete(runId)
    }

    const runTimeoutId = runTimeoutsRef.current.get(runId)
    if (runTimeoutId !== undefined) {
      window.clearTimeout(runTimeoutId)
      runTimeoutsRef.current.delete(runId)
    }

    startingRunIdsRef.current.delete(runId)
    runningRunIdsRef.current.delete(runId)
  }

  const clearAllTimers = () => {
    startTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    runTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    startTimeoutsRef.current.clear()
    runTimeoutsRef.current.clear()
    startingRunIdsRef.current.clear()
    runningRunIdsRef.current.clear()
  }

  useEffect(() => {
    return () => {
      clearAllTimers()
    }
  }, [])

  const upsertRun = (nextRun: SeedRun) => {
    setRuns((currentRuns) =>
      sortRuns([nextRun, ...currentRuns.filter((run) => run.id !== nextRun.id)])
    )
  }

  const refreshDashboard = async () => {
    if (!isAuthorized) return

    setDashboardLoading(true)
    try {
      const response = await fetch('/api/seeding')
      const payload = (await response.json().catch(() => null)) as SeedingResponse | null

      if (!response.ok) {
        setErrorMessage(payload?.error || 'Failed to load dashboard.')
        return
      }

      setRuns(sortRuns(payload?.runs || []))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load dashboard.')
    } finally {
      setDashboardLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthorized) return
    void refreshDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized])

  const markRunFailed = async (runId: string, nextErrorMessage: string) => {
    clearRunTimers(runId)
    setErrorMessage(nextErrorMessage)
    appendLog(nextErrorMessage)

    try {
      const response = await fetch('/api/seeding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'fail-run',
          runId,
          errorMessage: nextErrorMessage,
        }),
      })

      const payload = (await response.json().catch(() => null)) as SeedingResponse | null
      if (payload?.run) {
        upsertRun(payload.run)
      } else if (!response.ok) {
        setRuns((currentRuns) =>
          currentRuns.map((run) =>
            run.id === runId
              ? { ...run, status: 'failed', last_error: nextErrorMessage }
              : run
          )
        )
      }
    } catch {
      setRuns((currentRuns) =>
        currentRuns.map((run) =>
          run.id === runId
            ? { ...run, status: 'failed', last_error: nextErrorMessage }
            : run
        )
      )
    }
  }

  const postRunMessage = async (
    run: SeedRun,
    message: ParsedSeedMessage,
    ordinal: number,
    shouldIncrementUserCount: boolean
  ) => {
    appendLog(`Posting ${ordinal}/${run.total_messages || 0}: ${message.displayName}`)

    const response = await fetch('/api/seeding', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create-message',
        runId: run.id,
        roomId: run.room_id,
        displayName: message.displayName,
        college: message.college,
        messageText: message.messageText,
        shouldIncrementUserCount,
      }),
    })

    const payload = (await response.json().catch(() => null)) as SeedingResponse | null

    if (!response.ok || !payload?.run) {
      throw new Error(payload?.error || 'Message post failed.')
    }

    appendLog(`Posted ${ordinal}/${payload.run.total_messages || 0}: ${message.messageText}`)
    return payload.run
  }

  const scheduleRunMessages = (run: SeedRun) => {
    if (!run.room_id || runningRunIdsRef.current.has(run.id)) {
      return
    }

    const parsed = parseMessagesInput(run.messages_input || '')
    if (parsed.errors.length > 0) {
      void markRunFailed(run.id, parsed.errors[0])
      return
    }

    const messages = parsed.messages
    const postedCount = Math.max(0, run.posted_count || 0)
    const startedAtMs = run.started_at ? new Date(run.started_at).getTime() : Date.now()

    if (Number.isNaN(startedAtMs)) {
      void markRunFailed(run.id, 'Run start time is invalid.')
      return
    }

    if (postedCount >= messages.length) {
      clearRunTimers(run.id)
      return
    }

    const firstMessageIndexByUser = new Map<string, number>()
    messages.forEach((message, index) => {
      const key = `${message.displayName.toLowerCase()}::${message.college.toLowerCase()}`
      if (!firstMessageIndexByUser.has(key)) {
        firstMessageIndexByUser.set(key, index)
      }
    })

    runningRunIdsRef.current.add(run.id)

    const scheduleNextMessage = (nextIndex: number) => {
      const message = messages[nextIndex]

      if (!message) {
        clearRunTimers(run.id)
        return
      }

      const nextTargetTime = startedAtMs + message.postAtSeconds * 1000
      const delayMs = Math.max(0, nextTargetTime - Date.now())

      const timeoutId = window.setTimeout(() => {
        runTimeoutsRef.current.delete(run.id)

        void (async () => {
          const userKey = `${message.displayName.toLowerCase()}::${message.college.toLowerCase()}`

          try {
            const updatedRun = await postRunMessage(
              run,
              message,
              nextIndex + 1,
              firstMessageIndexByUser.get(userKey) === nextIndex
            )

            upsertRun(updatedRun)

            if (updatedRun.status === 'completed') {
              appendLog(`Completed room: ${updatedRun.room_name}`)
              clearRunTimers(updatedRun.id)
              return
            }

            scheduleNextMessage(nextIndex + 1)
          } catch (error) {
            await markRunFailed(
              run.id,
              error instanceof Error ? error.message : 'Message post failed.'
            )
          }
        })()
      }, delayMs)

      runTimeoutsRef.current.set(run.id, timeoutId)
    }

    scheduleNextMessage(postedCount)
  }

  const startRun = async (runId: string) => {
    if (startingRunIdsRef.current.has(runId) || runningRunIdsRef.current.has(runId)) {
      return
    }

    startingRunIdsRef.current.add(runId)
    appendLog(`Starting run ${runId}...`)

    try {
      const response = await fetch('/api/seeding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'start-run',
          runId,
        }),
      })

      const payload = (await response.json().catch(() => null)) as SeedingResponse | null

      if (!response.ok || !payload?.run) {
        await markRunFailed(runId, payload?.error || 'Run start failed.')
        return
      }

      startingRunIdsRef.current.delete(runId)
      upsertRun(payload.run)
      appendLog(`Room live: ${payload.run.room_name}`)
      scheduleRunMessages(payload.run)
    } catch (error) {
      startingRunIdsRef.current.delete(runId)
      await markRunFailed(
        runId,
        error instanceof Error ? error.message : 'Run start failed.'
      )
    }
  }

  const attachRun = (run: SeedRun) => {
    if (!run.id) return

    if (run.status === 'completed' || run.status === 'failed') {
      clearRunTimers(run.id)
      return
    }

    if (run.status === 'running') {
      scheduleRunMessages(run)
      return
    }

    if (run.status !== 'scheduled') {
      return
    }

    if (startTimeoutsRef.current.has(run.id)) {
      return
    }

    const scheduledAt = run.scheduled_for ? new Date(run.scheduled_for).getTime() : Date.now()
    const delayMs = Math.max(0, scheduledAt - Date.now())

    const timeoutId = window.setTimeout(() => {
      startTimeoutsRef.current.delete(run.id)
      void startRun(run.id)
    }, delayMs)

    startTimeoutsRef.current.set(run.id, timeoutId)
  }

  useEffect(() => {
    if (!isAuthorized) return

    runs.forEach((run) => {
      attachRun(run)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, runs])

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!adminKey.trim()) {
      setErrorMessage('Enter the admin secret key.')
      return
    }

    setAuthPending(true)
    setErrorMessage('')
    setStatusLogs(['Verifying admin key...'])

    try {
      const response = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ admin_key: adminKey.trim() }),
      })

      const payload = (await response.json().catch(() => null)) as SeedingResponse | null

      if (!response.ok) {
        setErrorMessage(payload?.error || 'Admin key verification failed.')
        setStatusLogs(['Unlock failed.'])
        return
      }

      setIsAuthorized(true)
      setAdminKey('')
      setStatusLogs(['Seeding access unlocked.'])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Admin key verification failed.')
      setStatusLogs(['Unlock failed.'])
    } finally {
      setAuthPending(false)
    }
  }

  const handleLogout = async () => {
    clearAllTimers()
    setRuns([])
    setErrorMessage('')
    setStatusLogs(['Signing out...'])

    try {
      await fetch('/api/admin-auth', { method: 'DELETE' })
    } catch (error) {
      console.error('[Seeding] Logout failed', error)
    }

    setIsAuthorized(false)
    setAdminKey('')
    setStatusLogs(['Enter the admin secret to unlock this page.'])
  }

  const handleCreateRun = async (mode: 'now' | 'schedule') => {
    if (actionLockRef.current) {
      return
    }

    const parsedFeedPosition = Number(feedPosition)
    const parsedMessages = parseMessagesInput(messagesInput)

    if (!Number.isInteger(parsedFeedPosition) || parsedFeedPosition < 1) {
      setErrorMessage('Feed position number must be 1 or higher.')
      return
    }

    if (!roomName.trim()) {
      setErrorMessage('Room name is required.')
      return
    }

    if (parsedMessages.errors.length > 0) {
      setErrorMessage(parsedMessages.errors[0])
      return
    }

    if (parsedMessages.messages.length === 0) {
      setErrorMessage('Add at least one valid message line.')
      return
    }

    let scheduledForIso = new Date().toISOString()

    if (mode === 'schedule') {
      if (!scheduledFor.trim()) {
        setErrorMessage('Pick a schedule time first.')
        return
      }

      const scheduledDate = new Date(scheduledFor)
      if (Number.isNaN(scheduledDate.getTime())) {
        setErrorMessage('Schedule time is invalid.')
        return
      }

      scheduledForIso = scheduledDate.toISOString()
    }

    actionLockRef.current = true
    setActionPending(mode)
    setErrorMessage('')
    appendLog(mode === 'now' ? 'Saving run for immediate launch...' : 'Saving scheduled run...')

    try {
      const response = await fetch('/api/seeding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create-run',
          roomName: roomName.trim(),
          feedPosition: parsedFeedPosition,
          scheduledFor: scheduledForIso,
          messagesInput,
          totalMessages: parsedMessages.messages.length,
        }),
      })

      const payload = (await response.json().catch(() => null)) as SeedingResponse | null

      if (!response.ok || !payload?.run) {
        setErrorMessage(payload?.error || 'Failed to create run.')
        return
      }

      upsertRun(payload.run)
      appendLog(
        mode === 'now'
          ? `Run queued for ${payload.run.room_name}.`
          : `Scheduled ${payload.run.room_name} for ${formatDateTime(payload.run.scheduled_for)}.`
      )
      attachRun(payload.run)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create run.')
    } finally {
      actionLockRef.current = false
      setActionPending(null)
    }
  }

  const canCreateRun = useMemo(() => {
    return isAuthorized && !actionPending
  }, [actionPending, isAuthorized])

  const activeRuns = useMemo(() => {
    return runs
      .filter((run) => run.status !== 'completed')
      .sort((left, right) =>
        (left.scheduled_for || left.created_at || '').localeCompare(
          right.scheduled_for || right.created_at || ''
        )
      )
  }, [runs])

  const completedRuns = useMemo(() => {
    return runs
      .filter((run) => run.status === 'completed')
      .sort((left, right) =>
        (right.completed_at || '').localeCompare(left.completed_at || '')
      )
  }, [runs])

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={{ marginBottom: '18px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '999px',
              background: 'rgba(124,255,183,0.1)',
              border: '1px solid rgba(124,255,183,0.16)',
              color: '#b9ffd4',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            SpreadZ Admin
          </div>
          <h1
            style={{
              fontSize: '34px',
              lineHeight: 1.05,
              letterSpacing: '-0.04em',
              margin: '16px 0 10px',
            }}
          >
            Seed Rooms and Conversations
          </h1>
          <p style={{ color: '#aab3bf', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
            Create a room, bulk-load messages, and schedule it from one admin panel.
          </p>
        </div>

        <section style={cardStyle}>
          {!secretConfigured && (
            <div
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(255, 160, 122, 0.24)',
                background: 'rgba(255, 160, 122, 0.1)',
                color: '#ffd4c4',
                padding: '14px 16px',
                fontSize: '14px',
                lineHeight: 1.5,
              }}
            >
              Add `ADMIN_BROADCAST_SECRET` to your environment to enable this page.
            </div>
          )}

          {secretConfigured && !isAuthorized && (
            <form onSubmit={handleUnlock}>
              <div style={{ marginBottom: '18px' }}>
                <label htmlFor="admin-key" style={labelStyle}>
                  Admin Secret
                </label>
                <input
                  id="admin-key"
                  type="password"
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  placeholder="Enter your admin secret"
                  autoComplete="current-password"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={authPending}
                style={{
                  ...buttonStyle,
                  width: '100%',
                  background: 'linear-gradient(135deg, #9af7b2, #6dd6ff)',
                  color: '#071017',
                  opacity: authPending ? 0.75 : 1,
                }}
              >
                {authPending ? 'Unlocking...' : 'Unlock Seeding Panel'}
              </button>
            </form>
          )}

          {secretConfigured && isAuthorized && (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={labelStyle}>Status</div>
                  <div style={{ fontSize: '15px', color: '#dbe2ea', marginTop: '-2px' }}>
                    Authorized
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    ...buttonStyle,
                    background: 'rgba(255,255,255,0.08)',
                    color: '#f5f7fa',
                    padding: '12px 14px',
                  }}
                >
                  Lock
                </button>
              </div>

              <div style={{ marginTop: '24px' }}>
                <h2 style={sectionTitleStyle}>Section 1 — Room Setup</h2>

                <div style={{ marginTop: '18px' }}>
                  <label htmlFor="feed-position" style={labelStyle}>
                    Feed Position Number
                  </label>
                  <input
                    id="feed-position"
                    type="number"
                    min="1"
                    step="1"
                    value={feedPosition}
                    onChange={(event) => setFeedPosition(event.target.value)}
                    placeholder="1"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: '18px' }}>
                  <label htmlFor="room-name" style={labelStyle}>
                    Room Name
                  </label>
                  <input
                    id="room-name"
                    type="text"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    placeholder="Placement talk"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginTop: '28px' }}>
                <h2 style={sectionTitleStyle}>Section 2 — Bulk Message Input</h2>

                <label htmlFor="bulk-messages" style={labelStyle}>
                  Messages
                </label>
                <textarea
                  id="bulk-messages"
                  value={messagesInput}
                  onChange={(event) => setMessagesInput(event.target.value)}
                  placeholder={
                    'Rahul - IIT Bombay - anyone else getting placed? - 00:00:10\nPriya - BITS Pilani - heard Flipkart is coming - 00:01:30\nArjun - VIT - bro same, super nervous - 00:02:00'
                  }
                  rows={12}
                  style={{
                    ...inputStyle,
                    resize: 'vertical' as const,
                    minHeight: '240px',
                  }}
                />
              </div>

              <div style={{ marginTop: '28px' }}>
                <h2 style={sectionTitleStyle}>Section 3 — Launch</h2>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <label htmlFor="schedule-at" style={labelStyle}>
                      Schedule
                    </label>
                    <input
                      id="schedule-at"
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(event) => setScheduledFor(event.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!canCreateRun}
                    onClick={() => void handleCreateRun('now')}
                    style={{
                      ...buttonStyle,
                      background: 'linear-gradient(135deg, #9af7b2, #6dd6ff)',
                      color: '#071017',
                      opacity: canCreateRun ? 1 : 0.6,
                    }}
                  >
                    {actionPending === 'now' ? 'Launching...' : 'Go Live Now'}
                  </button>

                  <button
                    type="button"
                    disabled={!canCreateRun}
                    onClick={() => void handleCreateRun('schedule')}
                    style={{
                      ...buttonStyle,
                      background: 'rgba(255,255,255,0.08)',
                      color: '#f5f7fa',
                      opacity: canCreateRun ? 1 : 0.6,
                    }}
                  >
                    {actionPending === 'schedule' ? 'Scheduling...' : 'Schedule'}
                  </button>
                </div>

                <div
                  style={{
                    marginTop: '18px',
                    borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '14px 16px',
                  }}
                >
                  <div style={labelStyle}>Status Log</div>
                  <div style={{ color: '#dce2ea', fontSize: '14px', lineHeight: 1.55 }}>
                    {statusLogs.map((log, index) => (
                      <div key={`${log}-${index}`}>{log}</div>
                    ))}
                  </div>
                  {errorMessage && (
                    <div
                      style={{
                        marginTop: '10px',
                        color: '#ffb8b8',
                        fontSize: '13px',
                        lineHeight: 1.5,
                      }}
                    >
                      {errorMessage}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        {secretConfigured && isAuthorized && (
          <section style={{ ...cardStyle, marginTop: '18px' }}>
            <h2 style={{ ...sectionTitleStyle, marginBottom: '12px' }}>Section 4 — Dashboard</h2>

            <div style={{ color: '#aab3bf', fontSize: '14px', marginBottom: '16px' }}>
              {dashboardLoading ? 'Loading dashboard...' : 'Pulled from Supabase.'}
            </div>

            <div style={{ marginTop: '12px' }}>
              <div style={{ ...labelStyle, marginBottom: '10px' }}>Scheduled Rooms</div>
              <div style={{ overflowX: 'auto' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={tableCellStyle}>Name</th>
                      <th style={tableCellStyle}>Feed Position</th>
                      <th style={tableCellStyle}>Scheduled Time</th>
                      <th style={tableCellStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRuns.length === 0 && (
                      <tr>
                        <td colSpan={4} style={tableCellStyle}>
                          No scheduled rooms yet.
                        </td>
                      </tr>
                    )}
                    {activeRuns.map((run) => (
                      <tr key={run.id}>
                        <td style={tableCellStyle}>{run.room_name || '—'}</td>
                        <td style={tableCellStyle}>{run.feed_position ?? '—'}</td>
                        <td style={tableCellStyle}>{formatDateTime(run.scheduled_for)}</td>
                        <td style={tableCellStyle}>
                          {run.status || '—'}
                          {run.last_error ? (
                            <div style={{ marginTop: '6px', color: '#ffb8b8', fontSize: '12px' }}>
                              {run.last_error}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <div style={{ ...labelStyle, marginBottom: '10px' }}>Completed Rooms</div>
              <div style={{ overflowX: 'auto' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={tableCellStyle}>Name</th>
                      <th style={tableCellStyle}>Feed Position</th>
                      <th style={tableCellStyle}>Scheduled Time</th>
                      <th style={tableCellStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRuns.length === 0 && (
                      <tr>
                        <td colSpan={4} style={tableCellStyle}>
                          No completed rooms yet.
                        </td>
                      </tr>
                    )}
                    {completedRuns.map((run) => (
                      <tr key={run.id}>
                        <td style={tableCellStyle}>{run.room_name || '—'}</td>
                        <td style={tableCellStyle}>{run.feed_position ?? '—'}</td>
                        <td style={tableCellStyle}>{formatDateTime(run.scheduled_for)}</td>
                        <td style={tableCellStyle}>{run.status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
