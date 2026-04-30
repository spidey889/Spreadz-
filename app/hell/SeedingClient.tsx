'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './SeedingClient.module.css'

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
  const [currentRoomId, setCurrentRoomId] = useState('')
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

  const startRunRecord = async (runId: string) => {
    if (startingRunIdsRef.current.has(runId) || runningRunIdsRef.current.has(runId)) {
      return { error: 'Run start already in progress.' }
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
        const nextError = payload?.error || 'Run start failed.'
        await markRunFailed(runId, nextError)
        return { error: nextError }
      }

      startingRunIdsRef.current.delete(runId)
      appendLog(`Room live: ${payload.run.room_name}`)
      return { run: payload.run }
    } catch (error) {
      startingRunIdsRef.current.delete(runId)
      const nextError = error instanceof Error ? error.message : 'Run start failed.'
      await markRunFailed(
        runId,
        nextError
      )
      return { error: nextError }
    }
  }

  const startRun = async (runId: string) => {
    const result = await startRunRecord(runId)

    if (!result.run) {
      return
    }

    upsertRun(result.run)
    scheduleRunMessages(result.run)
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
    setCurrentRoomId('')
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

  const handleAvatarUrlChange = (displayName: string, url: string) => {
    setAvatarDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[displayName] || {
        file: null,
        previewUrl: null,
        avatarUrl: null,
      }
      return {
        ...currentDrafts,
        [displayName]: {
          ...currentDraft,
          avatarUrl: url,
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

  const handleAutoStart = async () => {
    const draft = validateRunDraft('now')
    if (!draft) return

    setActionPending('now')
    setErrorMessage('')
    appendLog('Setting up Auto Start Per User...')

    try {
      // 1. Create a run record (to get a room)
      const createResult = await createRunRecord('now', {
        ...draft,
        totalMessages: 1, // We only post the script message
      })

      if (!createResult.run) {
        throw new Error(createResult.error || 'Failed to create run.')
      }

      // 2. Start the run to create the room and place it in the feed
      const startResult = await startRunRecord(createResult.run.id)
      if (!startResult.run || !startResult.run.room_id) {
        throw new Error(startResult.error || 'Failed to start run.')
      }

      const run = startResult.run
      const roomId = run.room_id

      // 3. Parse and post the script message
      const parsed = parseMessagesInput(messagesInput)
      const scriptMessage = {
        displayName: 'SYSTEM_SEEDING_SCRIPT',
        college: 'SYSTEM',
        messageText: JSON.stringify(parsed.messages),
      }

      await fetch('/api/seeding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create-message',
          runId: run.id,
          roomId: roomId,
          displayName: scriptMessage.displayName,
          college: scriptMessage.college,
          messageText: scriptMessage.messageText,
          shouldIncrementUserCount: false,
        }),
      })

      upsertRun({ ...run, status: 'completed' })
      appendLog(`Auto Start enabled for room: ${run.room_name}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Auto start failed.')
    } finally {
      setActionPending(null)
    }
  }

  const handleAvatarModalContinue = async () => {
    if (!pendingLiveRunDraft || !avatarModalRun || !currentRoomId) {
      setAvatarModalError('Room id is missing for this run.')
      return
    }

    setAvatarModalError('')
    setActionPending('now')

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

        const storagePath = buildAvatarStoragePath(currentRoomId, displayName)
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
          currentRoomId,
          Array.from(avatarUrlsByName.entries()).map(([displayName, avatarUrl]) => ({
            room_id: currentRoomId,
            display_name: displayName,
            avatar_url: avatarUrl,
          }))
        )
      }

      // Special handling for auto mode: we don't attachRun (global post)
      if (avatarModalRun.status === 'auto' || (avatarModalRun as any).isAuto) {
         // This path isn't strictly used currently but good for future proofing
         upsertRun(avatarModalRun)
      } else {
        upsertRun(avatarModalRun)
        appendLog(`Run queued for ${avatarModalRun.room_name}.`)
        attachRun(avatarModalRun)
      }
      
      closeAvatarModal()
    } catch (error) {
      const nextError =
        error instanceof Error ? error.message : 'Failed to save seeded avatars.'
      setErrorMessage(nextError)
      setAvatarModalError(nextError)
    } finally {
      setActionPending(null)
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
      setCurrentRoomId('')
      setAvatarModalRun(null)
      const createResult = await createRunRecord(mode, draft)

      if (!createResult.run) {
        setErrorMessage(createResult.error || 'Failed to create run.')
        return
      }

      setActionPending('now')

      try {
        const startResult = await startRunRecord(createResult.run.id)

        if (!startResult.run || !startResult.run.room_id) {
          const nextError = startResult.error || 'Room id is missing for this run.'
          setErrorMessage(nextError)
          return
        }

        setPendingLiveRunDraft(draft)
        setAvatarModalRun(startResult.run)
        setCurrentRoomId(startResult.run.room_id)
        setAvatarDrafts(createAvatarDrafts(draft.displayNames))
        setIsAvatarModalOpen(true)
      } finally {
        setActionPending(null)
      }

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
    <main className={styles.adminPage}>
      <div className={styles.adminShell}>
        {/* Admin Header */}
        <header className={styles.adminHeader}>
          <h1 className={styles.adminTitle}>Admin Panel</h1>
          {isAuthorized && (
            <button
              type="button"
              onClick={handleLogout}
              className={`${styles.adminButton} ${styles.adminButtonSecondary}`}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              Logout
            </button>
          )}
        </header>

        {!secretConfigured && (
          <div className={styles.adminNotice}>
            Add <code style={{ color: 'inherit' }}>ADMIN_BROADCAST_SECRET</code> to your
            environment to enable this page.
          </div>
        )}

        {secretConfigured && !isAuthorized && (
          <form onSubmit={handleUnlock} className={styles.adminCard}>
            <div className={styles.adminField}>
              <label className={styles.adminLabel}>Admin Secret Key</label>
              <input
                type="password"
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                placeholder="Enter admin secret"
                autoComplete="current-password"
                className={styles.adminInput}
              />
            </div>

            {errorMessage && <div className={styles.adminNotice}>{errorMessage}</div>}

            <button type="submit" disabled={authPending} className={styles.adminButton}>
              {authPending ? 'Unlocking...' : 'Unlock Panel'}
            </button>
          </form>
        )}

        {secretConfigured && isAuthorized && (
          <>
            {errorMessage && <div className={styles.adminNotice}>{errorMessage}</div>}

            {/* Room Setup */}
            <section className={styles.adminCard}>
              <h2 className={styles.adminSectionTitle}>Room Setup</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <div className={styles.adminField}>
                  <label className={styles.adminLabel}>Feed Position</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={feedPosition}
                    onChange={(event) => setFeedPosition(event.target.value)}
                    className={styles.adminInput}
                  />
                </div>
                <div className={styles.adminField}>
                  <label className={styles.adminLabel}>Room Name</label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    placeholder="e.g. Placement Talk"
                    className={styles.adminInput}
                  />
                </div>
              </div>
            </section>

            {/* Messages */}
            <section className={styles.adminCard}>
              <h2 className={styles.adminSectionTitle}>Messages</h2>
              <div className={styles.adminField}>
                <label className={styles.adminLabel}>
                  Script (Format: Name - College - Message - HH:MM:SS)
                </label>
                <textarea
                  value={messagesInput}
                  onChange={(event) => setMessagesInput(event.target.value)}
                  placeholder="Rahul - IIT Bombay - hello - 00:00:10"
                  className={`${styles.adminInput} ${styles.adminTextarea}`}
                />
                <div className={styles.adminStatus}>Unique names: {scriptDisplayNames.length}</div>
              </div>
            </section>

            {/* Launch Seeding */}
            <section className={styles.adminCard}>
              <h2 className={styles.adminSectionTitle}>Launch Seeding</h2>
              <div className={styles.adminField}>
                <label className={styles.adminLabel}>Schedule Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                  className={styles.adminInput}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    type="button"
                    disabled={!canCreateRun}
                    onClick={() => void handleCreateRun('now')}
                    className={styles.adminButton}
                    style={{ flex: 2 }}
                  >
                    {actionPending === 'now' ? 'Starting...' : 'Start Seeding'}
                  </button>

                  <button
                    type="button"
                    disabled={!canCreateRun}
                    onClick={() => void handleCreateRun('schedule')}
                    className={`${styles.adminButton} ${styles.adminButtonSecondary}`}
                    style={{ flex: 1 }}
                  >
                    {actionPending === 'schedule' ? 'Scheduling...' : 'Schedule'}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!canCreateRun}
                  onClick={() => void handleAutoStart()}
                  className={`${styles.adminButton} ${styles.adminButtonSecondary}`}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: 'white',
                    border: 'none',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                  }}
                >
                  {actionPending === 'now' ? 'Enabling...' : 'Auto Start Per User'}
                </button>
              </div>
            </section>
          </>
        )}
      </div>

      {/* Avatar Modal - PRESERVED EXACTLY AS IS */}
      {isAvatarModalOpen && pendingLiveRunDraft ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.cardEyebrow}>AVATAR ASSIGNMENT</div>
                <h2 className={styles.modalTitle}>UPLOAD AVATARS BEFORE GOING LIVE</h2>
                <p className={styles.modalCopy}>
                  Upload is optional for each name. Unassigned names will be skipped.
                </p>
              </div>
              <div className={styles.modalBadge}>PORTAL READY</div>
            </div>

            {avatarModalError ? <div className={styles.notice}>{avatarModalError}</div> : null}

            <div className={styles.avatarList}>
              {pendingLiveRunDraft.displayNames.map((displayName) => {
                const avatarDraft = avatarDrafts[displayName]
                const previewSource = avatarDraft?.previewUrl || avatarDraft?.avatarUrl || ''

                return (
                  <div key={displayName} className={styles.avatarRow}>
                    <div className={styles.avatarIdentity}>
                      <div className={styles.avatarName}>{displayName}</div>
                      <div className={styles.avatarMeta}>Seeded identity slot</div>
                    </div>

                    <label
                      className={`${styles.buttonBase} ${styles.secondaryButton} ${styles.uploadButton}`}
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
                    <input
                      type="text"
                      placeholder="or paste image URL"
                      value={avatarDraft?.avatarUrl || ''}
                      onChange={(e) => handleAvatarUrlChange(displayName, e.target.value)}
                      disabled={actionPending === 'now'}
                      className={`${styles.fieldInput} ${styles.monoField}`}
                      style={{ flex: 1, minWidth: '120px', marginLeft: '12px' }}
                    />

                    <div className={styles.avatarPreview}>
                      {previewSource ? (
                        <Image
                          src={previewSource}
                          alt={`${displayName} avatar preview`}
                          width={54}
                          height={54}
                          unoptimized
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div className={styles.avatarFallback}>No image</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={closeAvatarModal}
                disabled={actionPending === 'now' || !!avatarModalRun}
                className={`${styles.buttonBase} ${styles.secondaryButton}`}
              >
                Back
              </button>

              <button
                type="button"
                onClick={() => void handleAvatarModalContinue()}
                disabled={actionPending === 'now'}
                className={`${styles.buttonBase} ${styles.primaryButton}`}
              >
                <span className={styles.buttonTitle}>
                  {actionPending === 'now' ? 'SAVING...' : 'SEAL AVATARS'}
                </span>
                <span className={styles.buttonSubtitle}>GO LIVE</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
