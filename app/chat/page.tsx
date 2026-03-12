'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  trackRoomEnter,
  trackRoomLeave,
  trackMessageSent,
  trackTypedNotSent,
  rankRooms,
  flushToSupabase,
  getScrollCount,
  hasSelectedInterests,
  saveInterests,
  getInterests,
  getUserId,
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
  reveal_delay?: number
}

const AVATAR_COLORS = ['#5865F2', '#ED4245', '#FEE75C', '#57F287', '#EB459E', '#FF6B35', '#00B0F4']

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
  const [showInterestModal, setShowInterestModal] = useState(false)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [interestDismissed, setInterestDismissed] = useState(false)
  const [visibleMessageIds, setVisibleMessageIds] = useState<Set<string>>(new Set())
  const [reportTarget, setReportTarget] = useState<Message | null>(null)
  const [reportStatus, setReportStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  const roomRefs = useRef<(HTMLDivElement | null)[]>([])
  const messageEndRefs = useRef<(HTMLDivElement | null)[]>([])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const channelRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchedRoomsRef = useRef<Set<string>>(new Set())
  const pendingSendRef = useRef<{ roomId: string } | null>(null)
  const prevRoomIndexRef = useRef<number>(0)
  const inputHadContentRef = useRef<Record<string, boolean>>({})

  // Load user profile
  useEffect(() => {
    setIsMounted(true)
    const storedName = localStorage.getItem('spreadz_username')
    const storedCollege = localStorage.getItem('spreadz_college')
    if (storedName) setUsername(storedName)
    if (storedCollege) setUniversity(storedCollege)
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

        // TEMPORARY: disabled FRIDAY rankRooms entirely to isolate random room start bug
        /*
        setTimeout(async () => {
          if (prevRoomIndexRef.current === 0) {
            try {
              const ranked = await rankRooms(data)
              setRooms(ranked)
              if (ranked[0]?.id) trackRoomEnter(ranked[0].id)
            } catch (err) {
              console.error('[FRIDAY] Background ranking error:', err)
            }
          }
        }, 2000)
        */
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
      setTimeout(() => {
        setVisibleMessageIds(prev => {
          const next = new Set(prev)
          next.add(m.id)
          return next
        })
      }, delay)
    })
  }, [roomMessages])

  // Fetch messages for a specific room
  const fetchMessagesForRoom = useCallback(async (room: Room, roomIndex: number) => {
    if (fetchedRoomsRef.current.has(room.id)) return
    fetchedRoomsRef.current.add(room.id)

    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })

    if (roomIndex === 0) {
      // First room: include messages with this room_id OR null room_id
      query = query.or(`room_id.eq.${room.id},room_id.is.null`)
    } else {
      query = query.eq('room_id', room.id)
    }

    const { data } = await query

    if (data) {
      const msgs = data.map((m: any) => ({
        id: m.id,
        username: m.username || 'Anonymous',
        initials: getInitials(m.username || 'Anonymous'),
        university: m.university || '',
        text: m.content,
        timestamp: formatTime(m.created_at),
        created_at: m.created_at,
        room_id: m.room_id,
        reveal_delay: m.reveal_delay || 0,
      }))
      setRoomMessages(prev => ({ ...prev, [room.id]: msgs }))

      // trigger reveals immediately when messages are first fetched
      msgs.forEach((m, idx) => {
        const delay = idx < 2 ? 0 : (m.reveal_delay || 0)
        setTimeout(() => {
          setVisibleMessageIds(prev => {
            const next = new Set(prev)
            next.add(m.id)
            return next
          })
        }, delay)
      })
    }
  }, [])

  // Subscribe to realtime for a room
  const subscribeToRoom = useCallback((room: Room, roomIndex: number) => {
    // Unsubscribe from previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const filterValue = roomIndex === 0
      ? `room_id=eq.${room.id}`
      : `room_id=eq.${room.id}`

    const channel = supabase
      .channel(`room-${room.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: filterValue },
        (payload) => {
          const m = payload.new
          const newMessage: Message = {
            id: m.id,
            username: m.username || 'Anonymous',
            initials: getInitials(m.username || 'Anonymous'),
            university: m.university || '',
            text: m.content,
            timestamp: formatTime(m.created_at),
            created_at: m.created_at,
            room_id: m.room_id,
            reveal_delay: m.reveal_delay || 0,
          }

          // Trigger reveal for realtime message
          setTimeout(() => {
            setVisibleMessageIds(prev => {
              const next = new Set(prev)
              next.add(m.id)
              return next
            })
          }, m.reveal_delay || 0)
          setRoomMessages(prev => {
            const existing = prev[room.id] || []
            if (existing.some(msg => msg.id === m.id)) return prev
            return { ...prev, [room.id]: [...existing, newMessage] }
          })
        }
      )
      .subscribe()

    channelRef.current = channel
  }, [])

  // Also subscribe to null room_id inserts for room index 0
  const nullChannelRef = useRef<any>(null)

  useEffect(() => {
    if (rooms.length === 0) return
    const firstRoom = rooms[0]

    // Subscribe to messages with null room_id (for room 0 fallback)
    const nullChannel = supabase
      .channel('room-null-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new
          if (m.room_id !== null) return // Only care about null room_id
          const newMessage: Message = {
            id: m.id,
            username: m.username || 'Anonymous',
            initials: getInitials(m.username || 'Anonymous'),
            university: m.university || '',
            text: m.content,
            timestamp: formatTime(m.created_at),
            created_at: m.created_at,
            room_id: m.room_id,
            reveal_delay: m.reveal_delay || 0,
          }

          // Trigger reveal for realtime message (null room_id)
          setTimeout(() => {
            setVisibleMessageIds(prev => {
              const next = new Set(prev)
              next.add(m.id)
              return next
            })
          }, m.reveal_delay || 0)
          setRoomMessages(prev => {
            const existing = prev[firstRoom.id] || []
            if (existing.some(msg => msg.id === m.id)) return prev
            return { ...prev, [firstRoom.id]: [...existing, newMessage] }
          })
        }
      )
      .subscribe()

    nullChannelRef.current = nullChannel

    return () => {
      if (nullChannelRef.current) {
        supabase.removeChannel(nullChannelRef.current)
      }
    }
  }, [rooms])

  // When rooms load, fetch + subscribe for room index 0
  useEffect(() => {
    if (rooms.length === 0) return
    fetchMessagesForRoom(rooms[0], 0)
    subscribeToRoom(rooms[0], 0)

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
              fetchMessagesForRoom(rooms[idx], idx)
              subscribeToRoom(rooms[idx], idx)

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
  }, [rooms, currentRoomIndex, fetchMessagesForRoom, subscribeToRoom, interestDismissed])


  const handleSend = async (roomId: string, overrideName?: string, overrideCollege?: string) => {
    if (containerRef.current) {
      const currentScroll = containerRef.current.scrollTop
      setTimeout(() => {
        containerRef.current?.scrollTo({ top: currentScroll, behavior: 'instant' as ScrollBehavior })
      }, 0)
    }
    const text = (inputTexts[roomId] || '').trim()
    if (!text) return

    const activeName = overrideName || username || localStorage.getItem('spreadz_username')
    if (!activeName) {
      pendingSendRef.current = { roomId }
      setShowProfileModal(true)
      return
    }

    const activeCollege = overrideCollege !== undefined ? overrideCollege : (university || localStorage.getItem('spreadz_college') || '')
    const tempId = `temp-${Date.now()}`

    const optimisticMsg: Message = {
      id: tempId,
      username: activeName,
      initials: getInitials(activeName),
      university: activeCollege,
      text,
      timestamp: formatTime(),
      room_id: roomId,
      reveal_delay: 0,
    }

    // Reveal immediately for user's own message
    setVisibleMessageIds(prev => {
      const next = new Set(prev)
      next.add(tempId)
      return next
    })

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
      .insert({ content: text, username: activeName, university: activeCollege, room_id: roomId })
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
      setRoomMessages(prev => ({
        ...prev,
        [roomId]: (prev[roomId] || []).map(msg => msg.id === tempId ? {
          id: m.id,
          username: m.username || 'Anonymous',
          initials: getInitials(m.username || 'Anonymous'),
          university: m.university || '',
          text: m.content,
          timestamp: formatTime(m.created_at),
          created_at: m.created_at,
          room_id: m.room_id,
          reveal_delay: 0,
        } : msg)
      }))

      // Ensure the server-returned success message is also revealed
      setVisibleMessageIds(prev => {
        const next = new Set(prev)
        next.add(m.id)
        return next
      })
    }
  }

  const handleReport = async () => {
    if (!reportTarget) return
    setReportStatus('submitting')
    const reporterId = getUserId()

    const { error } = await supabase
      .from('message_reports')
      .insert({
        message_id: reportTarget.id,
        room_id: reportTarget.room_id ?? null,
        reported_username: reportTarget.username,
        reported_university: reportTarget.university,
        message_text: reportTarget.text,
        reporter_id: reporterId,
      })

    if (error) {
      setReportStatus('error')
      return
    }

    setReportStatus('success')
    setTimeout(() => {
      setReportTarget(null)
      setReportStatus('idle')
    }, 1000)
  }
  const handleProfileSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    const name = tempProfileName.trim()
    const college = tempProfileCollege.trim()
    if (!name) return

    localStorage.setItem('spreadz_username', name)
    localStorage.setItem('spreadz_college', college)
    setUsername(name)
    setUniversity(college)
    setShowProfileModal(false)

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
              ref={(el) => { roomRefs.current[index] = el }}
              data-room-index={index}
              style={{ background: 'var(--bg)' }}
            >
              {/* Header */}
              <div className={`header${isKeyboardOpen ? ' hidden' : ''}`}>
                <div className="logo">
                  <img src="/spreadz-logo.png" alt="SpreadZ" className="logo-img" />
                </div>
                <button className="settings-btn" aria-label="Settings">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
              <div style={{ overflowY: 'auto', height: '100%' }}>
                <div className="room-messages" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: '100%' }}>
                  {messages.map((msg, msgIndex) => {
                    const isVisible = visibleMessageIds.has(msg.id)
                    if (!isVisible) return null

                    // To calculate grouping correctly we should only look at visible messages
                    const visibleMsgs = messages.filter(m => visibleMessageIds.has(m.id))
                    const visibleIndex = visibleMsgs.findIndex(m => m.id === msg.id)
                    const isFirstInGroup = visibleIndex === 0 || visibleMsgs[visibleIndex - 1].username !== msg.username

                    return (
                      <div key={msg.id} className="msg-reveal" onClick={() => { setReportStatus('idle'); setReportTarget(msg) }}>
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
                <div className={`hint${isKeyboardOpen ? ' hidden' : ''}`}>? swipe for new people &amp; topics</div>
                <div className="input-wrap">
                  <input
                    ref={(el) => { inputRefs.current[index] = el }}
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
        <div className="modal-overlay">
          <form className="modal" onSubmit={handleProfileSubmit}>
            <h2 className="modal-title">What&apos;s your name?</h2>
            <div className="modal-inputs">
              <input type="text" placeholder="Your name" value={tempProfileName} onChange={(e) => setTempProfileName(e.target.value)} autoFocus required className="modal-input" />
              <p className="modal-sub">Your college? (optional)</p>
              <input type="text" placeholder="e.g. MIT, Stanford..." value={tempProfileCollege} onChange={(e) => setTempProfileCollege(e.target.value)} className="modal-input" />
            </div>
            <button type="submit" className="join-btn">Join Chat</button>
          </form>
        </div>
      )}

      {/* FRIDAY Interest Selection Bottom Sheet */}
      {showInterestModal && (
        <div className="interest-overlay" onClick={() => { setShowInterestModal(false); setInterestDismissed(true) }}>
          <div className="interest-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="interest-title">What are you into?</h2>
            <p className="interest-subtitle">We&apos;ll show you better rooms</p>
            <div className="interest-chips">
              {INTEREST_OPTIONS.map((interest) => (
                <button
                  key={interest}
                  className={`interest-chip${selectedInterests.includes(interest) ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedInterests(prev =>
                      prev.includes(interest)
                        ? prev.filter(i => i !== interest)
                        : [...prev, interest]
                    )
                  }}
                >
                  {interest}
                </button>
              ))}
            </div>
            <button
              className="interest-done-btn"
              disabled={selectedInterests.length === 0}
              onClick={() => {
                saveInterests(selectedInterests)
                setShowInterestModal(false)
                setInterestDismissed(true)
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {reportTarget && (
        <div className="modal-overlay" onClick={() => { setReportTarget(null); setReportStatus('idle') }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Report this message?</h2>
            <p className="modal-sub">From {reportTarget.username}</p>
            <div className="modal-inputs">
              <button
                className="join-btn"
                onClick={handleReport}
                disabled={reportStatus === 'submitting' || reportStatus === 'success'}
              >
                {reportStatus === 'submitting'
                  ? 'Reporting...'
                  : reportStatus === 'success'
                    ? 'Reported'
                    : 'Report'}
              </button>
              {reportStatus === 'error' && (
                <p className="modal-sub">Something went wrong. Try again.</p>
              )}
            </div>
          </div>
        </div>
      )}
            <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0b0f14;
          --glass: rgba(255, 255, 255, 0.08);
          --glass-strong: rgba(255, 255, 255, 0.14);
          --border: rgba(255, 255, 255, 0.18);
          --text-primary: #e6f1ff;
          --text-msg: #d6e2ef;
          --text-muted: #9aa7b4;
          --headline-bg: rgba(12, 18, 26, 0.65);
          --accent-teal: #5eead4;
          --accent-amber: #f8d26a;
          --shadow: 0 20px 60px rgba(3, 8, 20, 0.55);
        }

        html, body {
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
          font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background:
            radial-gradient(1200px 800px at 10% -10%, rgba(94, 234, 212, 0.18), transparent 60%),
            radial-gradient(800px 600px at 100% 20%, rgba(248, 210, 106, 0.16), transparent 55%),
            linear-gradient(180deg, #0b0f14 0%, #0a1118 55%, #0a0f14 100%);
        }
        body { color: var(--text-primary); }

        .rooms-container {
          height: 100dvh;
          overflow-y: scroll;
          scroll-snap-type: y mandatory;
          background: transparent;
        }
        .room-panel {
          height: 100dvh;
          display: flex;
          flex-direction: column;
          scroll-snap-align: start;
          overflow: hidden;
          padding: 8px 0 12px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 18px 8px 12px;
          background: var(--glass);
          border: 1px solid var(--border);
          border-radius: 18px;
          margin: 6px 14px 10px;
          backdrop-filter: blur(18px) saturate(140%);
          box-shadow: var(--shadow);
        }
        .logo-img { height: 64px; margin: -12px 0; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.35)); }
        .settings-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 6px; transition: color 0.15s; }
        .settings-btn:hover { color: var(--text-primary); }

        .ai-card-wrap { margin: 6px 16px 12px; flex-shrink: 0; }
        .ai-card {
          background: var(--headline-bg);
          border: 1px solid rgba(94, 234, 212, 0.35);
          border-radius: 16px;
          padding: 16px 18px;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(18px) saturate(140%);
          box-shadow: var(--shadow);
        }
        .ai-card::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, rgba(94, 234, 212, 0.15), transparent 50%, rgba(248, 210, 106, 0.12));
          pointer-events: none;
        }
        .card-label { color: var(--accent-teal); font-size: 10px; font-weight: 700; letter-spacing: 2px; margin-bottom: 4px; }
        .ai-headline { font-size: 16px; color: #ffffff; font-weight: 600; line-height: 1.4; }

        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(12px) scale(0.98); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .msg-reveal { animation: slideUpFade 0.5s ease-out forwards; }

        .messages { flex: 1; overflow-y: auto; padding: 0 16px; scrollbar-width: none; }
        .messages::-webkit-scrollbar { display: none; }

        .msg { display: flex; gap: 14px; width: 100%; padding: 0 16px; }
        .group-start { margin-top: 18px; }
        .group-continuation { margin-top: 6px; }
        .group-divider { height: 1px; width: 100%; background: rgba(255,255,255,0.08); margin: 16px 0; }

        .avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 12px;
          color: white;
          border: 1px solid rgba(255,255,255,0.2);
          box-shadow: 0 10px 24px rgba(0,0,0,0.35);
        }

        .msg-content {
          flex: 1;
          min-width: 0;
          position: relative;
          background: var(--glass);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 16px;
          padding: 10px 14px;
          backdrop-filter: blur(16px) saturate(140%);
          box-shadow: 0 12px 28px rgba(3, 10, 22, 0.45);
        }
        .msg-content.continuation { margin-left: 54px; }

        .msg-header { display: flex; align-items: baseline; margin-bottom: 2px; }
        .msg-username { font-size: 14.5px; font-weight: 700; color: #ffffff; }
        .msg-university { font-size: 12px; color: var(--text-muted); margin-left: 6px; }
        .msg-timestamp { font-size: 12px; color: var(--text-muted); margin-left: auto; }

        .msg-text { font-size: 14.5px; color: var(--text-msg); line-height: 1.5; margin-top: 2px; word-wrap: break-word; }

        .input-area { background: transparent; padding: 8px 16px 14px; flex-shrink: 0; }
        .hint { text-align: center; font-size: 11px; color: var(--text-muted); padding-bottom: 8px; opacity: 0.8; }

        .input-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--glass);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 6px 6px 6px 16px;
          backdrop-filter: blur(18px) saturate(140%);
          box-shadow: var(--shadow);
          transition: box-shadow 0.2s, border-color 0.2s;
        }
        .input-wrap:focus-within { box-shadow: 0 0 0 2px rgba(94, 234, 212, 0.2); border-color: rgba(94, 234, 212, 0.5); }

        input { flex: 1; background: none; border: none; outline: none; font-size: 15px; color: var(--text-primary); font-family: inherit; }
        input::placeholder { color: rgba(154, 167, 180, 0.7); }

        .send-btn {
          background: linear-gradient(135deg, #5eead4 0%, #34d399 100%);
          color: #0b0f14;
          border: none;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.2s;
          box-shadow: 0 12px 26px rgba(52, 211, 153, 0.35);
          flex-shrink: 0;
        }
        .send-btn:hover { transform: translateY(-1px); }
        .send-btn:active { transform: scale(0.96); }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(5, 10, 16, 0.65);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal {
          background: var(--glass);
          border: 1px solid var(--border);
          border-radius: 26px;
          padding: 28px;
          width: 100%;
          max-width: 360px;
          text-align: center;
          backdrop-filter: blur(18px) saturate(140%);
          box-shadow: var(--shadow);
        }
        .modal-title { font-size: 1.3rem; font-weight: 700; margin-bottom: 16px; color: var(--text-primary); }
        .modal-sub { font-size: 0.9rem; color: var(--text-muted); margin: 10px 0 8px; text-align: center; }
        .modal-inputs { display: flex; flex-direction: column; gap: 12px; margin-bottom: 4px; }
        .modal-input { background: rgba(255,255,255,0.06); border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; color: var(--text-primary); font-size: 1rem; outline: none; width: 100%; }
        .join-btn {
          background: linear-gradient(135deg, #f8d26a, #f1b948);
          color: #1a1206;
          border: none;
          border-radius: 14px;
          padding: 14px;
          width: 100%;
          font-size: 1.05rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 12px 24px rgba(241, 185, 72, 0.35);
        }

        .hidden { display: none !important; }

        .interest-overlay {
          position: fixed;
          inset: 0;
          background: rgba(5, 10, 16, 0.6);
          z-index: 1000;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .interest-sheet {
          background: var(--glass);
          border: 1px solid var(--border);
          border-radius: 24px 24px 0 0;
          padding: 24px;
          width: 100%;
          max-width: 440px;
          backdrop-filter: blur(18px) saturate(140%);
        }
        .interest-title { font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 4px; }
        .interest-subtitle { font-size: 13px; color: var(--text-muted); margin: 0 0 18px; }
        .interest-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .interest-chip { background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: #c6d2df; padding: 8px 16px; border-radius: 20px; font-size: 14px; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .interest-chip.selected { background: rgba(94, 234, 212, 0.25); border-color: rgba(94, 234, 212, 0.6); color: #e8fffb; }
        .interest-done-btn { margin-top: 20px; width: 100%; background: linear-gradient(135deg, #5eead4, #34d399); color: #0b0f14; border: none; border-radius: 12px; padding: 14px; font-size: 16px; font-weight: 600; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
        .interest-done-btn:disabled { opacity: 0.4; cursor: default; }
      `}</style>
    </>
  )
}









