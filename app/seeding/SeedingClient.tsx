'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

type AvatarDraft = {
  file: File | null
  previewUrl: string | null
  avatarUrl: string | null
}

type LiveRunDraft = {
  roomName: string
  feedPosition: number
  messagesInput: string
  totalMessages: number
  scheduledForIso: string
  displayNames: string[]
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
    'radial-gradient(circle at top, rgba(255, 68, 68, 0.2), transparent 28%), linear-gradient(180deg, #160707 0%, #100606 32%, #080808 100%)',
  color: '#f4eaea',
  padding: '40px 24px 56px',
}

const shellStyle = {
  width: '100%',
  maxWidth: '1120px',
  margin: '0 auto',
}

const cardStyle = {
  background: 'rgba(18, 10, 10, 0.92)',
  border: '1px solid rgba(255, 92, 92, 0.14)',
  borderRadius: '28px',
  padding: '32px',
  boxShadow: '0 28px 60px rgba(0, 0, 0, 0.38)',
  backdropFilter: 'blur(18px)',
}

const panelStyle = {
  borderRadius: '22px',
  border: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.02)',
  padding: '22px',
}

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: '#c98c8c',
  marginBottom: '10px',
}

const inputStyle = {
  width: '100%',
  borderRadius: '14px',
  border: '1px solid rgba(255, 120, 120, 0.12)',
  background: 'rgba(11, 8, 8, 0.92)',
  color: '#f6eeee',
  padding: '14px 15px',
  fontSize: '15px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
}

const buttonStyle = {
  border: 'none',
  borderRadius: '14px',
  padding: '14px 18px',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const sectionTitleStyle = {
  fontSize: '16px',
  fontWeight: 700,
  margin: '0 0 16px',
  color: '#fff3f3',
}

const errorBoxStyle = {
  borderRadius: '16px',
  border: '1px solid rgba(255, 105, 105, 0.24)',
  background: 'rgba(255, 79, 79, 0.1)',
  color: '#ffd1d1',
  padding: '14px 16px',
  fontSize: '13px',
  lineHeight: 1.5,
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
  if (!value) return '-'

  const dateValue = new Date(value)
  if (Number.isNaN(dateValue.getTime())) return value

  return dateValue.toLocaleString()
}

const extractUniqueDisplayNamesFromInput = (value: string) => {
  const seen = new Set<string>()
  const displayNames: string[] = []

  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const name = line.split(' - ')[0]?.trim() || ''

      if (!name || seen.has(name)) return

      seen.add(name)
      displayNames.push(name)
    })

  return displayNames
}

const extractUniqueDisplayNames = (messagesInput: string, messages: ParsedSeedMessage[]) => {
  const displayNames = extractUniqueDisplayNamesFromInput(messagesInput)

  if (displayNames.length > 0) {
    return displayNames
  }

  const seen = new Set<string>()

  messages.forEach((message) => {
    const name = message.displayName.trim()
    if (!name || seen.has(name)) return

    seen.add(name)
    displayNames.push(name)
  })

  return displayNames
}

const createAvatarDrafts = (displayNames: string[]) =>
  Object.fromEntries(
    displayNames.map((displayName) => [
      displayName,
      {
        file: null,
        previewUrl: null,
        avatarUrl: null,
      } satisfies AvatarDraft,
    ])
  ) as Record<string, AvatarDraft>

const revokeAvatarPreview = (previewUrl: string | null) => {
  if (previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl)
  }
}

const buildAvatarStoragePath = (roomId: string, displayName: string) => {
  const safeDisplayName = displayName.trim().replace(/[\\/]/g, '-')
  return `${roomId}/${safeDisplayName || 'avatar'}.png`
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
  const [scriptDisplayNames, setScriptDisplayNames] = useState<string[]>([])
  const [pendingLiveRunDraft, setPendingLiveRunDraft] = useState<LiveRunDraft | null>(null)
  const [avatarModalRun, setAvatarModalRun] = useState<SeedRun | null>(null)
  const [avatarDrafts, setAvatarDrafts] = useState<Record<string, AvatarDraft>>({})
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false)
  const [avatarModalError, setAvatarModalError] = useState('')
  const [authPending, setAuthPending] = useState(false)
  const [actionPending, setActionPending] = useState<'now' | 'schedule' | null>(null)
  const [runs, setRuns] = useState<SeedRun[]>([])
  const [, setStatusLogs] = useState<string[]>([
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
  const avatarDraftsRef = useRef<Record<string, AvatarDraft>>({})
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

  useEffect(() => {
    avatarDraftsRef.current = avatarDrafts
  }, [avatarDrafts])

  useEffect(() => {
    return () => {
      Object.values(avatarDraftsRef.current).forEach((draft) => {
        revokeAvatarPreview(draft.previewUrl)
      })
    }
  }, [])

  useEffect(() => {
    const parsed = parseMessagesInput(messagesInput)
    setScriptDisplayNames(
      parsed.errors.length > 0
        ? extractUniqueDisplayNamesFromInput(messagesInput)
        : extractUniqueDisplayNames(messagesInput, parsed.messages)
    )
  }, [messagesInput])

  const upsertRun = (nextRun: SeedRun) => {
    setRuns((currentRuns) =>
      sortRuns([nextRun, ...currentRuns.filter((run) => run.id !== nextRun.id)])
    )
  }

  const refreshDashboard = async () => {
    if (!isAuthorized) return

    try {
      const response = await fetch('/api/seeding')
      const payload = (await response.json().catch(() => null)) as SeedingResponse | null

      if (!response.ok) {
        setErrorMessage(payload?.error || 'Failed to load seeding runs.')
        return
      }

      setRuns(sortRuns(payload?.runs || []))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load seeding runs.')
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
    } catch {}

    setIsAuthorized(false)
    setAdminKey('')
    setStatusLogs(['Enter the admin secret to unlock this page.'])
  }

  const closeAvatarModal = () => {
    Object.values(avatarDraftsRef.current).forEach((draft) => {
      revokeAvatarPreview(draft.previewUrl)
    })

    setAvatarDrafts({})
    setAvatarModalError('')
    setAvatarModalRun(null)
    setPendingLiveRunDraft(null)
    setIsAvatarModalOpen(false)
  }

  const validateRunDraft = (mode: 'now' | 'schedule') => {
    const parsedFeedPosition = Number(feedPosition)
    const parsedMessages = parseMessagesInput(messagesInput)

    if (!Number.isInteger(parsedFeedPosition) || parsedFeedPosition < 1) {
      setErrorMessage('Feed position number must be 1 or higher.')
      return null
    }

    if (!roomName.trim()) {
      setErrorMessage('Room name is required.')
      return null
    }

    if (parsedMessages.errors.length > 0) {
      setErrorMessage(parsedMessages.errors[0])
      return null
    }

    if (parsedMessages.messages.length === 0) {
      setErrorMessage('Add at least one valid message line.')
      return null
    }

    let scheduledForIso = new Date().toISOString()

    if (mode === 'schedule') {
      if (!scheduledFor.trim()) {
        setErrorMessage('Pick a schedule time first.')
        return null
      }

      const scheduledDate = new Date(scheduledFor)
      if (Number.isNaN(scheduledDate.getTime())) {
        setErrorMessage('Schedule time is invalid.')
        return null
      }

      scheduledForIso = scheduledDate.toISOString()
    }

    return {
      roomName: roomName.trim(),
      feedPosition: parsedFeedPosition,
      messagesInput,
      totalMessages: parsedMessages.messages.length,
      scheduledForIso,
      displayNames: extractUniqueDisplayNames(messagesInput, parsedMessages.messages),
    } satisfies LiveRunDraft
  }

  const createRunRecord = async (mode: 'now' | 'schedule', draft: LiveRunDraft) => {
    if (actionLockRef.current) {
      return { error: 'Another seeding action is already in progress.' }
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
          roomName: draft.roomName,
          feedPosition: draft.feedPosition,
          scheduledFor: draft.scheduledForIso,
          messagesInput: draft.messagesInput,
          totalMessages: draft.totalMessages,
        }),
      })

      const payload = (await response.json().catch(() => null)) as SeedingResponse | null

      if (!response.ok || !payload?.run) {
        return { error: payload?.error || 'Failed to create run.' }
      }

      return { run: payload.run }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to create run.',
      }
    } finally {
      actionLockRef.current = false
      setActionPending(null)
    }
  }

  const handleAvatarFileChange = (displayName: string, file: File | null) => {
    setAvatarModalError('')

    if (file && !file.type.startsWith('image/')) {
      setAvatarModalError(`"${displayName}" must use an image file.`)
      return
    }

    setAvatarDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[displayName] || {
        file: null,
        previewUrl: null,
        avatarUrl: null,
      }
      const nextPreviewUrl = file ? URL.createObjectURL(file) : null

      revokeAvatarPreview(currentDraft.previewUrl)

      return {
        ...currentDrafts,
        [displayName]: {
          file,
          previewUrl: nextPreviewUrl,
          avatarUrl: null,
        },
      }
    })
  }

  const saveSeededAvatars = async (
    roomId: string,
    avatarRows: Array<{
      room_id: string
      display_name: string
      avatar_url: string
    }>
  ) => {
    if (avatarRows.length === 0) {
      return
    }

    const seededAvatarQuery = (supabase.from as unknown as (table: string) => any)('seeded_avatars')
    const { data: existingRows, error: existingError } = await seededAvatarQuery
      .select('display_name')
      .eq('room_id', roomId)
      .in(
        'display_name',
        avatarRows.map((row) => row.display_name)
      )

    if (existingError) {
      throw new Error(existingError.message || 'Failed to load seeded avatars.')
    }

    const existingNames = new Set(
      ((existingRows || []) as Array<{ display_name: string | null }>).map(
        (row) => row.display_name || ''
      )
    )
    const rowsToInsert = avatarRows.filter((row) => !existingNames.has(row.display_name))

    if (rowsToInsert.length === 0) {
      return
    }

    const { error: insertError } = await ((supabase.from as unknown as (table: string) => any)(
      'seeded_avatars'
    ) as any).insert(rowsToInsert)

    if (insertError) {
      throw new Error(insertError.message || 'Failed to save seeded avatars.')
    }
  }

  const handleAvatarModalContinue = async () => {
    if (!pendingLiveRunDraft) {
      return
    }

    setAvatarModalError('')

    let run = avatarModalRun

    if (!run) {
      const result = await createRunRecord('now', pendingLiveRunDraft)

      if (!result.run) {
        const nextError = result.error || 'Failed to create run.'
        setErrorMessage(nextError)
        setAvatarModalError(nextError)
        return
      }

      run = result.run
      setAvatarModalRun(result.run)
    }

    if (!run.room_id) {
      setAvatarModalError('Room id is missing for this run.')
      return
    }

    try {
      const avatarUrlsByName = new Map<string, string>()

      for (const displayName of pendingLiveRunDraft.displayNames) {
        const draft = avatarDraftsRef.current[displayName]

        if (!draft) {
          continue
        }

        if (draft.avatarUrl) {
          avatarUrlsByName.set(displayName, draft.avatarUrl)
          continue
        }

        if (!draft.file) {
          continue
        }

        const storagePath = buildAvatarStoragePath(run.room_id, displayName)
        const { error: uploadError } = await supabase.storage.from('avatars').upload(storagePath, draft.file, {
          upsert: true,
          contentType: draft.file.type || 'image/png',
        })

        if (uploadError) {
          throw new Error(uploadError.message || `Failed to upload avatar for ${displayName}.`)
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(storagePath)
        avatarUrlsByName.set(displayName, data.publicUrl)
      }

      if (avatarUrlsByName.size > 0) {
        setAvatarDrafts((currentDrafts) => {
          const nextDrafts = { ...currentDrafts }

          avatarUrlsByName.forEach((avatarUrl, displayName) => {
            const currentDraft = nextDrafts[displayName]
            if (!currentDraft) return

            nextDrafts[displayName] = {
              ...currentDraft,
              avatarUrl,
            }
          })

          return nextDrafts
        })

        await saveSeededAvatars(
          run.room_id,
          Array.from(avatarUrlsByName.entries()).map(([displayName, avatarUrl]) => ({
            room_id: run!.room_id!,
            display_name: displayName,
            avatar_url: avatarUrl,
          }))
        )
      }

      upsertRun(run)
      appendLog(`Run queued for ${run.room_name}.`)
      closeAvatarModal()
      attachRun(run)
    } catch (error) {
      const nextError =
        error instanceof Error ? error.message : 'Failed to save seeded avatars.'
      setErrorMessage(nextError)
      setAvatarModalError(nextError)
    }
  }

  const handleCreateRun = async (mode: 'now' | 'schedule') => {
    const draft = validateRunDraft(mode)

    if (!draft) {
      return
    }

    if (mode === 'now') {
      setErrorMessage('')
      setAvatarModalError('')
      setAvatarModalRun(null)
      setPendingLiveRunDraft(draft)
      setAvatarDrafts(createAvatarDrafts(draft.displayNames))
      setIsAvatarModalOpen(true)
      return
    }

    const result = await createRunRecord(mode, draft)

    if (!result.run) {
      setErrorMessage(result.error || 'Failed to create run.')
      return
    }

    upsertRun(result.run)
    appendLog(`Scheduled ${result.run.room_name} for ${formatDateTime(result.run.scheduled_for)}.`)
    attachRun(result.run)
  }

  const canCreateRun = isAuthorized && !actionPending && !isAvatarModalOpen

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={{ marginBottom: '22px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '999px',
              background: 'rgba(255, 87, 87, 0.12)',
              border: '1px solid rgba(255, 87, 87, 0.2)',
              color: '#ff9b9b',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            SpreadZ Seeding
          </div>
          <h1
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
              lineHeight: 0.96,
              letterSpacing: '-0.04em',
              margin: '18px 0 12px',
              color: '#ff4d4d',
            }}
          >
            Welcome to Hell
          </h1>
          <p style={{ color: '#c9b4b4', fontSize: '15px', lineHeight: 1.65, margin: 0 }}>
            Same seeding flow, stripped down for desktop: cleaner spacing, wider layout, no
            dashboard noise.
          </p>
        </div>

        <section style={cardStyle}>
          {!secretConfigured && (
            <div
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(255, 108, 108, 0.24)',
                background: 'rgba(255, 108, 108, 0.12)',
                color: '#ffd2d2',
                padding: '14px 16px',
                fontSize: '14px',
                lineHeight: 1.5,
              }}
            >
              Add `ADMIN_BROADCAST_SECRET` to your environment to enable this page.
            </div>
          )}

          {secretConfigured && !isAuthorized && (
            <form onSubmit={handleUnlock} style={{ maxWidth: '460px' }}>
              <div style={{ marginBottom: '10px', color: '#e2c3c3', fontSize: '14px' }}>
                Unlock the seeding panel.
              </div>

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

              {errorMessage ? <div style={{ ...errorBoxStyle, marginBottom: '16px' }}>{errorMessage}</div> : null}

              <button
                type="submit"
                disabled={authPending}
                style={{
                  ...buttonStyle,
                  width: '100%',
                  background: 'linear-gradient(135deg, #ff5f5f, #ff2f2f)',
                  color: '#210404',
                  opacity: authPending ? 0.75 : 1,
                }}
              >
                {authPending ? 'Unlocking...' : 'Unlock Panel'}
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
                  flexWrap: 'wrap' as const,
                }}
              >
                <div>
                  <div style={labelStyle}>Access</div>
                  <div style={{ fontSize: '15px', color: '#f6e9e9', marginTop: '-2px' }}>
                    Authorized and ready to seed
                  </div>
                </div>

                <div style={{ color: '#b89a9a', fontSize: '13px' }}>
                  Existing scheduled runs still attach in the background.
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    ...buttonStyle,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#f7efef',
                    padding: '12px 14px',
                  }}
                >
                  Lock Panel
                </button>
              </div>

              {errorMessage ? <div style={{ ...errorBoxStyle, marginTop: '22px' }}>{errorMessage}</div> : null}

              <div
                style={{
                  marginTop: '24px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '24px',
                  alignItems: 'start',
                }}
              >
                <div style={{ display: 'grid', gap: '18px' }}>
                  <div style={panelStyle}>
                    <h2 style={sectionTitleStyle}>Room Setup</h2>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '14px',
                      }}
                    >
                      <div>
                        <label htmlFor="feed-position" style={labelStyle}>
                          Feed Position
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

                      <div>
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
                  </div>

                  <div style={panelStyle}>
                    <h2 style={sectionTitleStyle}>Launch</h2>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
                          background: 'linear-gradient(135deg, #ff5f5f, #ff2f2f)',
                          color: '#210404',
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
                          background: 'rgba(255,255,255,0.06)',
                          color: '#f7efef',
                          opacity: canCreateRun ? 1 : 0.6,
                        }}
                      >
                        {actionPending === 'schedule' ? 'Scheduling...' : 'Schedule'}
                      </button>
                    </div>

                    <p
                      style={{
                        margin: '14px 0 0',
                        color: '#ae9393',
                        fontSize: '13px',
                        lineHeight: 1.6,
                      }}
                    >
                      Go live immediately or pick a time. The backend seeding flow stays the same.
                    </p>
                  </div>
                </div>

                <div style={{ ...panelStyle, minWidth: 0 }}>
                  <h2 style={sectionTitleStyle}>Message Script</h2>

                  <div
                    style={{
                      color: '#ae9393',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      marginBottom: '14px',
                    }}
                  >
                    Format each line like:
                    <br />
                    <code
                      style={{
                        display: 'inline-block',
                        marginTop: '6px',
                        color: '#ffd2d2',
                        fontSize: '12px',
                      }}
                    >
                      Name - College - message - HH:MM:SS
                    </code>
                  </div>

                  <label htmlFor="bulk-messages" style={labelStyle}>
                    Messages
                  </label>
                  <div
                    style={{
                      color: '#8f7474',
                      fontSize: '12px',
                      marginBottom: '10px',
                    }}
                  >
                    Unique names detected: {scriptDisplayNames.length}
                  </div>
                  <textarea
                    id="bulk-messages"
                    value={messagesInput}
                    onChange={(event) => setMessagesInput(event.target.value)}
                    placeholder={
                      'Rahul - IIT Bombay - anyone else getting placed? - 00:00:10\nPriya - BITS Pilani - heard Flipkart is coming - 00:01:30\nArjun - VIT - bro same, super nervous - 00:02:00'
                    }
                    rows={16}
                    style={{
                      ...inputStyle,
                      resize: 'vertical' as const,
                      minHeight: '420px',
                      lineHeight: 1.6,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      {isAvatarModalOpen && pendingLiveRunDraft ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(8, 6, 6, 0.82)',
            backdropFilter: 'blur(10px)',
            padding: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: 'min(80dvh, 820px)',
              overflowY: 'auto',
              borderRadius: '24px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(16, 9, 9, 0.98)',
              boxShadow: '0 28px 80px rgba(0, 0, 0, 0.45)',
              padding: '24px',
            }}
          >
            <div style={{ marginBottom: '18px' }}>
              <div style={labelStyle}>Avatar Assignment</div>
              <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#fff3f3' }}>
                Upload avatars before going live
              </h2>
              <p style={{ margin: 0, color: '#b89999', fontSize: '14px', lineHeight: 1.6 }}>
                Upload is optional for each name. Unassigned names will be skipped.
              </p>
            </div>

            {avatarModalError ? (
              <div style={{ ...errorBoxStyle, marginBottom: '16px' }}>{avatarModalError}</div>
            ) : null}

            <div style={{ display: 'grid', gap: '12px' }}>
              {pendingLiveRunDraft.displayNames.map((displayName) => {
                const avatarDraft = avatarDrafts[displayName]
                const previewSource = avatarDraft?.previewUrl || avatarDraft?.avatarUrl || ''

                return (
                  <div
                    key={displayName}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                      gap: '12px',
                      alignItems: 'center',
                      padding: '14px',
                      borderRadius: '18px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          color: '#fff4f4',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {displayName}
                      </div>
                    </div>

                    <label
                      style={{
                        ...buttonStyle,
                        background: 'rgba(255,255,255,0.06)',
                        color: '#f7efef',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {avatarDraft?.file ? 'Replace Image' : 'Upload Image'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={actionPending === 'now'}
                        onChange={(event) =>
                          handleAvatarFileChange(displayName, event.target.files?.[0] || null)
                        }
                        style={{ display: 'none' }}
                      />
                    </label>

                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '999px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#8e7575',
                        fontSize: '11px',
                        flexShrink: 0,
                      }}
                    >
                      {previewSource ? (
                        <img
                          src={previewSource}
                          alt={`${displayName} avatar preview`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        'No image'
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div
              style={{
                marginTop: '18px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap' as const,
              }}
            >
              <button
                type="button"
                onClick={closeAvatarModal}
                disabled={actionPending === 'now' || !!avatarModalRun}
                style={{
                  ...buttonStyle,
                  background: 'rgba(255,255,255,0.06)',
                  color: '#f7efef',
                  opacity: actionPending === 'now' || avatarModalRun ? 0.45 : 1,
                }}
              >
                Back
              </button>

              <button
                type="button"
                onClick={() => void handleAvatarModalContinue()}
                disabled={actionPending === 'now'}
                style={{
                  ...buttonStyle,
                  background: 'linear-gradient(135deg, #ff5f5f, #ff2f2f)',
                  color: '#210404',
                  opacity: actionPending === 'now' ? 0.7 : 1,
                }}
              >
                {actionPending === 'now' ? 'Saving...' : 'Save Avatars & Go Live'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
