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
  sender_uuid: string
  sender_name: string
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

export default function GlobalChat() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomMessages, setRoomMessages] = useState<Record<string, Message[]>>({})
  const [inputTexts, setInputTexts] = useState<Record<string, string>>({})
  const [currentRoomIndex, setCurrentRoomIndex] = useState(0)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
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

  const buildMessageFromRow = useCallback((m: any, fallbackUserId?: string): Message => {
    const resolvedName = m.display_name || m.username || 'Anonymous'
    const resolvedCollege = m.college || m.university || ''
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

  // Load user profile
  useEffect(() => {
    setIsMounted(true)
    const storedName = localStorage.getItem(USERNAME_STORAGE_KEY)
    const storedCollege = localStorage.getItem(COLLEGE_STORAGE_KEY)
    let storedUserId = localStorage.getItem(USER_UUID_STORAGE_KEY)
    if (!storedUserId) {
      storedUserId = crypto.randomUUID()
      localStorage.setItem(USER_UUID_STORAGE_KEY, storedUserId)
    }
    userIdRef.current = storedUserId || ''
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
        .select('friend_uuid')
        .eq('user_uuid', storedUserId)
        .then(async ({ data, error }) => {
          if (error) {
            console.error('[Friends] fetch failed:', error)
            return
          }
          const friendUuids = (data || []).map(row => row.friend_uuid).filter(Boolean)
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
  }, [])

  // Fetch rooms on mount
  useEffect(() => {
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
  }, [])

  // FRIDAY: flush to Supabase on beforeunload + every 60s
  useEffect(() => {
    const handleUnload = () => { flushToSupabase() }
    window.addEventListener('beforeunload', handleUnload)
    const intervalId = setInterval(() => { flushToSupabase() }, 60000)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      clearInterval(intervalId)
    }
  }, [])

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
    const scrollEl = endEl?.parentElement
    if (scrollEl) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' })
    }
  }, [roomMessages, currentRoomIndex, visibleMessageIds])

  const getCurrentUserId = useCallback(() => {
    if (userIdRef.current) return userIdRef.current
    let storedUserId = localStorage.getItem(USER_UUID_STORAGE_KEY)
    if (!storedUserId) {
      storedUserId = crypto.randomUUID()
      localStorage.setItem(USER_UUID_STORAGE_KEY, storedUserId)
    }
    userIdRef.current = storedUserId
    return storedUserId
  }, [])

  const pushFriendRequest = useCallback((request: FriendRequest) => {
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
    const userId = getCurrentUserId()
    if (!userId) return

    if (!friendRequestsLoadedRef.current) {
      friendRequestsLoadedRef.current = true
      supabase
        .from('friend_requests')
        .select('id, sender_uuid, sender_name, status')
        .eq('receiver_uuid', userId)
        .eq('status', 'pending')
        .order('id', { ascending: true })
        .then(({ data, error }) => {
          if (error) {
            console.error('[FriendRequests] fetch failed:', error)
            return
          }
          if (data && data.length > 0) {
            data.forEach((req) => {
              pushFriendRequest({
                id: req.id,
                sender_uuid: req.sender_uuid,
                sender_name: req.sender_name || 'Anonymous',
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
        { event: 'INSERT', schema: 'public', table: 'friend_requests', filter: `receiver_uuid=eq.${userId}` },
        (payload) => {
          const req = payload.new
          if (req.status !== 'pending') return
          pushFriendRequest({
            id: req.id,
            sender_uuid: req.sender_uuid,
            sender_name: req.sender_name || 'Anonymous',
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
  }, [getCurrentUserId, pushFriendRequest])


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
    const { error } = await supabase.from('friend_requests').insert({
      sender_uuid: senderUuid,
      receiver_uuid: receiverUuid,
      sender_name: senderName,
      status: 'pending',
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
    const friendUuid = activeFriendRequest.sender_uuid
    const friendName = activeFriendRequest.sender_name || 'Anonymous'
    if (!userId || !friendUuid || friendUuid === userId) {
      advanceFriendRequest()
      return
    }

    const { error: friendError } = await supabase.from('friends').insert([
      { user_uuid: userId, friend_uuid: friendUuid },
      { user_uuid: friendUuid, friend_uuid: userId },
    ])

    if (friendError) {
      console.error('[Friends] insert failed:', friendError)
      return
    }

    const { error: requestError } = await supabase
      .from('friend_requests')
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
      .from('friend_requests')
      .update({ status: 'declined' })
      .eq('id', activeFriendRequest.id)

    if (error) console.error('[FriendRequests] status update failed:', error)
    advanceFriendRequest()
  }

  const handleSend = async (roomId: string, overrideName?: string, overrideCollege?: string) => {
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
    }
  }

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
      { uuid: userId, display_name: name, college: college || null, updated_at: new Date().toISOString() },
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

  if (!isMounted) return null

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
              <div className="room-messages" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); return false }}>
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

              {/* Input area */}
              <div className="input-area">
                <div className={`hint${isKeyboardOpen ? ' hidden' : ''}`}>? swipe for new people &amp; topics</div>
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











































































