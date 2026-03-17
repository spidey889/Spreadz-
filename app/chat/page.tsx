'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  trackRoomEnter,
  trackRoomLeave,
  trackMessageSent,
  trackTypedNotSent,
  flushToSupabase,
  saveInterests,
  getInterests,
} from '@/lib/friday'

interface Room {
  id: string
  headline: string
  created_at: string
}

interface Message {
  id: string
  username: string
  initials: string
  university: string
  text: string
  timestamp: string
  created_at?: string
  room_id?: string | null
  user_uuid?: string | null
  reveal_delay?: number
}

interface FriendRequest {
  id: string
  requester_uuid: string
  sender_name: string
  created_at?: string
}

type NotificationPayload = {
  title: string
  body: string
  url: string
  tag: string
}

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  const outputArray = new Uint8Array(raw.length)

  for (let i = 0; i < raw.length; ++i) {
    outputArray[i] = raw.charCodeAt(i)
  }

  return outputArray
}

const getUserColor = (username: string) => {
  const colors = ['#5865F2', '#ED4245', '#FEE75C', '#57F287', '#EB459E', '#FF6B35', '#00B0F4']
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const getInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const formatTime = (isoString?: string) => {
  if (!isoString) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const INTEREST_OPTIONS = ['Tech & AI', 'Sports', 'Politics', 'Entertainment', 'Business', 'Science', 'Gaming', 'Campus Life']
const USER_UUID_STORAGE_KEY = 'spreadz_user_uuid'
const USERNAME_STORAGE_KEY = 'spreadz_username'
const COLLEGE_STORAGE_KEY = 'spreadz_college'
const FRIENDS_STORAGE_KEY = 'spreadz_friends'
const FRIEND_REQUEST_TTL_MS = 10 * 1000
const PUSH_PROMPT_MESSAGE_THRESHOLD = 2
const PUSH_PROMPT_STATUS_STORAGE_KEY = 'spreadz_push_prompt_status'
const PUSH_SENT_COUNT_STORAGE_KEY = 'spreadz_push_sent_count'
const PUSH_SUBSCRIPTION_STORAGE_KEY = 'spreadz_push_subscription'

export default function GlobalChat() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomMessages, setRoomMessages] = useState<Record<string, Message[]>>({})
  const [inputTexts, setInputTexts] = useState<Record<string, string>>({})
  const [currentRoomIndex, setCurrentRoomIndex] = useState(0)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [username, setUsername] = useState('')
  const [university, setUniversity] = useState('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [tempProfileName, setTempProfileName] = useState('')
  const [tempProfileCollege, setTempProfileCollege] = useState('')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [interestDismissed, setInterestDismissed] = useState(false)
  const [visibleMessageIds, setVisibleMessageIds] = useState<Set<string>>(new Set())
  const [reportSheetMessage, setReportSheetMessage] = useState<Message | null>(null)
  const [reportStatus, setReportStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [sheetClosing, setSheetClosing] = useState(false)
  const [friendsSheetOpen, setFriendsSheetOpen] = useState(false)
  const [notificationSheetOpen, setNotificationSheetOpen] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState<'idle' | 'enabling' | 'enabled' | 'unsupported' | 'error'>('idle')
  const [notificationErrorMessage, setNotificationErrorMessage] = useState('')
  const [friends, setFriends] = useState<{ id: string; username: string }[]>([])
  const [activeFriendRequest, setActiveFriendRequest] = useState<FriendRequest | null>(null)
  const [friendRequestQueue, setFriendRequestQueue] = useState<FriendRequest[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const longPressTimerRef = useRef<number | null>(null)
  const userIdRef = useRef<string>('')

  const messageEndRefs = useRef<(HTMLDivElement | null)[]>([])
  const channelRef = useRef<any>(null)
  const friendRequestChannelRef = useRef<any>(null)
  const friendRequestsLoadedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchedRoomsRef = useRef<Set<string>>(new Set())
  const pendingSendRef = useRef<{ roomId: string } | null>(null)
  const prevRoomIndexRef = useRef<number>(0)
  const inputHadContentRef = useRef<Record<string, boolean>>({})
  const pendingNotificationPayloadRef = useRef<NotificationPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    const initAuth = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        console.error('[Auth] getSession failed:', sessionError)
      }
      let user = sessionData?.session?.user ?? null

      if (!user) {
        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously()
        if (signInError) {
          console.error('[Auth] anonymous sign-in failed:', signInError)
          return
        }
        user = signInData?.user ?? null
      }

      if (!user || cancelled) return
      userIdRef.current = user.id
      localStorage.setItem(USER_UUID_STORAGE_KEY, user.id)
      setAuthReady(true)
    }

    initAuth()
    return () => {
      cancelled = true
    }
  }, [])

  const buildMessageFromRow = useCallback((m: any, fallbackUserId?: string): Message => {
    const resolvedName = m.display_name || 'Anonymous'
    const resolvedCollege = m.college || ''
    return {
      id: m.id,
      username: resolvedName,
      initials: getInitials(resolvedName),
      university: resolvedCollege,
      text: m.content,
      timestamp: formatTime(m.created_at),
      created_at: m.created_at,
      room_id: m.room_id,
      user_uuid: m.user_uuid ?? fallbackUserId ?? null,
      reveal_delay: m.reveal_delay || 0,
    }
  }, [])

  const scheduleReveal = useCallback((messageId: string, delay: number) => {
    setTimeout(() => {
      setVisibleMessageIds(prev => {
        const next = new Set(prev)
        next.add(messageId)
        return next
      })
    }, delay)
  }, [])

  const getCurrentUserId = useCallback(() => {
    if (userIdRef.current) return userIdRef.current
    const storedUserId = localStorage.getItem(USER_UUID_STORAGE_KEY)
    if (storedUserId) {
      userIdRef.current = storedUserId
      return storedUserId
    }
    return ''
  }, [])

  const buildPrototypeNotificationPayload = useCallback(
    (text: string): NotificationPayload => {
      const preview = text.length > 72 ? `${text.slice(0, 69)}...` : text
      return {
        title: 'SpreadZ prototype',
        body: `You sent: ${preview}`,
        url: '/chat',
        tag: 'spreadz-prototype',
      }
    },
    []
  )

  const waitForPushRegistration = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return null

    const waitForReadyRegistration = async () => {
      try {
        const readyRegistration = await Promise.race<ServiceWorkerRegistration | null>([
          navigator.serviceWorker.ready,
          new Promise<null>(resolve => setTimeout(() => resolve(null), 10000)),
        ])

        if (readyRegistration?.active) return readyRegistration
      } catch (error) {
        console.error('[Push] Waiting for service worker failed', error)
      }

      return null
    }

    const readyRegistration = await waitForReadyRegistration()
    if (readyRegistration) return readyRegistration

    try {
      const existingRegistration =
        (await navigator.serviceWorker.getRegistration('/')) ||
        (await navigator.serviceWorker.getRegistration())

      if (existingRegistration?.active) return existingRegistration

      await navigator.serviceWorker.register('/sw.js')
      return await waitForReadyRegistration()
    } catch (error) {
      console.error('[Push] Service worker registration failed', error)
      return null
    }
  }, [])

  const getStoredPushSubscription = useCallback(async (): Promise<PushSubscriptionJSON | null> => {
    if (typeof window === 'undefined') return null

    const registration = await waitForPushRegistration()
    if (registration) {
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const subscriptionJson = subscription.toJSON()
        localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify(subscriptionJson))
        return subscriptionJson
      }
    }

    const stored = localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)
    if (!stored) return null

    try {
      return JSON.parse(stored) as PushSubscriptionJSON
    } catch {
      localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY)
      return null
    }
  }, [waitForPushRegistration])

  const sendPrototypeNotification = useCallback(
    async (payload: NotificationPayload, subscriptionOverride?: PushSubscriptionJSON | null) => {
      const subscription = subscriptionOverride || await getStoredPushSubscription()
      if (!subscription?.endpoint) return

      try {
        const response = await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription,
            ...payload,
          }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => null)
          console.error('[Push] Prototype send failed', { status: response.status, data })
          if (response.status === 410) {
            localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY)
            localStorage.removeItem(PUSH_PROMPT_STATUS_STORAGE_KEY)
            setNotificationStatus('idle')
            setNotificationErrorMessage('')
          }
        }
      } catch (error) {
        console.error('[Push] Prototype send failed', error)
      }
    },
    [getStoredPushSubscription]
  )

  const enablePushNotifications = useCallback(async (): Promise<PushSubscriptionJSON | null> => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setNotificationStatus('unsupported')
      setNotificationErrorMessage('This browser does not support web push.')
      return null
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      console.error('[Push] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY')
      setNotificationStatus('error')
      setNotificationErrorMessage('The notification public key is missing in this deployment.')
      return null
    }

    if (Notification.permission === 'denied') {
      localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'denied')
      setNotificationStatus('error')
      setNotificationErrorMessage('Notifications are blocked for this app or site.')
      return null
    }

    setNotificationStatus('enabling')
    setNotificationErrorMessage('')

    try {
      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission()

      if (permission !== 'granted') {
        if (permission === 'denied') {
          localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'denied')
          setNotificationStatus('error')
          setNotificationErrorMessage('Notifications were blocked for this app or site.')
        } else {
          setNotificationStatus('idle')
          setNotificationErrorMessage('')
        }
        return null
      }

      const registration = await waitForPushRegistration()
      if (!registration) {
        console.error('[Push] No active service worker registration found')
        setNotificationStatus('error')
        setNotificationErrorMessage('The app could not get an active service worker.')
        return null
      }

      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      }

      const subscriptionJson = subscription.toJSON()
      localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify(subscriptionJson))
      localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'enabled')
      setNotificationStatus('enabled')
      setNotificationErrorMessage('')
      return subscriptionJson
    } catch (error) {
      console.error('[Push] Enable notifications failed', error)
      setNotificationStatus('error')
      setNotificationErrorMessage(error instanceof Error ? error.message : 'Notification setup failed.')
      return null
    }
  }, [waitForPushRegistration])

  const handleEnableNotifications = useCallback(async () => {
    const subscription = await enablePushNotifications()
    if (!subscription) return

    const payload = pendingNotificationPayloadRef.current
    pendingNotificationPayloadRef.current = null
    setNotificationSheetOpen(false)

    if (payload) {
      await sendPrototypeNotification(payload, subscription)
    }
  }, [enablePushNotifications, sendPrototypeNotification])

  const closeNotificationSheet = useCallback(() => {
    pendingNotificationPayloadRef.current = null
    setNotificationSheetOpen(false)
  }, [])

  const handlePrototypeNotificationAfterSend = useCallback(
    async (text: string) => {
      if (
        typeof window === 'undefined' ||
        !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        !('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        return
      }

      const payload = buildPrototypeNotificationPayload(text)

      if (Notification.permission === 'granted') {
        localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'enabled')
        setNotificationStatus('enabled')
        await sendPrototypeNotification(payload)
        return
      }

      if (Notification.permission === 'denied') {
        localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'denied')
        setNotificationStatus('error')
        return
      }

      const promptStatus = localStorage.getItem(PUSH_PROMPT_STATUS_STORAGE_KEY)
      if (promptStatus === 'enabled' || promptStatus === 'denied') return

      const sentCount = Number(localStorage.getItem(PUSH_SENT_COUNT_STORAGE_KEY) || '0') + 1
      localStorage.setItem(PUSH_SENT_COUNT_STORAGE_KEY, String(sentCount))

      if (sentCount >= PUSH_PROMPT_MESSAGE_THRESHOLD) {
        pendingNotificationPayloadRef.current = payload
        setNotificationSheetOpen(true)
      }
    },
    [buildPrototypeNotificationPayload, sendPrototypeNotification]
  )

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return

    const supportsPush =
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

    if (!supportsPush) {
      setNotificationStatus('unsupported')
      setNotificationErrorMessage('This browser does not support web push.')
      return
    }

    if (Notification.permission === 'granted') {
      localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'enabled')
      setNotificationStatus('enabled')
      setNotificationErrorMessage('')
      return
    }

    if (Notification.permission === 'denied') {
      localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'denied')
      setNotificationStatus('error')
      setNotificationErrorMessage('Notifications are blocked for this app or site.')
    }
  }, [isMounted])

  // Load user profile
  useEffect(() => {
    if (!authReady) return
    const storedName = localStorage.getItem(USERNAME_STORAGE_KEY)
    const storedCollege = localStorage.getItem(COLLEGE_STORAGE_KEY)
    const storedUserId = localStorage.getItem(USER_UUID_STORAGE_KEY)
    if (!storedUserId) return
    userIdRef.current = storedUserId
    const storedFriends = localStorage.getItem(FRIENDS_STORAGE_KEY)
    let localFriends: { id: string; username: string }[] = []
    if (storedFriends) {
      try {
        const parsed = JSON.parse(storedFriends) as { id: string; username: string }[]
        if (Array.isArray(parsed)) localFriends = parsed
      } catch {
        // Ignore corrupted local storage
      }
    }
    if (localFriends.length > 0) setFriends(localFriends)
    if (storedName) setUsername(storedName)
    if (storedCollege) setUniversity(storedCollege)
    if (storedUserId) {
      const userPayload: { uuid: string; created_at: string; display_name?: string; college?: string } = {
        uuid: storedUserId,
        created_at: new Date().toISOString(),
      }
      if (storedName) userPayload.display_name = storedName
      if (storedCollege) userPayload.college = storedCollege
      supabase.from('users').upsert(
        userPayload,
        { onConflict: 'uuid' }
      ).then(({ error }) => {
        if (error) console.error('[Users] upsert failed:', error)
      })
      supabase
        .from('friends')
        .select('id, requester_uuid, addressee_uuid, status')
        .or(`requester_uuid.eq.${storedUserId},addressee_uuid.eq.${storedUserId}`)
        .eq('status', 'accepted')
        .then(async ({ data, error }) => {
          if (error) {
            console.error('[Friends] fetch failed:', error)
            return
          }
          const friendUuids = Array.from(new Set((data || [])
            .map(row => row.requester_uuid === storedUserId ? row.addressee_uuid : row.requester_uuid)
            .filter(Boolean)))
          if (friendUuids.length === 0) return
          const { data: profiles, error: profileError } = await supabase
            .from('users')
            .select('uuid, display_name')
            .in('uuid', friendUuids)
          if (profileError) {
            console.error('[Friends] profiles fetch failed:', profileError)
          }
          const missingUuids = friendUuids.filter(friendUuid => {
            const profile = profiles?.find(p => p.uuid === friendUuid)
            return !profile?.display_name
          })
          const fallbackNames = new Map<string, string>()
          if (missingUuids.length > 0) {
            const { data: messageNames, error: messageError } = await supabase
              .from('messages')
              .select('user_uuid, display_name, created_at')
              .in('user_uuid', missingUuids)
              .order('created_at', { ascending: false })
            if (messageError) {
              console.error('[Friends] message names fetch failed:', messageError)
            } else {
              messageNames?.forEach(row => {
                if (row.user_uuid && !fallbackNames.has(row.user_uuid) && row.display_name) {
                  fallbackNames.set(row.user_uuid, row.display_name)
                }
              })
            }
          }
          const remoteFriends = friendUuids.map(friendUuid => {
            const profile = profiles?.find(p => p.uuid === friendUuid)
            return {
              id: friendUuid,
              username: profile?.display_name || fallbackNames.get(friendUuid) || 'Anonymous',
            }
          })
          const mergedMap = new Map<string, { id: string; username: string }>()
          localFriends.forEach(friend => mergedMap.set(friend.id, friend))
          remoteFriends.forEach(friend => {
            if (!mergedMap.has(friend.id)) {
              mergedMap.set(friend.id, friend)
            } else if (friend.username && friend.username !== 'Anonymous') {
              mergedMap.set(friend.id, friend)
            }
          })
          const merged = Array.from(mergedMap.values())
          setFriends(merged)
          localStorage.setItem(FRIENDS_STORAGE_KEY, JSON.stringify(merged))
        })
    }
  }, [authReady])

  // Fetch rooms on mount
  useEffect(() => {
    if (!authReady) return
    const fetchRooms = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: true })

      if (data && data.length > 0) {
        // Set rooms in default order immediately
        setRooms(data)
        trackRoomEnter(data[0]?.id || '')


      }
    }
    fetchRooms()
  }, [authReady])

  // FRIDAY: flush to Supabase on beforeunload + every 60s
  useEffect(() => {
    if (!authReady) return
    const handleUnload = () => { flushToSupabase() }
    window.addEventListener('beforeunload', handleUnload)
    const intervalId = setInterval(() => { flushToSupabase() }, 60000)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      clearInterval(intervalId)
    }
  }, [authReady])

  // FRIDAY: load saved interests on mount
  useEffect(() => {
    const saved = getInterests()
    if (saved.length > 0) setSelectedInterests(saved)
  }, [])

  const hasScrolledToTopRef = useRef(false)
  // Always force scroll to room 1 when rooms open
  useEffect(() => {
    if (rooms.length > 0 && !hasScrolledToTopRef.current) {
      hasScrolledToTopRef.current = true
      setTimeout(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: 'instant' })
      }, 500)
    }
  }, [rooms])

  // Helper: trigger reveals for a room
  const triggerRevealsForRoom = useCallback((roomId: string) => {
    const msgs = roomMessages[roomId] || []
    msgs.forEach((m, idx) => {
      const delay = idx < 2 ? 0 : (m.reveal_delay || 0)
      scheduleReveal(m.id, delay)
    })
  }, [roomMessages, scheduleReveal])

  // Fetch messages for a specific room
  const fetchMessagesForRoom = useCallback(async (room: Room) => {
    if (fetchedRoomsRef.current.has(room.id)) return
    fetchedRoomsRef.current.add(room.id)

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true })

    if (data) {
      const msgs = data.map((m: any) => buildMessageFromRow(m))
      setRoomMessages(prev => ({ ...prev, [room.id]: msgs }))

      // trigger reveals immediately when messages are first fetched
      msgs.forEach((m, idx) => {
        const delay = idx < 2 ? 0 : (m.reveal_delay || 0)
        scheduleReveal(m.id, delay)
      })
    }
  }, [buildMessageFromRow, scheduleReveal])

  // Subscribe to realtime for a room
  const subscribeToRoom = useCallback((room: Room) => {
    // Unsubscribe from previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase
      .channel(`room-${room.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const m = payload.new
          const newMessage = buildMessageFromRow(m)

          // Trigger reveal for realtime message
          scheduleReveal(newMessage.id, newMessage.reveal_delay || 0)
          setRoomMessages(prev => {
            const existing = prev[room.id] || []
            if (existing.some(msg => msg.id === m.id)) return prev
            return { ...prev, [room.id]: [...existing, newMessage] }
          })
    }
  )
      .subscribe()

    channelRef.current = channel
  }, [buildMessageFromRow, scheduleReveal])


  // When rooms load, fetch + subscribe for room index 0
  useEffect(() => {
    if (rooms.length === 0) return
    fetchMessagesForRoom(rooms[0])
    subscribeToRoom(rooms[0])

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [rooms, fetchMessagesForRoom, subscribeToRoom])

  // Detect room changes via IntersectionObserver + FRIDAY tracking
  useEffect(() => {
    if (rooms.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-room-index'))
            if (!isNaN(idx) && idx !== currentRoomIndex) {
              // FRIDAY: synchronous memory-only tracking
              const prevRoom = rooms[prevRoomIndexRef.current]
              if (prevRoom) trackRoomLeave(prevRoom.id)
              trackRoomEnter(rooms[idx].id)
              prevRoomIndexRef.current = idx

              setCurrentRoomIndex(idx)
              fetchMessagesForRoom(rooms[idx])
              subscribeToRoom(rooms[idx])

              // Reset visibleMessageIds to empty Set when switching rooms
              setVisibleMessageIds(new Set())
              // Trigger reveals for the newly active room (replaces IntersectionObserver logic with re-trigger)
              setTimeout(() => {
                triggerRevealsForRoom(rooms[idx].id)
              }, 50)
            }
          }
        }
      },
      {
        root: containerRef.current,
        threshold: 0.6,
      }
    )

    return () => observer.disconnect()
  }, [rooms, currentRoomIndex, fetchMessagesForRoom, subscribeToRoom, interestDismissed, triggerRevealsForRoom])

  useEffect(() => {
    const endEl = messageEndRefs.current[currentRoomIndex]
    const scrollEl = endEl?.closest('.room-messages') as HTMLDivElement | null
    if (scrollEl) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' })
    }
  }, [roomMessages, currentRoomIndex, visibleMessageIds])

  const pushFriendRequest = useCallback((request: FriendRequest) => {
    if (request.created_at) {
      const ageMs = Date.now() - new Date(request.created_at).getTime()
      if (ageMs > FRIEND_REQUEST_TTL_MS) return
    }
    setActiveFriendRequest(prev => {
      if (prev && prev.id === request.id) return prev
      if (!prev) return request
      setFriendRequestQueue(queuePrev => {
        if (queuePrev.some(item => item.id === request.id)) return queuePrev
        return [...queuePrev, request]
      })
      return prev
    })
  }, [])

  const advanceFriendRequest = () => {
    setFriendRequestQueue(prev => {
      if (prev.length === 0) {
        setActiveFriendRequest(null)
        return prev
      }
      const [next, ...rest] = prev
      setActiveFriendRequest(next)
      return rest
    })
  }

  useEffect(() => {
    if (!authReady) return
    const userId = getCurrentUserId()
    if (!userId) return

    const pendingCutoff = new Date(Date.now() - FRIEND_REQUEST_TTL_MS).toISOString()

    if (!friendRequestsLoadedRef.current) {
      friendRequestsLoadedRef.current = true
      supabase
        .from('friends')
        .select('id, requester_uuid, addressee_uuid, sender_name, status, created_at')
        .eq('addressee_uuid', userId)
        .is('status', null)
        .gte('created_at', pendingCutoff)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (error) {
            console.error('[FriendRequests] fetch failed:', error)
            return
          }
          if (data && data.length > 0) {
            data.forEach((req) => {
              pushFriendRequest({
                id: req.id,
                requester_uuid: req.requester_uuid,
                sender_name: req.sender_name || 'Anonymous',
                created_at: req.created_at ?? undefined,
              })
            })
          }
        })
    }

    if (friendRequestChannelRef.current) {
      supabase.removeChannel(friendRequestChannelRef.current)
      friendRequestChannelRef.current = null
    }

    const channel = supabase
      .channel(`friend-requests-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friends', filter: `addressee_uuid=eq.${userId}` },
        (payload) => {
          const req = payload.new
          if (req.status !== null) return
          pushFriendRequest({
            id: req.id,
            requester_uuid: req.requester_uuid,
            sender_name: req.sender_name || 'Anonymous',
            created_at: req.created_at,
          })
        }
      )
      .subscribe()

    friendRequestChannelRef.current = channel

    return () => {
      if (friendRequestChannelRef.current) {
        supabase.removeChannel(friendRequestChannelRef.current)
        friendRequestChannelRef.current = null
      }
    }
  }, [authReady, getCurrentUserId, pushFriendRequest])


  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const startLongPress = (msg: Message) => {
    clearLongPress()
    longPressTimerRef.current = window.setTimeout(() => {
      setSheetClosing(false)
      setReportSheetMessage(msg)
      setReportStatus('idle')
    }, 450)
  }

  const closeSheet = () => {
    if (sheetClosing) return
    setSheetClosing(true)
    window.setTimeout(() => {
      setReportSheetMessage(null)
      setReportStatus('idle')
      setSheetClosing(false)
    }, 280)
  }

  const handleReport = async () => {
    if (!reportSheetMessage) return
    setReportStatus('submitting')
    const roomId = reportSheetMessage.room_id ?? rooms[currentRoomIndex]?.id ?? null
    const reportedId = reportSheetMessage.user_uuid || reportSheetMessage.username
    const { error } = await supabase.from('reports').insert([
      {
        reporter_id: getCurrentUserId(),
        reported_id: reportedId,
        reported_message: reportSheetMessage.text,
        room_id: roomId,
        created_at: new Date().toISOString(),
      }
    ])

    if (error) {
      console.error('[Report] insert failed:', error)
      setReportStatus('error')
      setTimeout(() => {
        setReportStatus('idle')
      }, 1400)
      return
    }

    setReportStatus('done')
    closeSheet()
  }

  const handleAddFriend = async () => {
    if (!reportSheetMessage) return
    const receiverUuid = reportSheetMessage.user_uuid
    if (!receiverUuid) {
      closeSheet()
      return
    }
    const senderUuid = getCurrentUserId()
    if (!senderUuid || receiverUuid === senderUuid) {
      closeSheet()
      return
    }
    if (friends.some(friend => friend.id === receiverUuid)) {
      closeSheet()
      return
    }
    const senderName = username || localStorage.getItem(USERNAME_STORAGE_KEY) || 'Anonymous'
    const { error } = await supabase.from('friends').insert({
      requester_uuid: senderUuid,
      addressee_uuid: receiverUuid,
      sender_name: senderName,
      status: null,
    })

    if (error) {
      console.error('[FriendRequests] insert failed:', error)
      closeSheet()
      return
    }

    closeSheet()
  }

  const handleAcceptFriendRequest = async () => {
    if (!activeFriendRequest) return
    const userId = getCurrentUserId()
    const friendUuid = activeFriendRequest.requester_uuid
    const friendName = activeFriendRequest.sender_name || 'Anonymous'
    if (!userId || !friendUuid || friendUuid === userId) {
      advanceFriendRequest()
      return
    }

    if (activeFriendRequest.created_at) {
      const ageMs = Date.now() - new Date(activeFriendRequest.created_at).getTime()
      if (ageMs > FRIEND_REQUEST_TTL_MS) {
        advanceFriendRequest()
        return
      }
    }

    const { error: requestError } = await supabase
      .from('friends')
      .update({ status: 'accepted' })
      .eq('id', activeFriendRequest.id)

    if (requestError) console.error('[FriendRequests] status update failed:', requestError)

    setFriends(prev => {
      if (prev.some(friend => friend.id === friendUuid)) return prev
      const next = [...prev, { id: friendUuid, username: friendName }]
      localStorage.setItem(FRIENDS_STORAGE_KEY, JSON.stringify(next))
      return next
    })

    advanceFriendRequest()
  }

  const handleDeclineFriendRequest = async () => {
    if (!activeFriendRequest) return
    const { error } = await supabase
      .from('friends')
      .update({ status: 'declined' })
      .eq('id', activeFriendRequest.id)

    if (error) console.error('[FriendRequests] status update failed:', error)
    advanceFriendRequest()
  }

  const handleSend = useCallback(async (roomId: string, overrideName?: string, overrideCollege?: string) => {
    const text = (inputTexts[roomId] || '').trim()
    if (!text) return

    const userId = getCurrentUserId()
    const activeName = overrideName || username || localStorage.getItem(USERNAME_STORAGE_KEY)
    if (!activeName) {
      pendingSendRef.current = { roomId }
      setTempProfileName('')
      setTempProfileCollege('')
      setShowProfileModal(true)
      return
    }

    const activeCollege = overrideCollege !== undefined ? overrideCollege : (university || localStorage.getItem(COLLEGE_STORAGE_KEY) || '')
    const tempId = `temp-${Date.now()}`

    const optimisticMsg: Message = {
      id: tempId,
      username: activeName,
      initials: getInitials(activeName),
      university: activeCollege,
      text,
      timestamp: formatTime(),
      room_id: roomId,
      user_uuid: userId,
      reveal_delay: 0,
    }

    // Reveal immediately for user's own message
    scheduleReveal(tempId, 0)

    setRoomMessages(prev => ({
      ...prev,
      [roomId]: [...(prev[roomId] || []), optimisticMsg]
    }))
    setInputTexts(prev => ({ ...prev, [roomId]: '' }))
    inputHadContentRef.current[roomId] = false

    // FRIDAY: synchronous memory-only tracking
    trackMessageSent(roomId)

    const { data, error } = await supabase
      .from('messages')
      .insert({ content: text, display_name: activeName, college: activeCollege, room_id: roomId, user_uuid: userId })
      .select()

    if (error) {
      console.error('[Messages] send failed:', error)
      setRoomMessages(prev => ({
        ...prev,
        [roomId]: (prev[roomId] || []).filter(m => m.id !== tempId)
      }))
      return
    }

    if (data && data[0]) {
      const m = data[0]
      const serverMessage = buildMessageFromRow(m, userId)
      setRoomMessages(prev => ({
        ...prev,
        [roomId]: (prev[roomId] || []).map(msg => msg.id === tempId ? serverMessage : msg)
      }))

      // Ensure the server-returned success message is also revealed
      scheduleReveal(serverMessage.id, 0)

      void handlePrototypeNotificationAfterSend(text)
    }
  }, [buildMessageFromRow, getCurrentUserId, handlePrototypeNotificationAfterSend, inputTexts, scheduleReveal, university, username])

  const handleProfileSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    const name = tempProfileName.trim()
    const college = tempProfileCollege.trim()
    if (!name) return

    localStorage.setItem(USERNAME_STORAGE_KEY, name)
    localStorage.setItem(COLLEGE_STORAGE_KEY, college)
    setUsername(name)
    setUniversity(college)
    setShowProfileModal(false)
    setTempProfileName('')
    setTempProfileCollege('')
    const userId = getCurrentUserId()
    const { error } = await supabase.from('users').upsert(
      { uuid: userId, display_name: name, college: college || null },
      { onConflict: 'uuid' }
    )
    if (error) console.error('[Users] update failed:', error)

    if (pendingSendRef.current) {
      handleSend(pendingSendRef.current.roomId, name, college)
      pendingSendRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, roomId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      handleSend(roomId)
    }
  }

  if (!isMounted || !authReady) return null

  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content" />
      <div className="rooms-container" ref={containerRef}>
        {rooms.map((room, index) => {
          const messages = roomMessages[room.id] || []
          const inputText = inputTexts[room.id] || ''

          return (
            <div
              key={room.id}
              className="room-panel"
              data-room-index={index}
              style={{ background: 'var(--bg)' }}
            >
              {/* Header */}
              <div className={`header${isKeyboardOpen ? ' hidden' : ''}`}>
                <div className="logo">
                  <Image src="/spreadz-logo.png" alt="SpreadZ" className="logo-img" width={180} height={90} priority />
                </div>
                <button className="settings-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="5" x2="20" y2="5" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="19" x2="20" y2="19" />
                  </svg>
                </button>
              </div>

              {/* Headline card */}
              <div className={`ai-card-wrap${isKeyboardOpen ? ' hidden' : ''}`}>
                <div className="ai-card">
                  <div className="card-label">LIVE DISCUSSION</div>
                  <div className="ai-headline">{room.headline}</div>
                </div>
              </div>

              {/* Messages */}
              <div className="room-messages" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); return false }}>
                <div className="messages">
                {messages.map((msg, msgIndex) => {
                    const isVisible = visibleMessageIds.has(msg.id)
                    if (!isVisible) return null

                    // To calculate grouping correctly we should only look at visible messages
                    const visibleMsgs = messages.filter(m => visibleMessageIds.has(m.id))
                    const visibleIndex = visibleMsgs.findIndex(m => m.id === msg.id)
                    const isFirstInGroup = visibleIndex === 0 || visibleMsgs[visibleIndex - 1].username !== msg.username

                    return (
                      <div key={msg.id} className="msg-reveal"
                        onTouchStart={() => startLongPress(msg)}
                        onTouchEnd={clearLongPress}
                        onTouchMove={clearLongPress}
                        onMouseDown={() => startLongPress(msg)}
                        onMouseUp={clearLongPress}
                        onMouseLeave={clearLongPress}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); return false }}
                      >
                        {isFirstInGroup && visibleIndex !== 0 && <div className="group-divider" />}
                        <div className={`msg ${isFirstInGroup ? 'group-start' : 'group-continuation'}`}>
                          {isFirstInGroup ? (
                            <>
                              <div className="avatar" style={{ backgroundColor: getUserColor(msg.username) }}>{msg.initials}</div>
                              <div className="msg-content">
                                <div className="msg-header">
                                  <span className="msg-username">{msg.username}</span>
                                  {msg.university && <span className="msg-university">{msg.university}</span>}
                                  <span className="msg-timestamp">{msg.timestamp}</span>
                                </div>
                                <div className="msg-text">{msg.text}</div>
                              </div>
                            </>
                          ) : (
                            <div className="msg-content continuation">
                              <div className="msg-text">{msg.text}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={(el) => { messageEndRefs.current[index] = el }} />
                </div>
              </div>

              {/* Input area */}
              <div className="input-area">
                <div className={`hint${isKeyboardOpen ? ' hidden' : ''}`}>
                  <span className="hint-badge">Swipe Up</span>
                  <span>for new people &amp; topics</span>
                </div>
                <div className="input-wrap">
                  <input
                    type="text"
                    placeholder="What's on your mind?"
                    value={inputText}
                    onChange={(e) => {
                      const val = e.target.value
                      setInputTexts(prev => ({ ...prev, [room.id]: val }))
                      if (val.trim()) inputHadContentRef.current[room.id] = true
                    }}
                    onKeyDown={(e) => handleKeyDown(e, room.id)}
                    onFocus={() => setIsKeyboardOpen(true)}
                    onBlur={() => {
                      setIsKeyboardOpen(false)
                      const currentText = (inputTexts[room.id] || '').trim()
                      if (inputHadContentRef.current[room.id] && currentText.length > 0) {
                        trackTypedNotSent(room.id)
                      }
                      inputHadContentRef.current[room.id] = false
                    }}
                  />
                  <button className="send-btn" aria-label="Send" onClick={(e) => { e.preventDefault(); e.stopPropagation(); const btn = e.currentTarget as HTMLButtonElement; btn.blur(); handleSend(room.id); }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showProfileModal && (
        <div className="profile-overlay">
          <form className="profile-sheet" onSubmit={handleProfileSubmit}>
            <div className="sheet-handle" />
            <div className="profile-title">Introduce yourself</div>
            <div className="profile-sub">Set a display name to join the chat.</div>
            <div className="profile-field">
              <label className="profile-label" htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                type="text"
                placeholder="Your name"
                value={tempProfileName}
                onChange={(e) => setTempProfileName(e.target.value)}
                autoFocus
                required
                className="profile-input"
              />
            </div>
            <div className="profile-field">
              <label className="profile-label" htmlFor="college-name">College (optional)</label>
              <input
                id="college-name"
                type="text"
                placeholder="e.g. MIT, Stanford..."
                value={tempProfileCollege}
                onChange={(e) => setTempProfileCollege(e.target.value)}
                className="profile-input"
              />
            </div>
            <button type="submit" className="profile-submit">Continue</button>
          </form>
        </div>
      )}

      {notificationSheetOpen && (
        <div className="sheet-overlay" onClick={closeNotificationSheet}>
          <div className="sheet notify-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="notify-title">Turn on notifications</div>
            <div className="notify-sub">
              After you enable this, every message you send will fire a prototype notification to this device.
            </div>
            <div className="notify-actions">
              <button
                type="button"
                className="notify-btn notify-btn-secondary"
                onClick={closeNotificationSheet}
              >
                Not now
              </button>
              <button
                type="button"
                className="notify-btn notify-btn-primary"
                onClick={() => void handleEnableNotifications()}
                disabled={notificationStatus === 'enabling'}
              >
                {notificationStatus === 'enabling' ? 'Enabling...' : 'Enable notifications'}
              </button>
            </div>
            {notificationStatus === 'error' && (
              <div className="notify-error">
                {notificationErrorMessage || 'Notifications are not ready here yet. Try again from the installed app or deployed build.'}
              </div>
            )}
          </div>
        </div>
      )}



      {menuOpen && (
        <div className="menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
            <button
              className="menu-item"
              onClick={() => {
                setMenuOpen(false)
                setFriendsSheetOpen(true)
              }}
            >
              <span className="menu-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
                  <path d="M8 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z" />
                  <path d="M8 14c-3.314 0-6 1.79-6 4v1" />
                  <path d="M16 13c-2.761 0-5 1.79-5 4v2" />
                </svg>
              </span>
              <span className="menu-label">My Friends</span>
            </button>
          </div>
        </div>
      )}

      {activeFriendRequest && (
        <div className="friend-request-popup" role="status" aria-live="polite">
          <div className="friend-request-text">
            <span className="friend-request-name">{activeFriendRequest.sender_name}</span> wants to be your friend
          </div>
          <div className="friend-request-actions">
            <button className="friend-request-btn accept" onClick={handleAcceptFriendRequest}>Accept</button>
            <button className="friend-request-btn decline" onClick={handleDeclineFriendRequest}>Decline</button>
          </div>
        </div>
      )}

      {reportSheetMessage && (
        <div className={`sheet-overlay${sheetClosing ? ' closing' : ''}`} onClick={closeSheet}>
          <div className={`sheet${sheetClosing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <button
              className="sheet-item sheet-item-friend"
              onClick={handleAddFriend}
            >
              <span className="sheet-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="6" x2="12" y2="18" />
                  <line x1="6" y1="12" x2="18" y2="12" />
                </svg>
              </span>
              <span>Add Friend</span>
            </button>
            <div className="sheet-divider" />
            <button
              className="sheet-item sheet-item-report"
              onClick={handleReport}
              disabled={reportStatus === 'submitting' || reportStatus === 'done'}
            >
              <span className="sheet-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="8" />
                  <line x1="7" y1="17" x2="17" y2="7" />
                </svg>
              </span>
              <span>Report</span>
            </button>
            {reportStatus === 'done' && <div className="sheet-confirm">Reported</div>}
            {reportStatus === 'error' && <div className="sheet-confirm error">Report failed</div>}
          </div>
        </div>
      )}

      {friendsSheetOpen && (
        <div className="friends-overlay" onClick={() => setFriendsSheetOpen(false)}>
          <div className="friends-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="friends-handle" />
            <div className="friends-header">
              <div className="friends-title">My Friends</div>
              <button className="friends-close" aria-label="Close" onClick={() => setFriendsSheetOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
            {friends.length === 0 ? (
              <div className="friends-empty">No friends yet {'\uD83D\uDC40'}</div>
            ) : (
              <div className="friends-list">
                {friends.map(friend => (
                  <div key={friend.id} className="friends-item">
                    <div className="friends-avatar" style={{ backgroundColor: getUserColor(friend.username) }}>
                      {getInitials(friend.username)}
                    </div>
                    <div className="friends-name">{friend.username}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
    </>
  )
}











































































