'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  trackRoomEnter,
  trackRoomLeave,
  trackMessageSent,
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
  avatarUrl?: string | null
  created_at?: string
  room_name?: string | null
  room_id?: string | null
  senderUsername?: string | null
  reveal_delay?: number
}

interface FriendRequest {
  id: string
  requester_uuid: string
  sender_name: string
  created_at?: string
}

interface GifResult {
  id: string
  url: string
  previewUrl: string
  title: string
  width: number
  height: number
}

interface ReadOnlyProfile {
  displayName: string
  college: string
  avatarUrl: string | null
}

interface RoomSwipeState {
  startX: number
  startY: number
  lastY: number
  isVerticalGesture: boolean
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
  const targetDate = isoString ? new Date(isoString) : new Date()
  return targetDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}

const INTEREST_OPTIONS = ['Tech & AI', 'Sports', 'Politics', 'Entertainment', 'Business', 'Science', 'Gaming', 'Campus Life']
const USER_UUID_STORAGE_KEY = 'spreadz_user_uuid'
const DISPLAY_NAME_STORAGE_KEY = 'spreadz_display_name'
const USERNAME_STORAGE_KEY = 'spreadz_username'
const COLLEGE_STORAGE_KEY = 'spreadz_college'
const FRIENDS_STORAGE_KEY = 'spreadz_friends'
const SENT_ROOM_IDS_STORAGE_KEY_PREFIX = 'spreadz_sent_room_ids:'
const FRIEND_REQUEST_TTL_MS = 10 * 1000
const AVATAR_MAX_BYTES = 200 * 1024
const AVATAR_MAX_DIMENSION = 400
const AVATAR_QUALITY_STEPS = [0.7, 0.6, 0.5, 0.4, 0.3]
const GENERATED_USERNAME_REGEX = /^[a-z0-9_]{1,20}_[0-9]{4}$/
const GIF_MESSAGE_PREFIX = '[gif]:'
const GIPHY_API_KEY = 'xVwYwZtF5oenEwBNTkTQrhkvzUKDfa4o'
const GIPHY_LIMIT = 20
const GIF_PICKER_CLOSE_DURATION_MS = 36
const HACKER_NEWS_ROOM_ID = 'b87b934f-7b1a-41b6-9d89-3319a3442c0c'
const HACKER_NEWS_REVEAL_DEFAULT_MIN_MS = 4000
const HACKER_NEWS_REVEAL_DEFAULT_MAX_MS = 12000
const HACKER_NEWS_REVEAL_CLUSTER_MIN_MS = 2000
const HACKER_NEWS_REVEAL_CLUSTER_MAX_MS = 3000
const HACKER_NEWS_REVEAL_THINKING_MIN_MS = 8000
const HACKER_NEWS_REVEAL_THINKING_MAX_MS = 12000
const HACKER_NEWS_REVEAL_CLUSTER_CHANCE = 0.35

const isGeneratedUsername = (value: string) => GENERATED_USERNAME_REGEX.test(value)
const isGifMessage = (value: string) => value.startsWith(GIF_MESSAGE_PREFIX)
const getGifUrlFromMessage = (value: string) => isGifMessage(value) ? value.slice(GIF_MESSAGE_PREFIX.length).trim() : ''
const buildGifMessageContent = (url: string) => `${GIF_MESSAGE_PREFIX}${url}`

const getRandomRevealDelay = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min

const buildHackerNewsRevealSchedule = (messages: Message[]) => {
  let cumulativeDelay = 0
  let shouldUseLongPause = false

  return messages.map((message, index) => {
    if (index === 0) {
      return {
        messageId: message.id,
        delay: 0,
      }
    }

    const canCluster = index < messages.length - 1
    const shouldCluster = !shouldUseLongPause && canCluster && Math.random() < HACKER_NEWS_REVEAL_CLUSTER_CHANCE

    const gap = shouldUseLongPause
      ? getRandomRevealDelay(HACKER_NEWS_REVEAL_THINKING_MIN_MS, HACKER_NEWS_REVEAL_THINKING_MAX_MS)
      : shouldCluster
        ? getRandomRevealDelay(HACKER_NEWS_REVEAL_CLUSTER_MIN_MS, HACKER_NEWS_REVEAL_CLUSTER_MAX_MS)
        : getRandomRevealDelay(HACKER_NEWS_REVEAL_DEFAULT_MIN_MS, HACKER_NEWS_REVEAL_DEFAULT_MAX_MS)

    cumulativeDelay += gap
    shouldUseLongPause = shouldCluster

    return {
      messageId: message.id,
      delay: cumulativeDelay,
    }
  })
}

const generateUsernameFromDisplayName = (displayName: string) => {
  const normalized = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  const base = (normalized || 'user').slice(0, 20).replace(/_+$/g, '') || 'user'
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `${base}_${suffix}`
}

const readStoredProfile = () => {
  const rawStoredUsername = localStorage.getItem(USERNAME_STORAGE_KEY)?.trim() || ''
  const storedDisplayName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)?.trim() || ''
  const storedCollege = localStorage.getItem(COLLEGE_STORAGE_KEY)?.trim() || ''

  if (!storedDisplayName && rawStoredUsername && !isGeneratedUsername(rawStoredUsername)) {
    return {
      displayName: rawStoredUsername,
      username: '',
      college: storedCollege,
    }
  }

  return {
    displayName: storedDisplayName,
    username: rawStoredUsername,
    college: storedCollege,
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) => {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error('Avatar compression failed'))
    }, 'image/jpeg', quality)
  })
}

const compressAvatarFile = async (file: File) => {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Avatar image load failed'))
      nextImage.src = objectUrl
    })

    const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(image.width, image.height))
    let width = Math.max(1, Math.round(image.width * scale))
    let height = Math.max(1, Math.round(image.height * scale))
    let blob: Blob | null = null

    while (!blob || blob.size > AVATAR_MAX_BYTES) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d')
      if (!context) throw new Error('Avatar canvas unavailable')

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)

      blob = await canvasToBlob(canvas, AVATAR_QUALITY_STEPS[0])
      for (const quality of AVATAR_QUALITY_STEPS.slice(1)) {
        if (blob.size <= AVATAR_MAX_BYTES) break
        blob = await canvasToBlob(canvas, quality)
      }

      if (blob.size <= AVATAR_MAX_BYTES || (width <= 120 && height <= 120)) break

      width = Math.max(120, Math.round(width * 0.85))
      height = Math.max(120, Math.round(height * 0.85))
    }

    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export default function GlobalChat() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomMessages, setRoomMessages] = useState<Record<string, Message[]>>({})
  const [inputTexts, setInputTexts] = useState<Record<string, string>>({})
  const [activeGifPickerRoomId, setActiveGifPickerRoomId] = useState<string | null>(null)
  const [gifPickerClosingRoomId, setGifPickerClosingRoomId] = useState<string | null>(null)
  const [gifPickerDragging, setGifPickerDragging] = useState(false)
  const [gifSearchInput, setGifSearchInput] = useState('')
  const [gifResults, setGifResults] = useState<GifResult[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const [gifError, setGifError] = useState('')
  const [currentRoomIndex, setCurrentRoomIndex] = useState(0)
  const [cardCollapsed, setCardCollapsed] = useState(false)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [accountUsername, setAccountUsername] = useState('')
  const [university, setUniversity] = useState('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [tempProfileName, setTempProfileName] = useState('')
  const [tempProfileCollege, setTempProfileCollege] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [profileSheetDragging, setProfileSheetDragging] = useState(false)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [interestDismissed, setInterestDismissed] = useState(false)
  const [visibleMessageIdsByRoom, setVisibleMessageIdsByRoom] = useState<Record<string, Set<string>>>({})
  const [reportSheetMessage, setReportSheetMessage] = useState<Message | null>(null)
  const [readOnlyProfile, setReadOnlyProfile] = useState<ReadOnlyProfile | null>(null)
  const [reportStatus, setReportStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [sheetClosing, setSheetClosing] = useState(false)
  const [friendsSheetOpen, setFriendsSheetOpen] = useState(false)
  const [friends, setFriends] = useState<{ id: string; username: string }[]>([])
  const [activeFriendRequest, setActiveFriendRequest] = useState<FriendRequest | null>(null)
  const [friendRequestQueue, setFriendRequestQueue] = useState<FriendRequest[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const longPressTimerRef = useRef<number | null>(null)
  const userIdRef = useRef<string>('')
  const displayNameToUsernameRef = useRef<Record<string, string>>({})
  const displayNameToAvatarUrlRef = useRef<Record<string, string>>({})
  const gifTrendingCacheRef = useRef<GifResult[]>([])
  const gifSearchCacheRef = useRef<Record<string, GifResult[]>>({})
  const roomIdsRef = useRef<Set<string>>(new Set())
  const sentRoomIdsRef = useRef<Set<string>>(new Set())
  const messageEndRefs = useRef<(HTMLDivElement | null)[]>([])
  const channelRef = useRef<any>(null)
  const friendRequestChannelRef = useRef<any>(null)
  const friendRequestsLoadedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRoomPanelRef = useRef<HTMLDivElement | null>(null)
  const activeRoomMessagesRef = useRef<HTMLDivElement | null>(null)
  const activeMessagesRef = useRef<HTMLDivElement | null>(null)
  const composerLayerRef = useRef<HTMLDivElement | null>(null)
  const composerAreaRef = useRef<HTMLDivElement | null>(null)
  const composerBarRef = useRef<HTMLFormElement | null>(null)
  const initialViewportHeightRef = useRef(0)
  const fetchedRoomsRef = useRef<Set<string>>(new Set())
  const pendingSendRef = useRef<{ roomId: string; contentOverride?: string } | null>(null)
  const prevRoomIndexRef = useRef<number>(0)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const profileSheetRef = useRef<HTMLFormElement>(null)
  const gifPickerTouchStartYRef = useRef<number | null>(null)
  const gifPickerTouchStartedInGridRef = useRef(false)
  const gifPickerTouchGridRef = useRef<HTMLDivElement | null>(null)
  const gifPickerSheetRef = useRef<HTMLDivElement | null>(null)
  const gifPickerOffsetYRef = useRef(0)
  const gifPickerFrameRef = useRef<number | null>(null)
  const gifPickerCloseTimeoutRef = useRef<number | null>(null)
  const profileSheetTouchStartYRef = useRef<number | null>(null)
  const profileSheetOffsetYRef = useRef(0)
  const profileSheetFrameRef = useRef<number | null>(null)
  const profileSheetCloseTimeoutRef = useRef<number | null>(null)
  const roomSwipeRef = useRef<RoomSwipeState | null>(null)
  const activeRoomId = rooms[currentRoomIndex]?.id ?? null

  const syncComposerMetrics = useCallback(() => {
    if (typeof window === 'undefined') return

    if (!initialViewportHeightRef.current) {
      initialViewportHeightRef.current = window.innerHeight
    }

    const root = document.documentElement
    const viewport = window.visualViewport
    const baselineInnerHeight = initialViewportHeightRef.current
    const windowInnerHeight = Math.round(window.innerHeight)
    const visualViewportHeight = Math.round(viewport?.height ?? window.innerHeight)
    const visualViewportOffsetTop = Math.round(viewport?.offsetTop ?? 0)
    const rawKeyboardGap = Math.max(0, baselineInnerHeight - visualViewportHeight - visualViewportOffsetTop)
    const layoutViewportShrink = Math.max(0, baselineInnerHeight - windowInnerHeight)
    const appliedKeyboardOffset = Math.max(0, rawKeyboardGap - layoutViewportShrink)
    const appViewportHeight = visualViewportHeight
    const keyboardActive = rawKeyboardGap > 0 || layoutViewportShrink > 0

    root.style.setProperty('--app-viewport-height', `${appViewportHeight}px`)
    root.style.setProperty('--keyboard-offset', `${appliedKeyboardOffset}px`)

    const composerAreaStyles = composerAreaRef.current ? window.getComputedStyle(composerAreaRef.current) : null
    const composerPaddingTop = composerAreaStyles ? Number.parseFloat(composerAreaStyles.paddingTop) || 0 : 0
    const composerPaddingBottom = composerAreaStyles ? Number.parseFloat(composerAreaStyles.paddingBottom) || 0 : 0
    const composerBarHeight = composerBarRef.current?.getBoundingClientRect().height ?? 0
    const reservedSpace = Math.ceil(composerBarHeight + composerPaddingTop + composerPaddingBottom)
    root.style.setProperty('--composer-reserved-space', `${reservedSpace}px`)

    const composerStyle = composerLayerRef.current ? window.getComputedStyle(composerLayerRef.current) : null
    const composerRect = composerLayerRef.current?.getBoundingClientRect()
    const roomPanelHeight = Math.round(activeRoomPanelRef.current?.getBoundingClientRect().height ?? 0)
    const roomMessagesHeight = Math.round(activeRoomMessagesRef.current?.getBoundingClientRect().height ?? 0)
    const messagesHeight = Math.round(activeMessagesRef.current?.getBoundingClientRect().height ?? 0)
    const viewportBottom = visualViewportHeight + visualViewportOffsetTop
    const composerRectBottom = composerRect ? Math.round(composerRect.bottom) : 0
    const viewportGap = composerRect ? Math.max(0, Math.round(viewportBottom - composerRect.bottom)) : 0
    const composerViewportGap = viewportGap > 1 ? -viewportGap : 0
    root.style.setProperty('--composer-viewport-gap', `${composerViewportGap}px`)

    let transformedAncestor = false
    let currentParent = composerLayerRef.current?.parentElement ?? null
    while (currentParent) {
      const parentStyles = window.getComputedStyle(currentParent)
      if (
        parentStyles.transform !== 'none' ||
        parentStyles.filter !== 'none' ||
        parentStyles.perspective !== 'none'
      ) {
        transformedAncestor = true
        break
      }
      currentParent = currentParent.parentElement
    }

    const virtualKeyboardHeight = Math.round(
      ((navigator as Navigator & { virtualKeyboard?: { boundingRect?: DOMRectReadOnly } }).virtualKeyboard?.boundingRect?.height) ?? 0
    )
    const parentElement = composerLayerRef.current?.parentElement ?? null
    const offsetParentElement = composerLayerRef.current?.offsetParent as HTMLElement | null
    const describeElement = (element: HTMLElement | null) => {
      if (!element) return 'null'
      const tag = element.tagName.toLowerCase()
      const className = typeof element.className === 'string' ? element.className.trim() : ''
      return className ? `${tag}.${className.replace(/\s+/g, '.')}` : tag
    }

    const debugMetrics = {
      appViewportHeight,
      baselineInnerHeight,
      windowInnerHeight,
      visualViewportHeight,
      visualViewportOffsetTop,
      rawKeyboardGap: Math.round(rawKeyboardGap),
      layoutViewportShrink: Math.round(layoutViewportShrink),
      appliedKeyboardOffset: Math.round(appliedKeyboardOffset),
      composerBottom: composerStyle?.bottom ?? 'n/a',
      composerHeight: Math.round(composerRect?.height ?? 0),
      composerRectBottom,
      viewportGap,
      reservedSpace,
      position: composerStyle?.position ?? 'n/a',
      transformedAncestor,
      virtualKeyboardHeight,
      parentTag: parentElement?.tagName.toLowerCase() ?? 'n/a',
      parentClass: typeof parentElement?.className === 'string' && parentElement.className.trim()
        ? parentElement.className.trim()
        : '(none)',
      offsetParent: describeElement(offsetParentElement),
      roomPanelHeight,
      roomMessagesHeight,
      messagesHeight,
    }

    console.debug('[ComposerDebug]', debugMetrics)
  }, [])

  const applyProfileSheetOffset = useCallback((offset: number) => {
    profileSheetOffsetYRef.current = offset

    if (typeof window === 'undefined') return
    if (profileSheetFrameRef.current !== null) return

    profileSheetFrameRef.current = window.requestAnimationFrame(() => {
      profileSheetFrameRef.current = null
      if (profileSheetRef.current) {
        profileSheetRef.current.style.setProperty('--profile-sheet-offset', `${profileSheetOffsetYRef.current}px`)
      }
    })
  }, [])

  const fetchGifResults = useCallback(async (query: string, signal?: AbortSignal) => {
    const trimmedQuery = query.trim()
    const endpoint = trimmedQuery
      ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(trimmedQuery)}&limit=${GIPHY_LIMIT}&rating=g`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${GIPHY_LIMIT}&rating=g`

    const response = await fetch(endpoint, { signal })
    if (!response.ok) throw new Error(`Giphy request failed with ${response.status}`)

    const payload = await response.json()
    return Array.isArray(payload?.data)
      ? payload.data
        .map((item: any) => ({
          id: typeof item?.id === 'string' ? item.id : '',
          url: typeof item?.images?.fixed_height?.url === 'string' ? item.images.fixed_height.url : '',
          previewUrl:
            typeof item?.images?.fixed_height_still?.url === 'string'
              ? item.images.fixed_height_still.url
              : (typeof item?.images?.fixed_height?.url === 'string' ? item.images.fixed_height.url : ''),
          title: typeof item?.title === 'string' ? item.title : 'GIF',
          width: Number(item?.images?.fixed_height?.width) || 200,
          height: Number(item?.images?.fixed_height?.height) || 200,
        }))
        .filter((item: GifResult) => item.id && item.url && item.previewUrl)
      : []
  }, [])

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

  const buildMessageFromRow = useCallback((m: any, fallbackUsername?: string): Message => {
    const resolvedName = m.display_name || 'Anonymous'
    const resolvedCollege = m.college || ''
    return {
      id: m.id,
      username: resolvedName,
      initials: getInitials(resolvedName),
      university: resolvedCollege,
      text: m.content,
      timestamp: formatTime(m.created_at),
      avatarUrl: m.avatar_url ?? displayNameToAvatarUrlRef.current[resolvedName] ?? null,
      created_at: m.created_at,
      room_name: m.room_name ?? null,
      room_id: m.room_id,
      senderUsername: fallbackUsername ?? displayNameToUsernameRef.current[resolvedName] ?? null,
      reveal_delay: m.reveal_delay || 0,
    }
  }, [])

  const scheduleReveal = useCallback((roomId: string, messageId: string, delay: number) => {
    setTimeout(() => {
      setVisibleMessageIdsByRoom(prev => {
        const next = { ...prev }
        const roomVisibleMessageIds = new Set(next[roomId] || [])
        roomVisibleMessageIds.add(messageId)
        next[roomId] = roomVisibleMessageIds
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

  const getCurrentUsername = useCallback(() => {
    if (accountUsername.trim()) return accountUsername.trim()
    const storedUsername = localStorage.getItem(USERNAME_STORAGE_KEY)?.trim() || ''
    return isGeneratedUsername(storedUsername) ? storedUsername : ''
  }, [accountUsername])

  const getSentRoomIdsStorageKey = useCallback((username: string) => `${SENT_ROOM_IDS_STORAGE_KEY_PREFIX}${username}`, [])

  const readStoredSentRoomIds = useCallback((username: string) => {
    if (!username) return new Set<string>()

    try {
      const raw = localStorage.getItem(getSentRoomIdsStorageKey(username))
      if (!raw) return new Set<string>()
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? new Set(parsed.filter((roomId): roomId is string => typeof roomId === 'string')) : new Set<string>()
    } catch {
      return new Set<string>()
    }
  }, [getSentRoomIdsStorageKey])

  const persistSentRoomIds = useCallback((username: string, roomIds: Set<string>) => {
    if (!username) return
    localStorage.setItem(getSentRoomIdsStorageKey(username), JSON.stringify(Array.from(roomIds)))
  }, [getSentRoomIdsStorageKey])

  const cacheUsernamesForDisplayNames = useCallback(async (displayNames: Array<string | null | undefined>) => {
    const namesToFetch = Array.from(new Set(displayNames
      .map(name => name?.trim() || '')
      .filter(Boolean)))

    if (namesToFetch.length === 0) return

    const { data, error } = await supabase
      .from('users')
      .select('display_name, username, avatar_url')
      .in('display_name', namesToFetch)

    if (error) {
      console.error('[Users] profile cache fetch failed:', error)
      return
    }

    data?.forEach((row) => {
      if (!row.display_name) return

      displayNameToAvatarUrlRef.current[row.display_name] = row.avatar_url || ''

      if (row.username) {
        displayNameToUsernameRef.current[row.display_name] = row.username
      }
    })
  }, [])

  const resolveUsernameForDisplayName = useCallback(async (name?: string | null) => {
    const normalizedName = name?.trim() || ''
    if (!normalizedName) return null

    if (displayNameToUsernameRef.current[normalizedName]) {
      return displayNameToUsernameRef.current[normalizedName]
    }

    await cacheUsernamesForDisplayNames([normalizedName])
    return displayNameToUsernameRef.current[normalizedName] || null
  }, [cacheUsernamesForDisplayNames])

  const persistProfileLocally = useCallback((profile: { displayName?: string; username?: string; college?: string }) => {
    if (profile.displayName !== undefined) {
      localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, profile.displayName)
    }
    if (profile.username !== undefined) {
      localStorage.setItem(USERNAME_STORAGE_KEY, profile.username)
    }
    if (profile.college !== undefined) {
      localStorage.setItem(COLLEGE_STORAGE_KEY, profile.college)
    }
  }, [])

  const upsertUserProfile = useCallback(async (profile: {
    displayName?: string
    username?: string
    college?: string
    avatarUrl?: string
    createdAt?: string
  }) => {
    const userId = getCurrentUserId()
    if (!userId) return

    const payload: {
      uuid: string
      created_at?: string
      display_name?: string | null
      username?: string | null
      college?: string | null
      avatar_url?: string | null
    } = {
      uuid: userId,
    }

    if (profile.createdAt !== undefined) payload.created_at = profile.createdAt
    if (profile.displayName !== undefined) payload.display_name = profile.displayName || null
    if (profile.username !== undefined) payload.username = profile.username || null
    if (profile.college !== undefined) payload.college = profile.college || null
    if (profile.avatarUrl !== undefined) payload.avatar_url = profile.avatarUrl || null

    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'uuid' })
    if (error) console.error('[Users] upsert failed:', error)
  }, [getCurrentUserId])

  const ensureAccountUsername = useCallback(async (name: string, college?: string) => {
    const existingUsername = getCurrentUsername()
    if (existingUsername) return existingUsername
    if (!name.trim()) return ''

    const nextUsername = generateUsernameFromDisplayName(name)
    displayNameToUsernameRef.current[name] = nextUsername
    setAccountUsername(nextUsername)
    sentRoomIdsRef.current = readStoredSentRoomIds(nextUsername)
    persistProfileLocally({ username: nextUsername })
    await upsertUserProfile({
      displayName: name,
      username: nextUsername,
      college: college ?? university,
      avatarUrl,
    })
    return nextUsername
  }, [avatarUrl, getCurrentUsername, persistProfileLocally, readStoredSentRoomIds, university, upsertUserProfile])

  const incrementUserMessagesSent = useCallback(async (username: string) => {
    if (!username) return

    const { error } = await supabase.rpc('increment_user_messages_sent', {
      p_username: username,
    })
    if (error) console.error('[Users] messages_sent increment failed:', error)
  }, [])

  const incrementUserCameBack = useCallback(async (username: string) => {
    if (!username) return

    const { error } = await supabase.rpc('increment_user_came_back', {
      p_username: username,
    })
    if (error) console.error('[Users] came_back increment failed:', error)
  }, [])

  const updateRoomMessageStats = useCallback(async (roomId: string, activeUsername: string) => {
    if (!roomId) return

    let shouldIncrementUserCount = false

    if (!sentRoomIdsRef.current.has(roomId)) {
      const { data: behaviourRows, error: behaviourError } = await supabase
        .from('user_behaviour')
        .select('id')
        .eq('username', activeUsername)
        .eq('room_id', roomId)
        .gt('messages_sent', 0)
        .limit(1)

      if (behaviourError) {
        console.error('[Rooms] first-message check failed:', behaviourError)
      } else if (!behaviourRows || behaviourRows.length === 0) {
        shouldIncrementUserCount = true
      } else {
        sentRoomIdsRef.current.add(roomId)
        persistSentRoomIds(activeUsername, sentRoomIdsRef.current)
      }
    }

    const { error: messageCountError } = await supabase.rpc('increment_room_message_count', {
      room_id: roomId,
    })

    if (messageCountError) {
      console.error('[Rooms] message_count increment failed:', messageCountError)
      return
    }

    if (shouldIncrementUserCount) {
      const { error: userCountError } = await supabase.rpc('increment_room_user_count', {
        room_id: roomId,
      })

      if (userCountError) {
        console.error('[Rooms] user_count increment failed:', userCountError)
        return
      }

      sentRoomIdsRef.current.add(roomId)
      persistSentRoomIds(activeUsername, sentRoomIdsRef.current)
    }
  }, [persistSentRoomIds])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (displayName.trim() && accountUsername.trim()) {
      displayNameToUsernameRef.current[displayName.trim()] = accountUsername.trim()
    }
  }, [accountUsername, displayName])

  useEffect(() => {
    roomIdsRef.current = new Set(rooms.map((room) => room.id))
  }, [rooms])

  useEffect(() => {
    if (!showProfileModal) {
      if (profileSheetCloseTimeoutRef.current !== null) {
        window.clearTimeout(profileSheetCloseTimeoutRef.current)
        profileSheetCloseTimeoutRef.current = null
      }
      profileSheetTouchStartYRef.current = null
      setProfileSheetDragging(false)
      applyProfileSheetOffset(0)
      return
    }

    setProfileSheetDragging(false)
    applyProfileSheetOffset(0)
  }, [showProfileModal, applyProfileSheetOffset])

  useEffect(() => {
    return () => {
      if (profileSheetCloseTimeoutRef.current !== null) {
        window.clearTimeout(profileSheetCloseTimeoutRef.current)
      }
      if (profileSheetFrameRef.current !== null) {
        window.cancelAnimationFrame(profileSheetFrameRef.current)
      }
    }
  }, [])

  // Load user profile
  useEffect(() => {
    if (!authReady) return
    const loadProfile = async () => {
      const storedUserId = localStorage.getItem(USER_UUID_STORAGE_KEY)
      if (!storedUserId) return

      userIdRef.current = storedUserId

      const storedProfile = readStoredProfile()
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

      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('display_name, college, avatar_url, username')
        .eq('uuid', storedUserId)
        .maybeSingle()

      if (userError) {
        console.error('[Users] profile fetch failed:', userError)
      }

      const nextDisplayName = storedProfile.displayName || userRow?.display_name || ''
      const nextCollege = storedProfile.college || userRow?.college || ''
      const nextUsername = storedProfile.username || userRow?.username || (nextDisplayName ? generateUsernameFromDisplayName(nextDisplayName) : '')
      const shouldIncrementCameBack = Boolean(nextUsername && (userRow?.username || storedProfile.username))

      setDisplayName(nextDisplayName)
      setUniversity(nextCollege)
      setAvatarUrl(userRow?.avatar_url || '')
      setAccountUsername(nextUsername)
      sentRoomIdsRef.current = readStoredSentRoomIds(nextUsername)
      if (nextDisplayName && nextUsername) {
        displayNameToUsernameRef.current[nextDisplayName] = nextUsername
      }
      if (nextDisplayName) {
        displayNameToAvatarUrlRef.current[nextDisplayName] = userRow?.avatar_url || ''
      }
      persistProfileLocally({
        displayName: nextDisplayName,
        username: nextUsername,
        college: nextCollege,
      })
      await upsertUserProfile({
        displayName: nextDisplayName,
        username: nextUsername,
        college: nextCollege,
        createdAt: userRow ? undefined : new Date().toISOString(),
      })
      if (shouldIncrementCameBack) {
        await incrementUserCameBack(nextUsername)
      }

      const { data, error } = await supabase
        .from('friends')
        .select('id, requester_uuid, addressee_uuid, status')
        .or(`requester_uuid.eq.${storedUserId},addressee_uuid.eq.${storedUserId}`)
        .eq('status', 'accepted')

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
        .select('uuid, display_name, username')
        .in('uuid', friendUuids)

      if (profileError) {
        console.error('[Friends] profiles fetch failed:', profileError)
      }

      const remoteFriends = friendUuids.map(friendUuid => {
        const profile = profiles?.find(p => p.uuid === friendUuid)
        return {
          id: friendUuid,
          username: profile?.display_name || (profile?.username ? `@${profile.username}` : 'Anonymous'),
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
    }

    loadProfile()
  }, [authReady, incrementUserCameBack, persistProfileLocally, readStoredSentRoomIds, upsertUserProfile])

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
        if (data[0]) {
          trackRoomEnter(data[0].id, data[0].headline)
        }


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

  useEffect(() => {
    if (gifTrendingCacheRef.current.length > 0) return

    const controller = new AbortController()

    void (async () => {
      try {
        const trendingResults = await fetchGifResults('', controller.signal)
        gifTrendingCacheRef.current = trendingResults
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[GIF] trending prefetch failed:', error)
        }
      }
    })()

    return () => controller.abort()
  }, [fetchGifResults])

  useEffect(() => {
    return () => {
      if (gifPickerCloseTimeoutRef.current) {
        window.clearTimeout(gifPickerCloseTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!activeGifPickerRoomId) {
      setGifLoading(false)
      setGifError('')
      return
    }

    const controller = new AbortController()
    const trimmedQuery = gifSearchInput.trim()
    const cacheKey = trimmedQuery.toLowerCase()
    const cachedResults = trimmedQuery
      ? gifSearchCacheRef.current[cacheKey]
      : gifTrendingCacheRef.current

    if (cachedResults?.length) {
      setGifResults(cachedResults)
    } else {
      setGifResults([])
    }

    const timeoutId = window.setTimeout(async () => {
      if (!cachedResults?.length) {
        setGifLoading(true)
      }
      setGifError('')

      try {
        const nextGifResults = await fetchGifResults(trimmedQuery, controller.signal)

        if (trimmedQuery) {
          gifSearchCacheRef.current[cacheKey] = nextGifResults
        } else {
          gifTrendingCacheRef.current = nextGifResults
        }

        setGifResults(nextGifResults)
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('[GIF] fetch failed:', error)
        setGifResults([])
        setGifError('Could not load GIFs right now.')
      } finally {
        if (!controller.signal.aborted) {
          setGifLoading(false)
        }
      }
    }, trimmedQuery ? 250 : 0)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [activeGifPickerRoomId, fetchGifResults, gifSearchInput])

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

  const triggerRevealsForMessages = useCallback((roomId: string, msgs: Message[]) => {
    if (roomId === HACKER_NEWS_ROOM_ID) {
      if (msgs.length === 0) return
      const revealSchedule = buildHackerNewsRevealSchedule(msgs)

      setVisibleMessageIdsByRoom(prev => ({
        ...prev,
        [roomId]: new Set([msgs[0].id]),
      }))

      revealSchedule.slice(1).forEach(({ messageId, delay }) => {
        scheduleReveal(roomId, messageId, delay)
      })
      return
    }

    msgs.forEach((m, idx) => {
      const delay = idx < 2 ? 0 : (m.reveal_delay || 0)
      scheduleReveal(roomId, m.id, delay)
    })
  }, [scheduleReveal])

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
      await cacheUsernamesForDisplayNames(data.map((message: any) => message.display_name))
      const msgs = data.map((m: any) => buildMessageFromRow(m))
      setRoomMessages(prev => ({ ...prev, [room.id]: msgs }))

      requestAnimationFrame(() => {
        triggerRevealsForMessages(room.id, msgs)
      })
    }
  }, [buildMessageFromRow, cacheUsernamesForDisplayNames, triggerRevealsForMessages])

  const handleRealtimeMessage = useCallback((messageRow: any) => {
    const roomId = messageRow.room_id
    if (!roomId || !roomIdsRef.current.has(roomId)) return

    const messageAuthorId = typeof messageRow.user_uuid === 'string' ? messageRow.user_uuid : ''
    if (messageAuthorId && messageAuthorId === getCurrentUserId()) return

    const incomingMessage = buildMessageFromRow(messageRow)

    scheduleReveal(roomId, incomingMessage.id, incomingMessage.reveal_delay || 0)
    setRoomMessages(prev => {
      const existing = prev[roomId] || []
      if (existing.some(msg => msg.id === messageRow.id)) return prev
      return { ...prev, [roomId]: [...existing, incomingMessage] }
    })

    void (async () => {
      await cacheUsernamesForDisplayNames([messageRow.display_name])
      const hydratedMessage = buildMessageFromRow(messageRow)

      setRoomMessages(prev => {
        const existing = prev[roomId] || []
        const messageIndex = existing.findIndex(msg => msg.id === messageRow.id)
        if (messageIndex === -1) return prev

        const currentMessage = existing[messageIndex]
        if (
          currentMessage.avatarUrl === hydratedMessage.avatarUrl &&
          currentMessage.senderUsername === hydratedMessage.senderUsername
        ) {
          return prev
        }

        const nextRoomMessages = [...existing]
        nextRoomMessages[messageIndex] = {
          ...currentMessage,
          avatarUrl: hydratedMessage.avatarUrl,
          senderUsername: hydratedMessage.senderUsername,
        }

        return { ...prev, [roomId]: nextRoomMessages }
      })
    })()
  }, [buildMessageFromRow, cacheUsernamesForDisplayNames, getCurrentUserId, scheduleReveal])


  // When rooms load, fetch room index 0 immediately.
  useEffect(() => {
    if (rooms.length === 0) return
    fetchMessagesForRoom(rooms[0])
  }, [rooms, fetchMessagesForRoom])

  // Keep one long-lived messages subscription so room changes do not interrupt realtime inserts.
  useEffect(() => {
    if (!authReady || rooms.length === 0) return

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          handleRealtimeMessage(payload.new)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [authReady, rooms.length, handleRealtimeMessage])

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
              trackRoomEnter(rooms[idx].id, rooms[idx].headline)
              prevRoomIndexRef.current = idx

              const nextRoom = rooms[idx]

              setCurrentRoomIndex(idx)
              fetchMessagesForRoom(nextRoom)
            }
          }
        }
      },
      {
        root: containerRef.current,
        threshold: 0.6,
      }
    )

    containerRef.current
      ?.querySelectorAll<HTMLElement>('[data-room-index]')
      .forEach((roomPanel) => observer.observe(roomPanel))

    return () => observer.disconnect()
  }, [rooms, currentRoomIndex, fetchMessagesForRoom, interestDismissed])

  useEffect(() => {
    const endEl = messageEndRefs.current[currentRoomIndex]
    const scrollEl = endEl?.closest('.room-messages') as HTMLDivElement | null
    if (scrollEl) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' })
    }
  }, [roomMessages, currentRoomIndex, visibleMessageIdsByRoom])

  useEffect(() => {
    setCardCollapsed(false)

    const activeRoomId = rooms[currentRoomIndex]?.id
    if (!activeRoomId) return

    const collapseTimer = window.setTimeout(() => {
      setCardCollapsed(true)
    }, 30000)

    return () => {
      window.clearTimeout(collapseTimer)
    }
  }, [currentRoomIndex, rooms])

  useEffect(() => {
    if (typeof window === 'undefined') return

    syncComposerMetrics()

    const viewport = window.visualViewport
    if (viewport) {
      viewport.addEventListener('resize', syncComposerMetrics)
      viewport.addEventListener('scroll', syncComposerMetrics)
    } else {
      window.addEventListener('resize', syncComposerMetrics)
    }

    return () => {
      if (viewport) {
        viewport.removeEventListener('resize', syncComposerMetrics)
        viewport.removeEventListener('scroll', syncComposerMetrics)
      } else {
        window.removeEventListener('resize', syncComposerMetrics)
      }
    }
  }, [syncComposerMetrics])

  useEffect(() => {
    if (typeof window === 'undefined') return

    syncComposerMetrics()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      syncComposerMetrics()
    })

    if (composerLayerRef.current) observer.observe(composerLayerRef.current)
    if (composerAreaRef.current) observer.observe(composerAreaRef.current)
    if (composerBarRef.current) observer.observe(composerBarRef.current)

    return () => {
      observer.disconnect()
    }
  }, [activeRoomId, currentRoomIndex, isKeyboardOpen, activeGifPickerRoomId, gifPickerClosingRoomId, syncComposerMetrics])

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
    const roomName = reportSheetMessage.room_name ?? rooms[currentRoomIndex]?.headline ?? null
    const reporterUsername = getCurrentUsername()
    const reportedUsername = reportSheetMessage.senderUsername || await resolveUsernameForDisplayName(reportSheetMessage.username)

    if (!reporterUsername || !reportedUsername) {
      setReportStatus('error')
      setTimeout(() => {
        setReportStatus('idle')
      }, 1400)
      return
    }

    const { error } = await supabase.from('reports').insert([
      {
        reporter_username: reporterUsername,
        reported_username: reportedUsername,
        content: reportSheetMessage.text,
        room_name: roomName,
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

  const handleSend = async (roomId: string, overrideName?: string, overrideCollege?: string, contentOverride?: string) => {
    const text = (contentOverride ?? inputTexts[roomId] ?? '').trim()
    if (!text) return

    const activeDisplayName = overrideName || displayName || localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)
    if (!activeDisplayName) {
      pendingSendRef.current = { roomId, contentOverride }
      setTempProfileName('')
      setTempProfileCollege('')
      setShowProfileModal(true)
      return
    }

    const activeCollege = overrideCollege !== undefined ? overrideCollege : (university || localStorage.getItem(COLLEGE_STORAGE_KEY) || '')
    const activeUsername = await ensureAccountUsername(activeDisplayName, activeCollege)
    if (!activeUsername) return
    const activeRoomName = rooms.find(room => room.id === roomId)?.headline || ''
    const tempId = `temp-${Date.now()}`

    const optimisticMsg: Message = {
      id: tempId,
      username: activeDisplayName,
      initials: getInitials(activeDisplayName),
      university: activeCollege,
      text,
      timestamp: formatTime(),
      room_name: activeRoomName,
      room_id: roomId,
      senderUsername: activeUsername,
      reveal_delay: 0,
    }

    // Reveal immediately for user's own message
    scheduleReveal(roomId, tempId, 0)

    setRoomMessages(prev => ({
      ...prev,
      [roomId]: [...(prev[roomId] || []), optimisticMsg]
    }))
    if (contentOverride === undefined) {
      setInputTexts(prev => ({ ...prev, [roomId]: '' }))
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ content: text, display_name: activeDisplayName, college: activeCollege, room_name: activeRoomName, room_id: roomId })
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
      const serverMessage = buildMessageFromRow(m, activeUsername)
      setRoomMessages(prev => ({
        ...prev,
        [roomId]: (prev[roomId] || []).map(msg => msg.id === tempId ? serverMessage : msg)
      }))

      // Ensure the server-returned success message is also revealed
      scheduleReveal(roomId, serverMessage.id, 0)
      trackMessageSent(roomId, activeRoomName)
      await incrementUserMessagesSent(activeUsername)
      await updateRoomMessageStats(roomId, activeUsername)
    }
  }

  const clearGifPickerTouchState = useCallback(() => {
    gifPickerTouchStartYRef.current = null
    gifPickerTouchStartedInGridRef.current = false
    gifPickerTouchGridRef.current = null
  }, [])

  const applyGifPickerOffset = useCallback((offset: number) => {
    gifPickerOffsetYRef.current = offset

    if (typeof window === 'undefined') return
    if (gifPickerFrameRef.current !== null) return

    gifPickerFrameRef.current = window.requestAnimationFrame(() => {
      gifPickerFrameRef.current = null
      if (gifPickerSheetRef.current) {
        gifPickerSheetRef.current.style.setProperty('--gif-picker-offset', `${gifPickerOffsetYRef.current}px`)
      }
    })
  }, [])

  const bindGifPickerSheetRef = useCallback((node: HTMLDivElement | null) => {
    gifPickerSheetRef.current = node
    if (node) {
      node.style.setProperty('--gif-picker-offset', `${gifPickerOffsetYRef.current}px`)
    }
  }, [])

  const getGifPickerDismissOffset = useCallback(() => {
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
    const sheetHeight = gifPickerSheetRef.current?.offsetHeight ?? 0

    return Math.max(sheetHeight + 56, Math.round(viewportHeight * 0.78), 180)
  }, [])

  const getGifPickerCloseThreshold = useCallback(() => {
    const sheetHeight = gifPickerSheetRef.current?.offsetHeight ?? 0

    return sheetHeight > 0 ? Math.max(54, Math.round(sheetHeight * 0.16)) : 54
  }, [])

  useEffect(() => {
    return () => {
      if (gifPickerFrameRef.current !== null) {
        window.cancelAnimationFrame(gifPickerFrameRef.current)
        gifPickerFrameRef.current = null
      }
    }
  }, [])

  const closeGifPicker = useCallback((roomId?: string, targetOffset?: number) => {
    const resolvedRoomId = roomId ?? activeGifPickerRoomId ?? gifPickerClosingRoomId
    if (!resolvedRoomId) return
    const resolvedOffset = targetOffset ?? getGifPickerDismissOffset()

    if (gifPickerCloseTimeoutRef.current) {
      window.clearTimeout(gifPickerCloseTimeoutRef.current)
      gifPickerCloseTimeoutRef.current = null
    }

    clearGifPickerTouchState()
    setGifPickerDragging(false)
    applyGifPickerOffset(resolvedOffset)
    setGifPickerClosingRoomId(resolvedRoomId)

    gifPickerCloseTimeoutRef.current = window.setTimeout(() => {
      gifPickerCloseTimeoutRef.current = null
      setActiveGifPickerRoomId(prev => prev === resolvedRoomId ? null : prev)
      setGifPickerClosingRoomId(prev => prev === resolvedRoomId ? null : prev)
      applyGifPickerOffset(0)
      setGifSearchInput('')
      setGifError('')
    }, GIF_PICKER_CLOSE_DURATION_MS)
  }, [activeGifPickerRoomId, gifPickerClosingRoomId, clearGifPickerTouchState, applyGifPickerOffset, getGifPickerDismissOffset])

  const openGifPicker = (roomId: string) => {
    if (gifPickerCloseTimeoutRef.current) {
      window.clearTimeout(gifPickerCloseTimeoutRef.current)
      gifPickerCloseTimeoutRef.current = null
    }

    clearGifPickerTouchState()
    setGifPickerClosingRoomId(null)
    setGifPickerDragging(false)
    applyGifPickerOffset(0)
    setIsKeyboardOpen(false)
    setActiveGifPickerRoomId(roomId)
    setGifSearchInput('')
    setGifError('')
    setGifResults(gifTrendingCacheRef.current)
  }

  const toggleGifPicker = (roomId: string) => {
    if (activeGifPickerRoomId === roomId && !gifPickerClosingRoomId) {
      closeGifPicker(roomId)
      return
    }

    openGifPicker(roomId)
  }

  useEffect(() => {
    setActiveGifPickerRoomId(null)
    setGifPickerClosingRoomId(null)
    setGifPickerDragging(false)
    applyGifPickerOffset(0)
    clearGifPickerTouchState()
    setGifSearchInput('')
    setGifError('')
  }, [currentRoomIndex, clearGifPickerTouchState, applyGifPickerOffset])

  const handleGifPickerTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return

    if (gifPickerCloseTimeoutRef.current) {
      window.clearTimeout(gifPickerCloseTimeoutRef.current)
      gifPickerCloseTimeoutRef.current = null
    }

    const target = e.target as HTMLElement
    gifPickerTouchStartYRef.current = e.touches[0].clientY
    gifPickerTouchGridRef.current = target.closest('.gif-picker-grid') as HTMLDivElement | null
    gifPickerTouchStartedInGridRef.current = Boolean(gifPickerTouchGridRef.current)
    setGifPickerClosingRoomId(null)
    setGifPickerDragging(false)
  }

  const handleGifPickerTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const startY = gifPickerTouchStartYRef.current
    if (startY === null || e.touches.length !== 1) return

    const target = e.target as HTMLElement
    const gridEl = gifPickerTouchGridRef.current ?? (target.closest('.gif-picker-grid') as HTMLDivElement | null)
    if (!gifPickerTouchGridRef.current && gridEl) {
      gifPickerTouchGridRef.current = gridEl
      gifPickerTouchStartedInGridRef.current = true
    }
    const deltaY = e.touches[0].clientY - startY
    const currentScrollTop = gridEl?.scrollTop ?? 0

    if (deltaY <= 0) {
      if (gifPickerDragging) {
        e.preventDefault()
        setGifPickerDragging(false)
        applyGifPickerOffset(0)
      }
      return
    }

    if (gifPickerTouchStartedInGridRef.current && gridEl && currentScrollTop > 0 && !gifPickerDragging) {
      return
    }

    e.preventDefault()
    if (!gifPickerDragging) {
      setGifPickerDragging(true)
    }
    applyGifPickerOffset(Math.min(deltaY, getGifPickerDismissOffset()))
  }

  const handleGifPickerTouchEnd = (roomId: string) => {
    const dragDistance = gifPickerOffsetYRef.current
    const closeThreshold = getGifPickerCloseThreshold()
    const dismissOffset = getGifPickerDismissOffset()
    clearGifPickerTouchState()

    if (dragDistance > closeThreshold) {
      closeGifPicker(roomId, Math.max(dragDistance, dismissOffset))
      return
    }

    setGifPickerDragging(false)
    applyGifPickerOffset(0)
  }

  const handleGifSelect = async (roomId: string, gifUrl: string) => {
    const trimmedGifUrl = gifUrl.trim()
    if (!trimmedGifUrl) return

    if (gifPickerCloseTimeoutRef.current) {
      window.clearTimeout(gifPickerCloseTimeoutRef.current)
      gifPickerCloseTimeoutRef.current = null
    }
    clearGifPickerTouchState()
    setActiveGifPickerRoomId(null)
    setGifPickerClosingRoomId(null)
    setGifPickerDragging(false)
    applyGifPickerOffset(0)
    setGifSearchInput('')
    setGifResults([])
    setGifError('')
    await handleSend(roomId, undefined, undefined, buildGifMessageContent(trimmedGifUrl))
  }

  const handleProfileSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    const name = tempProfileName.trim()
    const college = tempProfileCollege.trim()
    if (!name) return

    const nextUsername = await ensureAccountUsername(name, college)
    persistProfileLocally({
      displayName: name,
      username: nextUsername,
      college,
    })
    setDisplayName(name)
    setAccountUsername(nextUsername)
    setUniversity(college)
    setShowProfileModal(false)
    setTempProfileName('')
    setTempProfileCollege('')
    await upsertUserProfile({
      displayName: name,
      username: nextUsername,
      college,
      avatarUrl,
    })

    if (pendingSendRef.current) {
      handleSend(pendingSendRef.current.roomId, name, college, pendingSendRef.current.contentOverride)
      pendingSendRef.current = null
    }
  }

  const closeProfileModal = () => {
    if (avatarUploading) return
    if (profileSheetCloseTimeoutRef.current !== null) {
      window.clearTimeout(profileSheetCloseTimeoutRef.current)
      profileSheetCloseTimeoutRef.current = null
    }
    profileSheetTouchStartYRef.current = null
    setProfileSheetDragging(false)
    applyProfileSheetOffset(0)
    setShowProfileModal(false)
    setTempProfileName('')
    setTempProfileCollege('')
  }

  const handleProfileButtonClick = () => {
    setTempProfileName(displayName)
    setTempProfileCollege(university)
    setShowProfileModal(true)
  }

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const userId = getCurrentUserId()
    if (!userId) {
      e.target.value = ''
      return
    }

    setAvatarUploading(true)
    try {
      const compressedFile = await compressAvatarFile(file)
      const filePath = `${userId}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressedFile, {
          upsert: true,
          contentType: 'image/jpeg',
        })

      if (uploadError) {
        console.error('[Users] avatar upload failed:', uploadError)
        return
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const nextAvatarUrl = `${data.publicUrl}?t=${Date.now()}`
      const { error: userError } = await supabase
        .from('users')
        .upsert({ uuid: userId, avatar_url: nextAvatarUrl }, { onConflict: 'uuid' })

      if (userError) {
        console.error('[Users] avatar update failed:', userError)
        return
      }

      setAvatarUrl(nextAvatarUrl)
      if (displayName.trim()) {
        displayNameToAvatarUrlRef.current[displayName.trim()] = nextAvatarUrl
      }
    } catch (error) {
      console.error('[Users] avatar processing failed:', error)
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  const handleProfileSheetTouchStart = (e: React.TouchEvent<HTMLFormElement>) => {
    if (profileSheetCloseTimeoutRef.current !== null) {
      window.clearTimeout(profileSheetCloseTimeoutRef.current)
      profileSheetCloseTimeoutRef.current = null
    }
    profileSheetTouchStartYRef.current = e.touches[0]?.clientY ?? null
    setProfileSheetDragging(true)
  }

  const handleProfileSheetTouchMove = (e: React.TouchEvent<HTMLFormElement>) => {
    const startY = profileSheetTouchStartYRef.current
    const currentY = e.touches[0]?.clientY

    if (startY === null || currentY === undefined) return

    const nextOffset = Math.max(0, currentY - startY)
    applyProfileSheetOffset(nextOffset)

    if (nextOffset > 0) e.preventDefault()
  }

  const handleProfileSheetTouchEnd = (e: React.TouchEvent<HTMLFormElement>) => {
    const startY = profileSheetTouchStartYRef.current
    const endY = e.changedTouches[0]?.clientY
    profileSheetTouchStartYRef.current = null
    setProfileSheetDragging(false)

    if (startY === null || endY === undefined) return

    const dragDistance = Math.max(0, endY - startY)
    const sheetHeight = profileSheetRef.current?.offsetHeight ?? 0
    const closeThreshold = sheetHeight > 0 ? Math.max(56, sheetHeight * 0.09) : 56

    if (dragDistance > closeThreshold) {
      const closeDistance = Math.max(sheetHeight + 72, dragDistance + 64)
      applyProfileSheetOffset(closeDistance)
      profileSheetCloseTimeoutRef.current = window.setTimeout(() => {
        profileSheetCloseTimeoutRef.current = null
        closeProfileModal()
      }, 180)
      return
    }

    applyProfileSheetOffset(0)
  }

  const isInteractiveGestureTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false

    return Boolean(
      target.closest(
        'input, textarea, button, select, option, label, a, [role="button"], [contenteditable="true"]'
      )
    )
  }, [])

  const handleRoomTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1 || isInteractiveGestureTarget(e.target)) {
      roomSwipeRef.current = null
      return
    }

    const touch = e.touches[0]
    roomSwipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastY: touch.clientY,
      isVerticalGesture: false,
    }
  }

  const handleRoomTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const swipeState = roomSwipeRef.current
    if (!swipeState || e.touches.length !== 1) return

    const touch = e.touches[0]
    const totalX = touch.clientX - swipeState.startX
    const totalY = touch.clientY - swipeState.startY

    if (!swipeState.isVerticalGesture) {
      if (Math.abs(totalX) < 8 && Math.abs(totalY) < 8) return
      if (Math.abs(totalY) <= Math.abs(totalX)) {
        roomSwipeRef.current = null
        return
      }
      swipeState.isVerticalGesture = true
    }

    const upwardDelta = swipeState.lastY - touch.clientY
    swipeState.lastY = touch.clientY

    if (upwardDelta <= 0) return

    let remainingDelta = upwardDelta
    const messageScrollEl = e.currentTarget.querySelector<HTMLDivElement>('.room-messages')

    if (messageScrollEl) {
      const remainingMessageScroll = Math.max(
        0,
        messageScrollEl.scrollHeight - messageScrollEl.clientHeight - messageScrollEl.scrollTop
      )

      if (remainingMessageScroll > 0) {
        const messageDelta = Math.min(remainingDelta, remainingMessageScroll)
        messageScrollEl.scrollTop += messageDelta
        remainingDelta -= messageDelta
      }
    }

    if (remainingDelta > 0 && containerRef.current) {
      containerRef.current.scrollTop += remainingDelta
    }

    e.preventDefault()
  }

  const handleRoomTouchEnd = () => {
    roomSwipeRef.current = null
  }

  const openReadOnlyProfile = (profile: ReadOnlyProfile) => {
    setReadOnlyProfile(profile)
  }

  const closeReadOnlyProfile = () => {
    setReadOnlyProfile(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, roomId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      handleSend(roomId)
    }
  }

  const renderMessageBody = (msg: Message) => {
    const gifUrl = getGifUrlFromMessage(msg.text)
    if (gifUrl) {
      return (
        <div className="msg-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gifUrl}
            alt={`${msg.username} sent a GIF`}
            className="msg-gif"
            draggable={false}
          />
        </div>
      )
    }

    return <div className="msg-text">{msg.text}</div>
  }

  if (!isMounted || !authReady) return null

  const hasSavedProfileName = Boolean(displayName.trim())
  const profileHandle = accountUsername.trim()
  const currentAvatarUrl = avatarUrl.trim()
  const hasAvatarPhoto = Boolean(currentAvatarUrl)
  const profilePreviewName = tempProfileName.trim() || displayName.trim() || 'User'
  const profilePreviewInitials = getInitials(profilePreviewName)
  const profilePreviewColor = getUserColor(profilePreviewName)
  const isComposerExpanded = isKeyboardOpen || Boolean(activeGifPickerRoomId) || Boolean(gifPickerClosingRoomId)
  const activeGifSearch = gifSearchInput.trim()

  return (
    <>
      <div className="rooms-container" ref={containerRef}>
        {rooms.map((room, index) => {
          const messages = roomMessages[room.id] || []
          const inputText = inputTexts[room.id] || ''
          const visibleMessageIds = visibleMessageIdsByRoom[room.id] || new Set<string>()
          const isCurrentRoom = index === currentRoomIndex
          const isGifPickerRendered = activeGifPickerRoomId === room.id || gifPickerClosingRoomId === room.id
          const isGifPickerClosing = gifPickerClosingRoomId === room.id
          const isGifPickerOpen = activeGifPickerRoomId === room.id && !isGifPickerClosing

          return (
            <div
              ref={isCurrentRoom ? activeRoomPanelRef : undefined}
              key={room.id}
              className={`room-panel${index === currentRoomIndex ? ' active-room' : ''}`}
              data-room-index={index}
              style={{ background: 'var(--bg)' }}
              onTouchStart={handleRoomTouchStart}
              onTouchMove={handleRoomTouchMove}
              onTouchEnd={handleRoomTouchEnd}
              onTouchCancel={handleRoomTouchEnd}
            >
              {/* Header */}
              <div className={`header${isComposerExpanded ? ' hidden' : ''}`}>
                <div className="header-side" aria-hidden="true" />
                <div className="logo">
                  <Image src="/spreadz-logo.png" alt="SpreadZ" className="logo-img" width={176} height={88} priority />
                </div>
                <div className="header-side">
                  <button
                    type="button"
                    className={`profile-avatar-btn${!hasAvatarPhoto && !displayName.trim() ? ' empty' : ''}`}
                    style={!hasAvatarPhoto && displayName.trim() ? { backgroundColor: getUserColor(displayName) } : undefined}
                    aria-label="Open profile"
                    onClick={handleProfileButtonClick}
                  >
                    {hasAvatarPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={currentAvatarUrl} src={currentAvatarUrl} alt="Your profile" className="profile-avatar-image" />
                    ) : displayName.trim() ? (
                      getInitials(displayName)
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 20a6 6 0 0 0-12 0" />
                        <circle cx="12" cy="10" r="4" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Headline card */}
              <div className={`ai-card-wrap${isComposerExpanded ? ' hidden' : ''}`}>
                  <div className={`ai-card${cardCollapsed ? ' compact' : ''}`}>
                    <div className="card-row">
                      <div className="card-label">
                        <span className="card-status-dot" aria-hidden="true" />
                        LIVE DISCUSSION
                      </div>
                    </div>
                    <div className="ai-headline">{room.headline}</div>
                    {!cardCollapsed && <div className="card-support">Only college students are allowed here.... ya we block others. Have fun! 😉</div>}
                </div>
              </div>

              {/* Messages */}
              <div
                ref={isCurrentRoom ? activeRoomMessagesRef : undefined}
                className="room-messages"
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); return false }}
              >
                <div ref={isCurrentRoom ? activeMessagesRef : undefined} className="messages">
                {messages.map((msg, msgIndex) => {
                    const isVisible = visibleMessageIds.has(msg.id)
                    if (!isVisible) return null

                    // To calculate grouping correctly we should only look at visible messages
                    const visibleMsgs = messages.filter(m => visibleMessageIds.has(m.id))
                    const visibleIndex = visibleMsgs.findIndex(m => m.id === msg.id)
                    const isFirstInGroup = visibleIndex === 0 || visibleMsgs[visibleIndex - 1].username !== msg.username
                    const isOwnMessage = msg.senderUsername === getCurrentUsername()
                    const showOwnMessageAvatar = isOwnMessage && hasAvatarPhoto
                    const messageAvatarUrl = showOwnMessageAvatar ? currentAvatarUrl : (msg.avatarUrl?.trim() || '')
                    const isReadOnlyProfileAvatar = isFirstInGroup && !isOwnMessage

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
                              <div
                                className={`avatar${isReadOnlyProfileAvatar ? ' clickable' : ''}`}
                                style={messageAvatarUrl ? undefined : { backgroundColor: getUserColor(msg.username) }}
                                onClick={isReadOnlyProfileAvatar ? (e) => {
                                  e.stopPropagation()
                                  openReadOnlyProfile({
                                    displayName: msg.username,
                                    college: msg.university,
                                    avatarUrl: messageAvatarUrl || null,
                                  })
                                } : undefined}
                              >
                                {messageAvatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={messageAvatarUrl}
                                    alt={`${msg.username} profile`}
                                    className="profile-avatar-image"
                                    style={{ borderRadius: '50%' }}
                                    draggable={false}
                                  />
                                ) : (
                                  msg.initials
                                )}
                              </div>
                              <div className="msg-content">
                                <div className="msg-header">
                                  <div className="msg-author">
                                    <span className="msg-username">{msg.username}</span>
                                    {msg.university && <span className="msg-university">{msg.university}</span>}
                                  </div>
                                  <span className="msg-timestamp">{msg.timestamp}</span>
                                </div>
                                {renderMessageBody(msg)}
                              </div>
                            </>
                          ) : (
                            <div className="msg-content continuation">
                              {renderMessageBody(msg)}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={(el) => { messageEndRefs.current[index] = el }} />
                </div>
              </div>

              <div ref={isCurrentRoom ? composerLayerRef : undefined} className="composer-layer">
                {isGifPickerRendered && (
                  <>
                    <button
                      type="button"
                      className={`gif-picker-backdrop${isGifPickerClosing ? ' closing' : ''}`}
                      aria-label="Close GIF picker"
                      onClick={() => closeGifPicker(room.id)}
                    />
                    <div
                      ref={bindGifPickerSheetRef}
                      className={`gif-picker${isGifPickerClosing ? ' closing' : ''}${gifPickerDragging ? ' dragging' : ''}`}
                      onClick={(e) => e.stopPropagation()}
                      onTouchStart={handleGifPickerTouchStart}
                      onTouchMove={handleGifPickerTouchMove}
                      onTouchEnd={() => handleGifPickerTouchEnd(room.id)}
                      onTouchCancel={() => {
                        clearGifPickerTouchState()
                        setGifPickerDragging(false)
                        applyGifPickerOffset(0)
                      }}
                    >
                      <div>
                        <div className="gif-picker-handle-zone">
                          <div className="gif-picker-handle" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="gif-search-shell">
                        <span className="gif-search-icon" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="7" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          className="gif-search-input"
                          placeholder="Search reactions, memes, moods..."
                          value={gifSearchInput}
                          onChange={(e) => setGifSearchInput(e.target.value)}
                          onFocus={() => setIsKeyboardOpen(true)}
                          onBlur={() => setIsKeyboardOpen(false)}
                        />
                        <span className="gif-search-state">
                          {activeGifSearch ? 'Search' : 'Trending'}
                        </span>
                      </div>
                      <div className="gif-picker-grid" onContextMenu={(e) => e.preventDefault()}>
                        {gifLoading && Array.from({ length: 9 }).map((_, skeletonIndex) => (
                          <div
                            key={`gif-skeleton-${skeletonIndex}`}
                            className="gif-skeleton"
                          />
                        ))}
                        {!gifLoading && gifError && <div className="gif-picker-status error">{gifError}</div>}
                        {!gifLoading && !gifError && gifResults.length === 0 && (
                          <div className="gif-picker-status">No GIFs found.</div>
                        )}
                        {!gifLoading && !gifError && gifResults.map((gif) => (
                          <button
                            key={gif.id}
                            type="button"
                            className="gif-tile"
                            onClick={() => handleGifSelect(room.id, gif.url)}
                            aria-label={`Send GIF: ${gif.title}`}
                          >
                            <div
                              className="gif-tile-media"
                              style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={gif.previewUrl}
                                alt={gif.title || 'GIF'}
                                className="gif-tile-image"
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                              />
                            </div>
                            <span className="gif-tile-badge">GIF</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div ref={isCurrentRoom ? composerAreaRef : undefined} className="input-area global-composer">
                  <div className={`hint${isComposerExpanded ? ' hidden' : ''}`}>
                    <span className="hint-badge">Swipe Up</span>
                    <span>for new people &amp; topics</span>
                  </div>
                  <form
                    ref={isCurrentRoom ? composerBarRef : undefined}
                    className="input-wrap"
                    autoComplete="off"
                    onSubmit={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleSend(room.id)
                    }}
                  >
                    <input
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-form-type="other"
                      enterKeyHint="send"
                      placeholder="What's on your mind?"
                      value={inputText}
                      onChange={(e) => {
                        setInputTexts(prev => ({ ...prev, [room.id]: e.target.value }))
                      }}
                      onKeyDown={(e) => handleKeyDown(e, room.id)}
                      onFocus={() => {
                        setIsKeyboardOpen(true)
                        if (activeGifPickerRoomId === room.id || gifPickerClosingRoomId === room.id) {
                          closeGifPicker(room.id, 18)
                        }
                        setActiveGifPickerRoomId(null)
                        requestAnimationFrame(() => {
                          syncComposerMetrics()
                        })
                      }}
                      onBlur={() => {
                        setIsKeyboardOpen(false)
                        requestAnimationFrame(() => {
                          syncComposerMetrics()
                        })
                      }}
                    />
                    <button
                      type="button"
                      className={`gif-btn${isGifPickerOpen ? ' active' : ''}`}
                      aria-label={isGifPickerOpen ? 'Close GIF picker' : 'Open GIF picker'}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const btn = e.currentTarget as HTMLButtonElement
                        btn.blur()
                        toggleGifPicker(room.id)
                      }}
                    >
                      <span className="gif-btn-icon" aria-hidden="true">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7.35 4.9h8.15A3.5 3.5 0 0 1 19 8.4v5.72A4.88 4.88 0 0 1 14.12 19H9.7a3.95 3.95 0 0 1-3.95-3.95V6.5A1.6 1.6 0 0 1 7.35 4.9Z" />
                          <path d="M14.85 19v-1.58a3.02 3.02 0 0 1 3.02-3.02H19" />
                          <circle cx="10.05" cy="10.6" r="0.52" fill="currentColor" stroke="none" />
                          <circle cx="14.2" cy="10.6" r="0.52" fill="currentColor" stroke="none" />
                          <path d="M9.72 14c.63.5 1.47.75 2.53.75 1.05 0 1.89-.25 2.52-.75" />
                        </svg>
                      </span>
                    </button>
                    <button
                      type="submit"
                      className="send-btn"
                      aria-label="Send"
                      onClick={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement
                        btn.blur()
                      }}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {readOnlyProfile && (
        <div className="profile-overlay" onClick={closeReadOnlyProfile}>
          <div className="profile-sheet view-only" onClick={(e) => e.stopPropagation()}>
            <div className="profile-avatar-section">
              <div
                className="profile-avatar-preview"
                style={!readOnlyProfile.avatarUrl ? { backgroundColor: getUserColor(readOnlyProfile.displayName) } : undefined}
              >
                {readOnlyProfile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={readOnlyProfile.avatarUrl}
                    alt={`${readOnlyProfile.displayName} profile`}
                    className="profile-avatar-image"
                    draggable={false}
                  />
                ) : (
                  <span>{getInitials(readOnlyProfile.displayName)}</span>
                )}
              </div>
            </div>
            <div className="sheet-handle" />
            <div className="profile-sheet-view-content">
              <div className="profile-sheet-view-name">{readOnlyProfile.displayName}</div>
              {readOnlyProfile.college && <div className="profile-sheet-view-college">{readOnlyProfile.college}</div>}
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div
          className="profile-overlay"
          onClick={() => {
            if (hasSavedProfileName) closeProfileModal()
          }}
        >
          <form
            ref={profileSheetRef}
            className={`profile-sheet${profileSheetDragging ? ' dragging' : ''}`}
            onSubmit={handleProfileSubmit}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleProfileSheetTouchStart}
            onTouchMove={handleProfileSheetTouchMove}
            onTouchEnd={handleProfileSheetTouchEnd}
            onTouchCancel={() => {
              profileSheetTouchStartYRef.current = null
              setProfileSheetDragging(false)
              applyProfileSheetOffset(0)
            }}
          >
            <div className="profile-avatar-section">
              <div
                className="profile-avatar-preview"
                style={!hasAvatarPhoto ? { backgroundColor: profilePreviewColor } : undefined}
                onClick={() => {
                  if (!avatarUploading) avatarInputRef.current?.click()
                }}
              >
                {hasAvatarPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`modal-${currentAvatarUrl}`} src={currentAvatarUrl} alt="Your profile" className="profile-avatar-image" />
                ) : (
                  <span>{profilePreviewInitials}</span>
                )}
                <button
                  type="button"
                  className="profile-avatar-camera"
                  aria-label={avatarUploading ? 'Uploading photo' : 'Upload profile photo'}
                  onClick={(e) => {
                    e.stopPropagation()
                    avatarInputRef.current?.click()
                  }}
                  disabled={avatarUploading}
                >
                  {avatarUploading ? (
                    <span className="profile-avatar-spinner" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 7h4l2-2h4l2 2h4v12H4Z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="profile-avatar-note">Faceless is sus. Just saying 👀</div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="profile-avatar-input"
                onChange={handleAvatarFileChange}
              />
              {avatarUploading && <div className="profile-avatar-status">Uploading photo...</div>}
            </div>
            <div className="sheet-handle" />
            {profileHandle && <div className="profile-username">@{profileHandle}</div>}
            <div className="profile-title">Your Profile</div>
            {hasSavedProfileName ? (
              <>
                <div className="profile-field">
                  <label className="profile-label">Display name</label>
                  <div className="profile-locked-value">{displayName}</div>
                  <div className="profile-locked-note">Your name is set in stone. No take-backs. 🪨</div>
                </div>
                <div className="profile-field">
                  <label className="profile-label">College</label>
                  <div className="profile-locked-value">{university || 'Not added yet'}</div>
                  <div className="profile-locked-note">College locked too. Own it.</div>
                </div>
              </>
            ) : (
              <>
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
                  <div className="profile-warning">Use your real name — we verify users. You get one name, one account.</div>
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
                <button type="submit" className="profile-submit">Save</button>
              </>
            )}
            <div className="profile-feedback-note">Feedback? Email us at spreadzapp@gmail.com</div>
          </form>
        </div>
      )}



      {menuOpen && (
        <div className="menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
            <button className="menu-item">
              <span className="menu-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.37.2.76.18 1.15V10a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1 .33 1.65 1.65 0 0 0-.51 1.07Z" />
                </svg>
              </span>
              <span className="menu-label">Settings</span>
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











































































