'use client'

import { useState, useRef, useEffect, useCallback, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { BackFeedbackModal } from '@/app/chat/components/BackFeedbackModal'
import { NotificationPopup } from '@/app/chat/components/NotificationPopup'
import { ProfileSheet, type ProfileSheetAction, type ProfileSheetProfile } from '@/app/chat/components/ProfileSheet'
import { useBackFeedbackIntercept } from '@/app/chat/hooks/useBackFeedbackIntercept'
import { getRenderableMessages } from '@/app/chat/message-visibility'
import { getRealtimeMessagePolicy } from '@/app/chat/realtime-message-policy'
import { supabase } from '@/lib/supabase'
import {
  trackRoomEnter,
  trackMessageSent,
  flushToSupabase,
} from '@/lib/friday'

interface Room {
  id: string
  headline: string
  created_at: string
  feed_position?: number | null
  message_count?: number | null
}

interface Message {
  id: string
  renderKey?: string
  username: string
  initials: string
  university: string
  text: string
  timestamp: string
  avatarUrl?: string | null
  created_at?: string
  room_name?: string | null
  room_id?: string | null
  user_uuid?: string | null
  senderUsername?: string | null
}

type MessageRow = {
  id: string
  content: string
  created_at: string
  display_name: string | null
  college: string | null
  room_name: string | null
  room_id: string | null
  user_uuid: string | null
}

type FetchMessagesOptions = {
  force?: boolean
  revealMode?: 'schedule' | 'instant'
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
  handle: string
  college: string
  avatarUrl: string | null
  joinedAt: string | null
  branch: string
  year: string
  bio: string
  interests: string[]
  favMovie: string
  relationshipStatus: string
  limitedByPrivacy: boolean
  reportMessage: Message | null
}

type ProfileModalMode = 'setup' | 'edit' | 'preview' | 'settings'

type ExtendedProfileFields = {
  branch: string
  year: string
  bio: string
  interests: string[]
  favMovie: string
  relationshipStatus: string
}

type ExtendedProfileDraft = {
  branch: string
  year: string
  bio: string
  interestsInput: string
  favMovie: string
  relationshipStatus: string
}

type RoomFeedStatus = 'idle' | 'loading' | 'ready' | 'error'
type RoomMessageStatus = 'idle' | 'loading' | 'ready' | 'error'

const EMPTY_MESSAGE_LIST: Message[] = []
const EMPTY_VISIBLE_MESSAGE_IDS = new Set<string>()
const EMPTY_EXTENDED_PROFILE: ExtendedProfileFields = {
  branch: '',
  year: '',
  bio: '',
  interests: [],
  favMovie: '',
  relationshipStatus: '',
}
const EMPTY_PROFILE_DRAFT: ExtendedProfileDraft = {
  branch: '',
  year: '',
  bio: '',
  interestsInput: '',
  favMovie: '',
  relationshipStatus: '',
}

type ChatStatusScreenProps = {
  eyebrow: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  showSpinner?: boolean
  tone?: 'default' | 'error'
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

const ROOM_SCROLL_EDGE_THRESHOLD_PX = 10
const ROOM_PROGRAMMATIC_SCROLL_SUPPRESS_MS = 500
const ROOM_DRAG_SETTLE_DURATION_MS = 260
const ROOM_DRAG_ACTIVATION_DELTA_PX = 8
const ROOM_DRAG_EDGE_THRESHOLD_PX = 12
const ROOM_DRAG_COMMIT_RATIO = 0.16
const ROOM_DRAG_COMMIT_MIN_PX = 72
const ROOM_DRAG_COMMIT_MAX_PX = 132
const ROOM_DRAG_VELOCITY_DISTANCE_MIN_PX = 36
const ROOM_DRAG_COMPLETE_VELOCITY_PX_PER_MS = 0.45
const USER_UUID_STORAGE_KEY = 'spreadz_user_uuid'
const DISPLAY_NAME_STORAGE_KEY = 'spreadz_display_name'
const USERNAME_STORAGE_KEY = 'spreadz_username'
const COLLEGE_STORAGE_KEY = 'spreadz_college'
const FRIENDS_STORAGE_KEY = 'spreadz_friends'
const SENT_ROOM_IDS_STORAGE_KEY_PREFIX = 'spreadz_sent_room_ids:'
const FRIEND_REQUEST_TTL_MS = 10 * 1000
const CLIENT_REFRESH_STORAGE_KEY = 'spreadz_client_refresh_version'
const CLIENT_REFRESH_VERSION = '2026-04-05-gif-sheet-slide'
const PUSH_PROMPT_MESSAGE_THRESHOLD = 4
const PUSH_PROMPT_STATUS_STORAGE_KEY = 'notifAsked'
const PUSH_SENT_COUNT_STORAGE_KEY = 'messageCount'
const NOTIFICATION_COOLDOWN_MS = 2500
const AVATAR_MAX_BYTES = 200 * 1024
const AVATAR_MAX_DIMENSION = 400
const AVATAR_QUALITY_STEPS = [0.7, 0.6, 0.5, 0.4, 0.3]
const GENERATED_USERNAME_REGEX = /^[a-z0-9_]{1,20}_[0-9]{4}$/
const GIF_MESSAGE_PREFIX = '[gif]:'
const GIPHY_API_KEY = 'xVwYwZtF5oenEwBNTkTQrhkvzUKDfa4o'
const GIPHY_LIMIT = 20
const GIF_PICKER_CLOSE_DURATION_MS = 200
const MESSAGE_MAX_LENGTH = 500
const MESSAGE_COUNTER_THRESHOLD = 400
const MESSAGE_SELECT_COLUMNS = 'id, content, created_at, display_name, college, room_name, room_id, user_uuid'
const GLOBAL_CHAT_POPUP_STORAGE_KEY = 'spreadz_global_chat_popup_seen_v2'
const GLOBAL_CHAT_POPUP_COPY = 'Gujarat University students are here... talk with students from different colleges of GU'
const GLOBAL_CHAT_POPUP_TRIGGER_DELAY_MS = 10 * 1000
const GLOBAL_CHAT_POPUP_AUTO_DISMISS_MS = 6 * 1000
const GLOBAL_CHAT_POPUP_MESSAGE_THRESHOLD = 4

const normalizeRoomFeed = (rooms: Room[]) => {
  const uniqueRoomsById = new Map<string, Room>()

  rooms.forEach((room) => {
    if (!room?.id) return
    if (typeof room.headline !== 'string' || room.headline.trim().length === 0) return
    uniqueRoomsById.set(room.id, room)
  })

  const normalizedRooms = Array.from(uniqueRoomsById.values()).sort((left, right) => {
    const leftPosition =
      typeof left.feed_position === 'number' ? left.feed_position : Number.MAX_SAFE_INTEGER
    const rightPosition =
      typeof right.feed_position === 'number' ? right.feed_position : Number.MAX_SAFE_INTEGER

    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition
    }

    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  })

  return normalizedRooms
}

const getAnchoredRoomFeedState = (
  nextRooms: Room[],
  previousActiveRoomId: string | null,
  currentRoomIndex: number
) => {
  const normalizedRooms = normalizeRoomFeed(nextRooms)
  const matchedRoomIndex = previousActiveRoomId
    ? normalizedRooms.findIndex((room) => room.id === previousActiveRoomId)
    : -1

  const nextRoomIndex =
    matchedRoomIndex >= 0
      ? matchedRoomIndex
      : Math.max(0, Math.min(currentRoomIndex, normalizedRooms.length - 1))

  return { normalizedRooms, nextRoomIndex }
}

const mergeRoomFeed = (currentRooms: Room[], incomingRooms: Room[]) => {
  const roomsById = new Map<string, Room>()

  currentRooms.forEach((room) => {
    if (!room?.id) return
    roomsById.set(room.id, room)
  })

  incomingRooms.forEach((room) => {
    if (!room?.id) return
    const currentRoom = roomsById.get(room.id)
    roomsById.set(room.id, currentRoom ? { ...currentRoom, ...room } : room)
  })

  return Array.from(roomsById.values())
}

const ChatStatusScreen = ({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
  showSpinner = false,
  tone = 'default',
}: ChatStatusScreenProps) => {
  return (
    <div className="chat-status-screen">
      <div className={`chat-status-card${tone === 'error' ? ' error' : ''}`}>
        <div className="chat-status-eyebrow">
          {showSpinner && <span className="chat-status-spinner" aria-hidden="true" />}
          <span>{eyebrow}</span>
        </div>
        <h1 className="chat-status-title">{title}</h1>
        <p className="chat-status-copy">{description}</p>
        {actionLabel && onAction && (
          <button type="button" className="chat-status-button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

const getMessageCreatedAtSortValue = (message: Message) => {
  const createdAt = typeof message.created_at === 'string' ? Date.parse(message.created_at) : Number.NaN
  return Number.isNaN(createdAt) ? Number.MAX_SAFE_INTEGER : createdAt
}

const mergeRoomMessageFeed = (currentMessages: Message[], incomingMessages: Message[]) => {
  const messageOrder = new Map<string, number>()
  const messagesById = new Map<string, Message>()

  currentMessages.forEach((message, index) => {
    messageOrder.set(message.id, index)
    messagesById.set(message.id, message)
  })

  incomingMessages.forEach((message) => {
    const currentMessage = messagesById.get(message.id)
    const mergedMessage = currentMessage
      ? { ...message, renderKey: currentMessage.renderKey ?? message.renderKey }
      : message

    messagesById.set(message.id, mergedMessage)

    if (!messageOrder.has(message.id)) {
      messageOrder.set(message.id, currentMessages.length + messageOrder.size)
    }
  })

  return Array.from(messagesById.values()).sort((left, right) => {
    const leftCreatedAt = getMessageCreatedAtSortValue(left)
    const rightCreatedAt = getMessageCreatedAtSortValue(right)

    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt
    }

    return (messageOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (messageOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  })
}

const isGeneratedUsername = (value: string) => GENERATED_USERNAME_REGEX.test(value)
const isGifMessage = (text: string) => text.startsWith(GIF_MESSAGE_PREFIX)
const getGifUrlFromMessage = (text: string) => isGifMessage(text) ? text.slice(GIF_MESSAGE_PREFIX.length).trim() : ''
const buildGifMessageContent = (url: string) => `${GIF_MESSAGE_PREFIX}${url}`
const clampComposerText = (value: string) => value.slice(0, MESSAGE_MAX_LENGTH)
const isComposerMessageEmpty = (value: string) => value.trim().length === 0
const isComposerMessageTooLong = (value: string) => value.length > MESSAGE_MAX_LENGTH

const getContentEditableSelectionOffsets = (element: HTMLElement) => {
  const contentLength = element.textContent?.length ?? 0

  if (typeof window === 'undefined') {
    return { start: contentLength, end: contentLength }
  }

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return { start: contentLength, end: contentLength }
  }

  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
    return { start: contentLength, end: contentLength }
  }

  const startRange = range.cloneRange()
  startRange.selectNodeContents(element)
  startRange.setEnd(range.startContainer, range.startOffset)
  const start = startRange.toString().length

  return {
    start,
    end: start + range.toString().length,
  }
}

const setContentEditableCaret = (element: HTMLElement, offset: number) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let traversedLength = 0

  while (walker.nextNode()) {
    const textNode = walker.currentNode
    const textLength = textNode.textContent?.length ?? 0

    if (traversedLength + textLength >= offset) {
      range.setStart(textNode, Math.max(0, offset - traversedLength))
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }

    traversedLength += textLength
  }

  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
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

const normalizeProfileText = (value: unknown) => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

const normalizeProfileInterests = (value: unknown) => {
  const sourceValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  const uniqueValues = new Set<string>()

  sourceValues.forEach((entry) => {
    const normalizedEntry = normalizeProfileText(entry)
    if (normalizedEntry) {
      uniqueValues.add(normalizedEntry)
    }
  })

  return Array.from(uniqueValues)
}

const buildProfileDraft = (profile: ExtendedProfileFields): ExtendedProfileDraft => ({
  branch: profile.branch,
  year: profile.year,
  bio: profile.bio,
  interestsInput: profile.interests.join(', '),
  favMovie: profile.favMovie,
  relationshipStatus: profile.relationshipStatus,
})

const buildExtendedProfileFields = (draft: ExtendedProfileDraft): ExtendedProfileFields => ({
  branch: draft.branch.trim(),
  year: draft.year.trim(),
  bio: draft.bio.trim(),
  interests: normalizeProfileInterests(draft.interestsInput),
  favMovie: draft.favMovie.trim(),
  relationshipStatus: draft.relationshipStatus.trim(),
})

const hasExtendedProfileContent = (profile: ExtendedProfileFields) => (
  Boolean(
    profile.branch
    || profile.year
    || profile.bio
    || profile.interests.length > 0
    || profile.favMovie
    || profile.relationshipStatus
  )
)

const isSameCollege = (left?: string | null, right?: string | null) => {
  const normalizedLeft = normalizeProfileText(left).toLowerCase()
  const normalizedRight = normalizeProfileText(right).toLowerCase()

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

const readStoredProfile = () => {
  const rawStoredUsername = localStorage.getItem(USERNAME_STORAGE_KEY)?.trim() || ''
  const storedDisplayName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)?.trim() || ''
  const storedCollege = localStorage.getItem(COLLEGE_STORAGE_KEY)?.trim() || ''

  let urlName = ''
  let urlCollege = ''
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    urlName = params.get('name')?.trim() || ''
    urlCollege = params.get('college')?.trim() || ''
  }

  const hasUrlProfile = urlName && urlCollege
  const activeDisplayName = hasUrlProfile ? urlName : storedDisplayName
  const activeCollege = hasUrlProfile ? urlCollege : storedCollege

  if (!activeDisplayName && rawStoredUsername && !isGeneratedUsername(rawStoredUsername)) {
    return {
      displayName: rawStoredUsername,
      username: '',
      college: activeCollege,
    }
  }

  return {
    displayName: activeDisplayName,
    username: rawStoredUsername,
    college: activeCollege,
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

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const normalizedBase64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(normalizedBase64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}

export default function GlobalChat() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomMessages, setRoomMessages] = useState<Record<string, Message[]>>({})
  const [roomMessageStatusByRoom, setRoomMessageStatusByRoom] = useState<Record<string, RoomMessageStatus>>({})
  const [seededAvatarMap, setSeededAvatarMap] = useState<Record<string, Record<string, string>>>({})
  const [inputTexts, setInputTexts] = useState<Record<string, string>>({})
  const [activeGifPickerRoomId, setActiveGifPickerRoomId] = useState<string | null>(null)
  const [gifSearchInput, setGifSearchInput] = useState('')
  const [gifResults, setGifResults] = useState<GifResult[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const [gifError, setGifError] = useState('')
  const [currentRoomIndex, setCurrentRoomIndex] = useState(0)
  const [cardCollapsed, setCardCollapsed] = useState(false)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [authErrorMessage, setAuthErrorMessage] = useState('')
  const [roomFeedStatus, setRoomFeedStatus] = useState<RoomFeedStatus>('idle')
  const [roomFeedErrorMessage, setRoomFeedErrorMessage] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [accountUsername, setAccountUsername] = useState('')
  const [university, setUniversity] = useState('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileModalMode, setProfileModalMode] = useState<ProfileModalMode>('edit')
  const [tempProfileName, setTempProfileName] = useState('')
  const [tempProfileCollege, setTempProfileCollege] = useState('')
  const [extendedProfile, setExtendedProfile] = useState<ExtendedProfileFields>(EMPTY_EXTENDED_PROFILE)
  const [profileDraft, setProfileDraft] = useState<ExtendedProfileDraft>(EMPTY_PROFILE_DRAFT)
  const [profileSaveState, setProfileSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [profileJoinedAt, setProfileJoinedAt] = useState<string | null>(null)
  const [searchSettingsQuery, setSearchSettingsQuery] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [profileSheetDragging, setProfileSheetDragging] = useState(false)
  const [visibleMessageIdsByRoom, setVisibleMessageIdsByRoom] = useState<Record<string, Set<string>>>({})
  const [reportSheetMessage, setReportSheetMessage] = useState<Message | null>(null)
  const [readOnlyProfile, setReadOnlyProfile] = useState<ReadOnlyProfile | null>(null)
  const [reportStatus, setReportStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [muteStatus, setMuteStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [muteStateReady, setMuteStateReady] = useState(false)
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set())
  const [sheetClosing, setSheetClosing] = useState(false)
  const [friendsSheetOpen, setFriendsSheetOpen] = useState(false)
  const [notificationSheetOpen, setNotificationSheetOpen] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState<'idle' | 'enabling' | 'enabled' | 'unsupported' | 'error'>('idle')
  const [notificationErrorMessage, setNotificationErrorMessage] = useState('')
  const [friends, setFriends] = useState<{ id: string; username: string }[]>([])
  const [activeFriendRequest, setActiveFriendRequest] = useState<FriendRequest | null>(null)
  const [, setFriendRequestQueue] = useState<FriendRequest[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [backFeedbackModalOpen, setBackFeedbackModalOpen] = useState(false)
  const [userJoinedAtByRoom, setUserJoinedAtByRoom] = useState<Record<string, number>>({})
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [ghostRevealCountByRoom, setGhostRevealCountByRoom] = useState<Record<string, number>>({})
  const [loadedAvatarUrls, setLoadedAvatarUrls] = useState<Set<string>>(new Set())
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [showGlobalChatPopup, setShowGlobalChatPopup] = useState(false)
  const longPressTimerRef = useRef<number | null>(null)
  const userIdRef = useRef<string>('')
  const displayNameToUsernameRef = useRef<Record<string, string>>({})
  const displayNameToAvatarUrlRef = useRef<Record<string, string>>({})
  const roomIdsRef = useRef<Set<string>>(new Set())
  const roomFeedFetchRequestIdRef = useRef(0)
  const roomMessageFetchRequestIdByRoomRef = useRef<Record<string, number>>({})
  const roomFeedRealtimeFiredRef = useRef(false)
  const sentRoomIdsRef = useRef<Set<string>>(new Set())
  const roomsContainerRef = useRef<HTMLDivElement | null>(null)
  const preloadingUrlsRef = useRef<Set<string>>(new Set())

  const preloadImage = useCallback((url: string) => {
    if (!url || preloadingUrlsRef.current.has(url)) return
    preloadingUrlsRef.current.add(url)
    
    const img = document.createElement('img')
    img.src = url
    img.onload = () => {
      setLoadedAvatarUrls(prev => new Set(prev).add(url))
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      setCurrentTime(now)

      // Recompute ghost reveal counts so the scroll effect can react
      setGhostRevealCountByRoom(prev => {
        let changed = false
        const next = { ...prev }

        Object.entries(userJoinedAtByRoom).forEach(([roomId, joinedAt]) => {
          const msgs = roomMessages[roomId]
          if (!msgs) return
          const scriptMsg = msgs.find(m => m.username === 'SYSTEM_SEEDING_SCRIPT')
          if (!scriptMsg) return

          try {
            const script = JSON.parse(scriptMsg.text) as any[]
            const elapsed = (now - joinedAt) / 1000
            const revealed = script.filter(m => m.postAtSeconds <= elapsed).length
            if (revealed !== prev[roomId]) {
              next[roomId] = revealed
              changed = true
            }
          } catch {
            // ignore parse errors
          }
        })

        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userJoinedAtByRoom, roomMessages])

  useEffect(() => {
    // Preload seeded avatars
    Object.values(seededAvatarMap).forEach(roomMap => {
      Object.values(roomMap).forEach(url => {
        preloadImage(url)
      })
    })
    
    // Preload own avatar
    if (avatarUrl) {
      preloadImage(avatarUrl)
    }
  }, [seededAvatarMap, avatarUrl, preloadImage])

  useEffect(() => {
    rooms.forEach(room => {
      const msgs = roomMessages[room.id]
      if (msgs && !userJoinedAtByRoom[room.id]) {
        const hasScript = msgs.some(m => m.username === 'SYSTEM_SEEDING_SCRIPT')
        if (hasScript) {
          setUserJoinedAtByRoom(prev => ({ ...prev, [room.id]: Date.now() }))
        }
      }
    })
  }, [rooms, roomMessages, userJoinedAtByRoom])
  const roomPanelRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const messageEndRefs = useRef<(HTMLDivElement | null)[]>([])
  const channelRef = useRef<any>(null)
  const roomsChannelRef = useRef<any>(null)
  const muteChannelRef = useRef<any>(null)
  const friendRequestChannelRef = useRef<any>(null)
  const friendRequestsLoadedRef = useRef(false)
  const activeRoomMessagesRef = useRef<HTMLDivElement | null>(null)
  const activeMessagesRef = useRef<HTMLDivElement | null>(null)
  const composerLayerRef = useRef<HTMLDivElement | null>(null)
  const composerAreaRef = useRef<HTMLDivElement | null>(null)
  const composerBarRef = useRef<HTMLDivElement | null>(null)
  const gifPickerSheetRef = useRef<HTMLDivElement | null>(null)
  const gifPickerGridRef = useRef<HTMLDivElement | null>(null)
  const fetchedRoomsRef = useRef<Set<string>>(new Set())
  const pendingSendRef = useRef<{ roomId: string; contentOverride?: string } | null>(null)
  const pendingOutgoingMessageIdsRef = useRef<Map<string, string>>(new Map())
  const pendingGifLoadScrollRoomIdRef = useRef<string | null>(null)
  const gifPickerTouchStartYRef = useRef<number | null>(null)
  const gifPickerOffsetYRef = useRef(0)
  const gifPickerPendingOffsetYRef = useRef(0)
  const gifPickerCloseTimeoutRef = useRef<number | null>(null)
  const gifPickerFrameRef = useRef<number | null>(null)
  const gifPickerDraggedRef = useRef(false)
  const gifPickerSheetDraggingRef = useRef(false)
  const gifPickerTouchScrollRef = useRef<HTMLDivElement | null>(null)
  const notifiedMessageKeysRef = useRef<Set<string>>(new Set())
  const notificationCooldownUntilRef = useRef(0)
  const globalChatPopupTriggerTimeoutRef = useRef<number | null>(null)
  const globalChatPopupDismissTimeoutRef = useRef<number | null>(null)
  const hasTriggeredGlobalChatPopupRef = useRef(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const presenceChannelRef = useRef<any>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isCurrentlyTypingRef = useRef(false)
  const profileSheetRef = useRef<HTMLFormElement>(null)
  const currentRoomIndexRef = useRef(0)
  const activeRoomIdRef = useRef<string | null>(null)
  const realtimeMessageHandlerRef = useRef<(messageRow: any) => void>(() => {})
  const dragStartYRef = useRef<number | null>(null)
  const dragCurrentYRef = useRef<number | null>(null)
  const dragOffsetYRef = useRef(0)
  const dragDirectionRef = useRef<'next' | 'prev' | null>(null)
  const transitionTargetIndexRef = useRef<number | null>(null)
  const isDraggingRoomRef = useRef(false)
  const isAnimatingRoomRef = useRef(false)
  const dragActivePanelRef = useRef<HTMLDivElement | null>(null)
  const dragTargetPanelRef = useRef<HTMLDivElement | null>(null)
  const dragViewportHeightRef = useRef(0)
  const dragLastSampleYRef = useRef<number | null>(null)
  const dragLastSampleTimeRef = useRef<number | null>(null)
  const dragVelocityYRef = useRef(0)
  const roomDragFrameRef = useRef<number | null>(null)
  const roomTransitionTimeoutRef = useRef<number | null>(null)
  const profileSheetTouchStartYRef = useRef<number | null>(null)
  const profileSheetOffsetYRef = useRef(0)
  const profileSheetFrameRef = useRef<number | null>(null)
  const profileSheetCloseTimeoutRef = useRef<number | null>(null)
  const pendingProfileReportMessageRef = useRef<Message | null>(null)
  const readOnlyProfileRequestIdRef = useRef(0)
  const roomIsAtBottomByIdRef = useRef<Record<string, boolean>>({})
  const roomHasUserScrolledByIdRef = useRef<Record<string, boolean>>({})
  const roomProgrammaticScrollUntilByIdRef = useRef<Record<string, number>>({})
  const activeRoomId = rooms[currentRoomIndex]?.id ?? null
  const activeRoomMessagesList = activeRoomId ? (roomMessages[activeRoomId] ?? EMPTY_MESSAGE_LIST) : EMPTY_MESSAGE_LIST
  const activeRoomVisibleMessageIds = activeRoomId ? (visibleMessageIdsByRoom[activeRoomId] ?? EMPTY_VISIBLE_MESSAGE_IDS) : EMPTY_VISIBLE_MESSAGE_IDS

  const openBackFeedbackModal = useCallback(() => {
    setBackFeedbackModalOpen(true)
  }, [])

  const closeBackFeedbackModal = useCallback(() => {
    setBackFeedbackModalOpen(false)
  }, [])

  useBackFeedbackIntercept(openBackFeedbackModal)

  useEffect(() => {
    currentRoomIndexRef.current = currentRoomIndex
  }, [currentRoomIndex])

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId
  }, [activeRoomId])

  const scrollRoomFeedToIndex = useCallback((roomIndex: number, behavior: ScrollBehavior = 'smooth') => {
    if (roomIndex < 0) return

    const container = roomsContainerRef.current
    if (!container) return

    container.scrollTo({
      top: roomIndex * container.clientHeight,
      behavior,
    })
  }, [])

  const syncComposerText = useCallback((roomId: string, value: string) => {
    setInputTexts(prev => {
      if (prev[roomId] === value) return prev
      return { ...prev, [roomId]: value }
    })
  }, [])

  const handleComposerInput = useCallback((roomId: string, element: HTMLDivElement) => {
    const rawText = element.textContent || ''
    const nextText = clampComposerText(rawText)

    if (rawText !== nextText) {
      element.textContent = nextText
      setContentEditableCaret(element, nextText.length)
    }

    syncComposerText(roomId, nextText)

    if (roomId === activeRoomIdRef.current) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)

      if (!isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = true
        presenceChannelRef.current?.track({
          isTyping: true,
          name: displayName || accountUsername || 'Anonymous',
        })
      }

      typingTimeoutRef.current = setTimeout(() => {
        isCurrentlyTypingRef.current = false
        presenceChannelRef.current?.track({
          isTyping: false,
          name: displayName || accountUsername || 'Anonymous',
        })
      }, 2000)
    }
  }, [syncComposerText, displayName, accountUsername])


  const handleComposerBeforeInput = useCallback((event: FormEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent

    if (nativeEvent.inputType === 'insertParagraph' || nativeEvent.inputType === 'insertLineBreak') {
      event.preventDefault()
      return
    }

    if (!nativeEvent.inputType?.startsWith('insert')) return

    const insertedText = nativeEvent.data ?? ''
    if (!insertedText) return

    const currentText = event.currentTarget.textContent || ''
    const { start, end } = getContentEditableSelectionOffsets(event.currentTarget)
    const nextLength = currentText.length - (end - start) + insertedText.length

    if (nextLength > MESSAGE_MAX_LENGTH) {
      event.preventDefault()
    }
  }, [])

  const handleComposerPaste = useCallback((roomId: string, event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()

    const pastedText = event.clipboardData.getData('text')
    if (!pastedText) return

    const currentText = event.currentTarget.textContent || ''
    const { start, end } = getContentEditableSelectionOffsets(event.currentTarget)
    const availableLength = MESSAGE_MAX_LENGTH - (currentText.length - (end - start))

    if (availableLength <= 0) return

    const insertedText = pastedText.slice(0, availableLength)
    const nextText = `${currentText.slice(0, start)}${insertedText}${currentText.slice(end)}`

    event.currentTarget.textContent = nextText
    setContentEditableCaret(event.currentTarget, start + insertedText.length)
    syncComposerText(roomId, nextText)
  }, [syncComposerText])

  const syncComposerMetrics = useCallback(() => {
    if (typeof window === 'undefined') return

    // keyboard handled by interactiveWidget: resizes-content + dvh
    const root = document.documentElement
    const composerAreaStyles = composerAreaRef.current ? window.getComputedStyle(composerAreaRef.current) : null
    const composerPaddingTop = composerAreaStyles ? Number.parseFloat(composerAreaStyles.paddingTop) || 0 : 0
    const composerPaddingBottom = composerAreaStyles ? Number.parseFloat(composerAreaStyles.paddingBottom) || 0 : 0
    const composerBarHeight = composerBarRef.current?.getBoundingClientRect().height ?? 0
    const reservedSpace = Math.ceil(composerBarHeight + composerPaddingTop + composerPaddingBottom)
    root.style.setProperty('--composer-reserved-space', `${reservedSpace}px`)
  }, [])

  const isMessageListAtBottom = useCallback((element: HTMLDivElement | null) => {
    if (!element) return true

    return element.scrollTop + element.clientHeight >= element.scrollHeight - ROOM_SCROLL_EDGE_THRESHOLD_PX
  }, [])

  const setRoomBottomState = useCallback((roomId: string | null, isAtBottom: boolean) => {
    if (!roomId) return

    roomIsAtBottomByIdRef.current[roomId] = isAtBottom
    const hasUserScrolled = roomHasUserScrolledByIdRef.current[roomId] ?? false

    if (roomId === activeRoomId) {
      setShowJumpToLatest(hasUserScrolled && !isAtBottom)
    }
  }, [activeRoomId])

  const updateRoomBottomState = useCallback((roomId: string, element: HTMLDivElement | null) => {
    if (!roomId || !element) return

    const isAtBottom = isMessageListAtBottom(element)
    const programmaticScrollUntil = roomProgrammaticScrollUntilByIdRef.current[roomId] ?? 0
    const isProgrammaticScroll = Date.now() < programmaticScrollUntil

    if (!isProgrammaticScroll) {
      roomHasUserScrolledByIdRef.current[roomId] = true
    }

    setRoomBottomState(roomId, isAtBottom)
  }, [isMessageListAtBottom, setRoomBottomState])

  const syncActiveRoomBottomState = useCallback(() => {
    if (!activeRoomId) {
      setShowJumpToLatest(false)
      return
    }

    const element = activeRoomMessagesRef.current
    if (!element) {
      setShowJumpToLatest(false)
      return
    }

    setRoomBottomState(activeRoomId, isMessageListAtBottom(element))
  }, [activeRoomId, isMessageListAtBottom, setRoomBottomState])

  const scrollCurrentRoomToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const scrollElement = activeRoomMessagesRef.current
    const endEl = messageEndRefs.current[currentRoomIndex]
    if (!endEl && !scrollElement) return

    if (activeRoomId) {
      roomProgrammaticScrollUntilByIdRef.current[activeRoomId] = Date.now() + ROOM_PROGRAMMATIC_SCROLL_SUPPRESS_MS
    }

    if (endEl) {
      endEl.scrollIntoView({ behavior, block: 'end' })
    }

    if (scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight
    }

    setRoomBottomState(activeRoomId, true)
  }, [activeRoomId, currentRoomIndex, setRoomBottomState])

  const handleGifMediaLoad = useCallback((roomId?: string | null) => {
    if (!roomId || roomId !== activeRoomId) return

    if (typeof window === 'undefined') return

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const element = activeRoomMessagesRef.current
        if (!element) return

        const shouldScroll =
          pendingGifLoadScrollRoomIdRef.current === roomId ||
          (roomIsAtBottomByIdRef.current[roomId] ?? false)

        if (!shouldScroll) return

        pendingGifLoadScrollRoomIdRef.current = null
        scrollCurrentRoomToBottom('auto')
        element.scrollTop = element.scrollHeight
        setRoomBottomState(roomId, true)
      })
    })
  }, [activeRoomId, scrollCurrentRoomToBottom, setRoomBottomState])

  const clearRoomDragFrame = useCallback(() => {
    if (roomDragFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(roomDragFrameRef.current)
      roomDragFrameRef.current = null
    }
  }, [])

  const clearRoomPanelStyles = useCallback((indexes: number[]) => {
    indexes.forEach((index) => {
      const panel = roomPanelRefs.current[index]
      if (!panel) return

      panel.style.transform = ''
      panel.style.transition = ''
      panel.style.willChange = ''
      panel.style.pointerEvents = ''
      panel.style.zIndex = ''
    })
  }, [])

  const resetRoomGestureState = useCallback(() => {
    dragStartYRef.current = null
    dragCurrentYRef.current = null
    dragOffsetYRef.current = 0
    dragDirectionRef.current = null
    transitionTargetIndexRef.current = null
    dragActivePanelRef.current = null
    dragTargetPanelRef.current = null
    dragViewportHeightRef.current = 0
    dragLastSampleYRef.current = null
    dragLastSampleTimeRef.current = null
    dragVelocityYRef.current = 0
    isDraggingRoomRef.current = false
  }, [])

  const scheduleRoomDragPaint = useCallback(() => {
    if (roomDragFrameRef.current !== null || typeof window === 'undefined') return

    roomDragFrameRef.current = window.requestAnimationFrame(() => {
      roomDragFrameRef.current = null

      const direction = dragDirectionRef.current
      const activePanel = dragActivePanelRef.current
      const targetPanel = dragTargetPanelRef.current

      if (!activePanel || !targetPanel || !direction) return

      const viewportHeight = dragViewportHeightRef.current || activePanel.offsetHeight || window.innerHeight
      const offset = dragOffsetYRef.current

      activePanel.style.transition = 'none'
      targetPanel.style.transition = 'none'
      activePanel.style.willChange = 'transform'
      targetPanel.style.willChange = 'transform'
      activePanel.style.pointerEvents = 'auto'
      targetPanel.style.pointerEvents = 'none'
      activePanel.style.zIndex = '2'
      targetPanel.style.zIndex = '3'
      activePanel.style.transform = `translate3d(0, ${offset}px, 0)`
      targetPanel.style.transform = direction === 'next'
        ? `translate3d(0, ${viewportHeight + offset}px, 0)`
        : `translate3d(0, ${-viewportHeight + offset}px, 0)`
    })
  }, [])

  const settleRoomPanels = useCallback((shouldComplete: boolean) => {
    const fromIndex = currentRoomIndexRef.current
    const targetIndex = transitionTargetIndexRef.current
    const direction = dragDirectionRef.current
    const cleanupIndexes = [fromIndex, ...(targetIndex === null ? [] : [targetIndex])]
    const activePanel = dragActivePanelRef.current ?? roomPanelRefs.current[fromIndex]
    const targetPanel = dragTargetPanelRef.current ?? (targetIndex === null ? null : roomPanelRefs.current[targetIndex])

    clearRoomDragFrame()

    if (!activePanel || !targetPanel || !direction || targetIndex === null || typeof window === 'undefined') {
      clearRoomPanelStyles(cleanupIndexes)
      resetRoomGestureState()
      isAnimatingRoomRef.current = false
      return
    }

    const viewportHeight = dragViewportHeightRef.current || activePanel.offsetHeight || window.innerHeight
    const offscreenTargetY = direction === 'next' ? viewportHeight : -viewportHeight
    const completedActiveY = direction === 'next' ? -viewportHeight : viewportHeight

    isDraggingRoomRef.current = false
    isAnimatingRoomRef.current = true

    activePanel.style.transition = `transform ${ROOM_DRAG_SETTLE_DURATION_MS}ms ease-out`
    targetPanel.style.transition = `transform ${ROOM_DRAG_SETTLE_DURATION_MS}ms ease-out`
    activePanel.style.willChange = 'transform'
    targetPanel.style.willChange = 'transform'
    activePanel.style.pointerEvents = 'none'
    targetPanel.style.pointerEvents = 'none'
    activePanel.style.zIndex = '2'
    targetPanel.style.zIndex = '3'
    activePanel.style.transform = shouldComplete
      ? `translate3d(0, ${completedActiveY}px, 0)`
      : 'translate3d(0, 0, 0)'
    targetPanel.style.transform = shouldComplete
      ? 'translate3d(0, 0, 0)'
      : `translate3d(0, ${offscreenTargetY}px, 0)`

    if (roomTransitionTimeoutRef.current !== null) {
      window.clearTimeout(roomTransitionTimeoutRef.current)
    }

    roomTransitionTimeoutRef.current = window.setTimeout(() => {
      if (shouldComplete) {
        currentRoomIndexRef.current = targetIndex
        setCurrentRoomIndex(targetIndex)
      }

      window.requestAnimationFrame(() => {
        clearRoomPanelStyles(cleanupIndexes)
        resetRoomGestureState()
        isAnimatingRoomRef.current = false
        roomTransitionTimeoutRef.current = null
      })
    }, ROOM_DRAG_SETTLE_DURATION_MS)
  }, [clearRoomDragFrame, clearRoomPanelStyles, resetRoomGestureState])

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (isAnimatingRoomRef.current || e.touches.length !== 1) {
      resetRoomGestureState()
      return
    }

    dragStartYRef.current = e.touches[0].clientY
    dragCurrentYRef.current = e.touches[0].clientY
    dragOffsetYRef.current = 0
    dragDirectionRef.current = null
    transitionTargetIndexRef.current = null
    isDraggingRoomRef.current = false
  }, [resetRoomGestureState])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (isAnimatingRoomRef.current || e.touches.length !== 1) return

    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    const startY = dragStartYRef.current
    if (startY === null) return

    const currentY = e.touches[0].clientY
    const deltaY = currentY - startY
    const messageScrollEl = activeRoomMessagesRef.current
    if (!messageScrollEl) return

    dragCurrentYRef.current = currentY

    if (!isDraggingRoomRef.current) {
      if (Math.abs(deltaY) < ROOM_DRAG_ACTIVATION_DELTA_PX) return

      const atTop = messageScrollEl.scrollTop <= ROOM_DRAG_EDGE_THRESHOLD_PX
      const atBottom = messageScrollEl.scrollTop + messageScrollEl.clientHeight >= messageScrollEl.scrollHeight - ROOM_DRAG_EDGE_THRESHOLD_PX
      const roomIndex = currentRoomIndexRef.current
      const hasPrevRoom = roomIndex > 0
      const hasNextRoom = roomIndex < rooms.length - 1

      let dragDirection: 'next' | 'prev' | null = null
      let targetIndex: number | null = null

      if (deltaY > 0 && atTop && hasPrevRoom) {
        dragDirection = 'prev'
        targetIndex = roomIndex - 1
      } else if (deltaY < 0 && atBottom && hasNextRoom) {
        dragDirection = 'next'
        targetIndex = roomIndex + 1
      } else {
        return
      }

      const activePanel = roomPanelRefs.current[roomIndex]
      const targetPanel = targetIndex === null ? null : roomPanelRefs.current[targetIndex]
      if (!activePanel || !targetPanel || !dragDirection || targetIndex === null) return

      isDraggingRoomRef.current = true
      dragDirectionRef.current = dragDirection
      transitionTargetIndexRef.current = targetIndex
      dragActivePanelRef.current = activePanel
      dragTargetPanelRef.current = targetPanel
      dragViewportHeightRef.current = activePanel.offsetHeight || window.innerHeight
      dragLastSampleYRef.current = currentY
      dragLastSampleTimeRef.current = performance.now()
      dragVelocityYRef.current = 0
    }

    const viewportHeight = dragViewportHeightRef.current || window.innerHeight
    const direction = dragDirectionRef.current
    if (!direction) return

    const now = performance.now()
    const previousSampleY = dragLastSampleYRef.current
    const previousSampleTime = dragLastSampleTimeRef.current
    if (previousSampleY !== null && previousSampleTime !== null && now > previousSampleTime) {
      dragVelocityYRef.current = (currentY - previousSampleY) / (now - previousSampleTime)
    }
    dragLastSampleYRef.current = currentY
    dragLastSampleTimeRef.current = now

    if (e.cancelable) {
      e.preventDefault()
    }

    dragOffsetYRef.current = direction === 'next'
      ? Math.max(-viewportHeight, Math.min(0, deltaY))
      : Math.min(viewportHeight, Math.max(0, deltaY))

    scheduleRoomDragPaint()
  }, [rooms.length, scheduleRoomDragPaint])

  const handleTouchEnd = useCallback(() => {
    const startY = dragStartYRef.current
    const releaseY = dragCurrentYRef.current
    dragStartYRef.current = null
    dragCurrentYRef.current = null

    if (!isDraggingRoomRef.current) {
      resetRoomGestureState()
      return
    }

    const activePanel = roomPanelRefs.current[currentRoomIndexRef.current]
    const viewportHeight = activePanel?.getBoundingClientRect().height || (typeof window !== 'undefined' ? window.innerHeight : 0)
    const completionThreshold = Math.min(
      Math.max(viewportHeight * ROOM_DRAG_COMMIT_RATIO, ROOM_DRAG_COMMIT_MIN_PX),
      ROOM_DRAG_COMMIT_MAX_PX
    )
    const dragDistance = startY === null || releaseY === null
      ? dragOffsetYRef.current
      : releaseY - startY
    const direction = dragDirectionRef.current
    const directionalVelocity = direction === 'next'
      ? -dragVelocityYRef.current
      : dragVelocityYRef.current
    const velocityCompletes = Math.abs(dragDistance) >= ROOM_DRAG_VELOCITY_DISTANCE_MIN_PX
      && directionalVelocity >= ROOM_DRAG_COMPLETE_VELOCITY_PX_PER_MS

    settleRoomPanels(Math.abs(dragDistance) >= completionThreshold || velocityCompletes)
  }, [resetRoomGestureState, settleRoomPanels])

  const handleTouchCancel = useCallback(() => {
    dragStartYRef.current = null
    dragCurrentYRef.current = null

    if (!isDraggingRoomRef.current) {
      resetRoomGestureState()
      return
    }

    settleRoomPanels(false)
  }, [resetRoomGestureState, settleRoomPanels])

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

  const scrollProfileFieldIntoView = useCallback((target?: EventTarget | null) => {
    const sheet = profileSheetRef.current
    if (!sheet || !(target instanceof HTMLElement) || !sheet.contains(target)) return

    window.setTimeout(() => {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
    }, 180)
  }, [])

  const fetchGifResults = useCallback(async (query: string, signal?: AbortSignal) => {
    const trimmedQuery = query.trim()
    const endpoint = trimmedQuery
      ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(trimmedQuery)}&limit=${GIPHY_LIMIT}&rating=g`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${GIPHY_LIMIT}&rating=g`

    const response = await fetch(endpoint, { signal })
    if (!response.ok) {
      throw new Error(`Giphy request failed with ${response.status}`)
    }

    const payload = await response.json()
    const results = Array.isArray(payload?.data) ? payload.data : []

    return results
      .map((item: any) => {
        const original = item?.images?.original
        const fixedHeight = item?.images?.fixed_height
        const fixedHeightStill = item?.images?.fixed_height_still

        return {
          id: typeof item?.id === 'string' ? item.id : '',
          url: typeof original?.url === 'string' ? original.url : '',
          previewUrl: typeof fixedHeightStill?.url === 'string' ? fixedHeightStill.url : '',
          title: typeof item?.title === 'string' ? item.title : 'GIF',
          width: Number(fixedHeight?.width) || 200,
          height: Number(fixedHeight?.height) || 200,
        }
      })
      .filter((item: GifResult) => item.id && item.url && item.previewUrl)
  }, [])

  useEffect(() => {
    let cancelled = false
    const initAuth = async () => {
      setAuthErrorMessage('')
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        console.error('[Auth] getSession failed:', sessionError)
      }
      let user = sessionData?.session?.user ?? null

      if (!user) {
        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously()
        if (signInError) {
          console.error('[Auth] anonymous sign-in failed:', signInError)
          if (!cancelled) {
            setAuthErrorMessage('We could not start your chat session. Please reload and try again.')
          }
          return
        }
        user = signInData?.user ?? null
      }

      if (!user || cancelled) return
      userIdRef.current = user.id
      localStorage.setItem(USER_UUID_STORAGE_KEY, user.id)
      setAuthErrorMessage('')
      setAuthReady(true)
    }

    initAuth()
    return () => {
      cancelled = true
    }
  }, [])

  const normalizeMessageRow = useCallback((value: any): MessageRow | null => {
    const id = typeof value?.id === 'string' ? value.id.trim() : ''
    const content = typeof value?.content === 'string' ? value.content : ''
    const createdAt = typeof value?.created_at === 'string' ? value.created_at : ''

    if (!id || !content || !createdAt) {
      return null
    }

    return {
      id,
      content,
      created_at: createdAt,
      display_name: typeof value?.display_name === 'string' ? value.display_name : null,
      college: typeof value?.college === 'string' ? value.college : null,
      room_name: typeof value?.room_name === 'string' ? value.room_name : null,
      room_id: typeof value?.room_id === 'string' ? value.room_id : null,
      user_uuid: typeof value?.user_uuid === 'string' ? value.user_uuid : null,
    }
  }, [])

  const normalizeRoomRow = useCallback((value: any): Room | null => {
    const id = typeof value?.id === 'string' ? value.id.trim() : ''
    const headline = typeof value?.headline === 'string' ? value.headline : ''
    const createdAt = typeof value?.created_at === 'string' ? value.created_at : ''

    if (!id || !createdAt) {
      return null
    }

    return {
      id,
      headline,
      created_at: createdAt,
      feed_position: typeof value?.feed_position === 'number' ? value.feed_position : null,
      message_count: typeof value?.message_count === 'number' ? value.message_count : null,
    }
  }, [])

  const getPendingMessageKey = useCallback((value: Pick<MessageRow, 'room_id' | 'display_name' | 'content'>) => {
    const roomId = typeof value.room_id === 'string' ? value.room_id.trim() : ''
    const displayName = typeof value.display_name === 'string' ? value.display_name.trim() : ''
    const content = typeof value.content === 'string' ? value.content.trim() : ''

    if (!roomId || !displayName || !content) {
      return ''
    }

    return `${roomId}::${displayName}::${content}`
  }, [])

  const setInstantVisibleMessageIds = useCallback((roomId: string, msgs: Message[]) => {
    setVisibleMessageIdsByRoom(prev => ({
      ...prev,
      [roomId]: new Set(msgs.map(message => message.id)),
    }))
  }, [])

  const replaceVisibleMessageId = useCallback((roomId: string, fromId: string, toId: string) => {
    if (!roomId || !fromId || !toId || fromId === toId) return

    setVisibleMessageIdsByRoom(prev => {
      const roomVisibleMessageIds = prev[roomId]
      if (!roomVisibleMessageIds?.has(fromId)) return prev

      const nextRoomVisibleMessageIds = new Set(roomVisibleMessageIds)
      nextRoomVisibleMessageIds.delete(fromId)
      nextRoomVisibleMessageIds.add(toId)

      return {
        ...prev,
        [roomId]: nextRoomVisibleMessageIds,
      }
    })
  }, [])

  const buildMessageFromRow = useCallback((m: MessageRow, fallbackUsername?: string): Message => {
    const resolvedName = m.display_name || 'Anonymous'
    const resolvedCollege = m.college || ''
    return {
      id: m.id,
      renderKey: m.id,
      username: resolvedName,
      initials: getInitials(resolvedName),
      university: resolvedCollege,
      text: m.content,
      timestamp: formatTime(m.created_at),
      avatarUrl: displayNameToAvatarUrlRef.current[resolvedName] ?? null,
      created_at: m.created_at,
      room_name: m.room_name ?? null,
      room_id: m.room_id,
      user_uuid: m.user_uuid ?? null,
      senderUsername: fallbackUsername ?? displayNameToUsernameRef.current[resolvedName] ?? null,
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

  const buildMutePairFilter = useCallback((firstUserId: string, secondUserId: string) => (
    `and(muter_id.eq.${firstUserId},muted_id.eq.${secondUserId}),and(muter_id.eq.${secondUserId},muted_id.eq.${firstUserId})`
  ), [])

  const isMutedUser = useCallback((userId?: string | null) => {
    const normalizedUserId = userId?.trim() || ''
    return Boolean(normalizedUserId && mutedUserIds.has(normalizedUserId))
  }, [mutedUserIds])

  const activeRenderableMessagesCount = getRenderableMessages({
    messages: activeRoomMessagesList,
    visibleMessageIds: activeRoomVisibleMessageIds,
    isMutedUser,
  }).length

  const dismissGlobalChatPopup = useCallback(() => {
    if (typeof window !== 'undefined' && globalChatPopupDismissTimeoutRef.current !== null) {
      window.clearTimeout(globalChatPopupDismissTimeoutRef.current)
      globalChatPopupDismissTimeoutRef.current = null
    }

    setShowGlobalChatPopup(false)
  }, [])

  const triggerGlobalChatPopup = useCallback(() => {
    if (typeof window === 'undefined' || hasTriggeredGlobalChatPopupRef.current) return

    if (window.localStorage.getItem(GLOBAL_CHAT_POPUP_STORAGE_KEY) === 'seen') {
      hasTriggeredGlobalChatPopupRef.current = true
      return
    }

    hasTriggeredGlobalChatPopupRef.current = true
    window.localStorage.setItem(GLOBAL_CHAT_POPUP_STORAGE_KEY, 'seen')

    if (globalChatPopupTriggerTimeoutRef.current !== null) {
      window.clearTimeout(globalChatPopupTriggerTimeoutRef.current)
      globalChatPopupTriggerTimeoutRef.current = null
    }

    if (globalChatPopupDismissTimeoutRef.current !== null) {
      window.clearTimeout(globalChatPopupDismissTimeoutRef.current)
    }

    setShowGlobalChatPopup(true)
    globalChatPopupDismissTimeoutRef.current = window.setTimeout(() => {
      setShowGlobalChatPopup(false)
      globalChatPopupDismissTimeoutRef.current = null
    }, GLOBAL_CHAT_POPUP_AUTO_DISMISS_MS)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (window.localStorage.getItem(GLOBAL_CHAT_POPUP_STORAGE_KEY) === 'seen') {
      hasTriggeredGlobalChatPopupRef.current = true
      return
    }

    globalChatPopupTriggerTimeoutRef.current = window.setTimeout(() => {
      triggerGlobalChatPopup()
    }, GLOBAL_CHAT_POPUP_TRIGGER_DELAY_MS)

    return () => {
      if (globalChatPopupTriggerTimeoutRef.current !== null) {
        window.clearTimeout(globalChatPopupTriggerTimeoutRef.current)
        globalChatPopupTriggerTimeoutRef.current = null
      }

      if (globalChatPopupDismissTimeoutRef.current !== null) {
        window.clearTimeout(globalChatPopupDismissTimeoutRef.current)
        globalChatPopupDismissTimeoutRef.current = null
      }
    }
  }, [triggerGlobalChatPopup])

  useEffect(() => {
    if (activeRenderableMessagesCount < GLOBAL_CHAT_POPUP_MESSAGE_THRESHOLD) return
    triggerGlobalChatPopup()
  }, [activeRenderableMessagesCount, triggerGlobalChatPopup])

  const getNotificationMessageKey = useCallback((message: any) => {
    if (typeof message?.id === 'string' && message.id.trim()) {
      return message.id.trim()
    }

    const roomId = typeof message?.room_id === 'string' && message.room_id.trim() ? message.room_id.trim() : 'unknown-room'
    const createdAt = typeof message?.created_at === 'string' && message.created_at.trim() ? message.created_at.trim() : 'unknown-created-at'
    const content = typeof message?.content === 'string' && message.content.trim()
      ? message.content.trim()
      : typeof message?.text === 'string' && message.text.trim()
        ? message.text.trim()
        : 'unknown-content'

    return `${roomId}:${createdAt}:${content}`
  }, [])

  const buildIncomingNotificationPayload = useCallback((message: any): NotificationPayload => {
    const sender = typeof message?.display_name === 'string' && message.display_name.trim()
      ? message.display_name.trim()
      : typeof message?.username === 'string' && message.username.trim()
        ? message.username.trim()
        : 'Someone'
    const content = typeof message?.content === 'string' && message.content.trim()
      ? message.content.trim()
      : typeof message?.text === 'string' && message.text.trim()
        ? message.text.trim()
        : 'sent a new message'
    const preview = content.length > 88 ? `${content.slice(0, 85)}...` : content
    const notificationParams = new URLSearchParams()

    if (typeof message?.room_id === 'string' && message.room_id.trim()) {
      notificationParams.set('roomId', message.room_id.trim())
    }

    if (typeof message?.id === 'string' && message.id.trim()) {
      notificationParams.set('messageId', message.id.trim())
    }

    const targetUrl = notificationParams.toString() ? `/chat?${notificationParams.toString()}` : '/chat'

    return {
      title: sender,
      body: preview,
      url: targetUrl,
      tag: `spreadz-message-${message?.id || message?.room_id || 'live'}`,
    }
  }, [])

  const showBrowserNotification = useCallback((payload: NotificationPayload) => {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return
    }

    const targetUrl = new URL(payload.url || '/chat', window.location.origin).href
    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: '/icon-192x192.png',
      tag: payload.tag,
      data: { url: targetUrl },
    })

    notification.onclick = () => {
      window.focus()
      notification.close()
      window.location.assign(targetUrl)
    }
  }, [])

  const rememberNotificationKey = useCallback((notificationKey: string) => {
    if (notifiedMessageKeysRef.current.has(notificationKey)) {
      return false
    }

    notifiedMessageKeysRef.current.add(notificationKey)

    if (notifiedMessageKeysRef.current.size > 200) {
      const oldestNotificationKey = notifiedMessageKeysRef.current.values().next().value
      if (oldestNotificationKey) {
        notifiedMessageKeysRef.current.delete(oldestNotificationKey)
      }
    }

    return true
  }, [])

  const getServiceWorkerRegistration = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null
    }

    try {
      const existingRegistration =
        (await navigator.serviceWorker.getRegistration('/')) ||
        (await navigator.serviceWorker.getRegistration())

      if (existingRegistration?.active) {
        return existingRegistration
      }

      await navigator.serviceWorker.register('/sw.js')

      const readyRegistration = await Promise.race<ServiceWorkerRegistration | null>([
        navigator.serviceWorker.ready,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 10000)),
      ])

      return readyRegistration
    } catch (error) {
      console.error('[Notifications] Service worker registration failed', error)
      return null
    }
  }, [])

  const savePushSubscription = useCallback(async (subscription: PushSubscriptionJSON, userUuid: string) => {
    const endpoint =
      typeof subscription.endpoint === 'string' && subscription.endpoint.trim()
        ? subscription.endpoint.trim()
        : ''

    if (!endpoint) {
      throw new Error('Push subscription is missing an endpoint.')
    }

    const subscriptionPayload = {
      user_uuid: userUuid,
      endpoint,
      subscription: subscription as any,
    }

    const { count, error: updateError } = await supabase
      .from('push_subscriptions')
      .update(subscriptionPayload, { count: 'exact' })
      .eq('endpoint', endpoint)

    if (updateError) {
      throw updateError
    }

    if ((count ?? 0) > 0) {
      return
    }

    const { error: insertError } = await supabase
      .from('push_subscriptions')
      .insert(subscriptionPayload)

    if (insertError) {
      throw insertError
    }
  }, [])

  const ensurePushSubscriptionSaved = useCallback(async (forceFreshSubscription = false) => {
    const userUuid = getCurrentUserId()
    if (!userUuid) {
      console.error('[Push] Cannot save subscription because user id is not ready.')
      return false
    }

    if (typeof window === 'undefined' || !('PushManager' in window)) {
      console.error('[Push] Push subscriptions are not supported in this browser.')
      return false
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing.')
      return false
    }

    try {
      const registration = await getServiceWorkerRegistration()
      if (!registration) {
        console.error('[Push] Service worker is not ready yet.')
        return false
      }

      let subscription = await registration.pushManager.getSubscription()

      if (forceFreshSubscription && subscription) {
        const unsubscribed = await subscription.unsubscribe()
        if (!unsubscribed) {
          console.error('[Push] Failed to unsubscribe existing push subscription.')
          return false
        }

        subscription = null
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      }

      await savePushSubscription(subscription.toJSON(), userUuid)
      return true
    } catch (error) {
      console.error('[Push] Failed to save push subscription', error)
      return false
    }
  }, [getCurrentUserId, getServiceWorkerRegistration, savePushSubscription])

  const triggerServerPush = useCallback(async (params: { roomId: string; messageId: string }) => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        console.error('[Push] Failed to read auth session', sessionError)
        return
      }

      const accessToken = sessionData.session?.access_token?.trim() || ''
      if (!accessToken) {
        console.error('[Push] Cannot trigger server push without an access token.')
        return
      }

      const response = await fetch('/api/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          room_id: params.roomId,
          message_id: params.messageId,
        }),
      })

      if (!response.ok) {
        const responsePayload = await response.json().catch(() => null)
        console.error('[Push] Failed to trigger server push', {
          status: response.status,
          errorPayload: responsePayload,
        })
      }
    } catch (error) {
      console.error('[Push] Failed to trigger server push', error)
    }
  }, [])

  const showServiceWorkerNotification = useCallback(async (payload: NotificationPayload) => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    const registration = await getServiceWorkerRegistration()
    if (!registration) {
      return
    }

    const targetUrl = new URL(payload.url || '/chat', window.location.origin).href

    await registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon.png',
      tag: payload.tag,
      data: { url: targetUrl },
    })
  }, [getServiceWorkerRegistration])

  const showIncomingNotification = useCallback(async (payload: NotificationPayload) => {
    if (typeof window === 'undefined') {
      return
    }

    const now = Date.now()
    if (now < notificationCooldownUntilRef.current) {
      return
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      notificationCooldownUntilRef.current = now + NOTIFICATION_COOLDOWN_MS

      try {
        showBrowserNotification(payload)
        return
      } catch (notificationError) {
        console.error('[Notifications] Notification API failed, falling back to service worker', notificationError)
      }
    }

    notificationCooldownUntilRef.current = now + NOTIFICATION_COOLDOWN_MS
    await showServiceWorkerNotification(payload)
  }, [showBrowserNotification, showServiceWorkerNotification])

  const handleIncomingMessageNotification = useCallback(async (message?: any) => {
    if (!message) return

    const currentUserId = getCurrentUserId()
    if (message?.user_uuid && currentUserId && message.user_uuid === currentUserId) {
      return
    }
    if (message?.user_uuid && isMutedUser(message.user_uuid)) {
      return
    }

    const notificationKey = getNotificationMessageKey(message)
    if (!rememberNotificationKey(notificationKey)) {
      return
    }

    try {
      await showIncomingNotification(buildIncomingNotificationPayload(message))
    } catch (error) {
      console.error('[Notifications] New message notification failed', error)
    }
  }, [buildIncomingNotificationPayload, getCurrentUserId, getNotificationMessageKey, isMutedUser, rememberNotificationKey, showIncomingNotification])

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

  const loadMuteState = useCallback(async () => {
    const currentUserId = getCurrentUserId()
    if (!currentUserId) {
      setMutedUserIds(new Set())
      return new Set<string>()
    }

    const { data, error } = await supabase
      .from('mutes')
      .select('muter_id, muted_id')
      .or(`muter_id.eq.${currentUserId},muted_id.eq.${currentUserId}`)

    if (error) {
      console.error('[Mutes] fetch failed:', error)
      setMutedUserIds(new Set())
      return new Set<string>()
    }

    const nextMutedUserIds = new Set<string>()

    data?.forEach((row) => {
      const otherUserId = row.muter_id === currentUserId ? row.muted_id : row.muter_id
      if (otherUserId) {
        nextMutedUserIds.add(otherUserId)
      }
    })

    setMutedUserIds(nextMutedUserIds)
    return nextMutedUserIds
  }, [getCurrentUserId])

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

  const fetchSeededAvatarsForRoom = useCallback(async (roomId: string) => {
    const { data, error } = await ((supabase.from as unknown as (table: string) => any)(
      'seeded_avatars'
    ) as any)
      .select('display_name, avatar_url')
      .eq('room_id', roomId)

    if (error) {
      return
    }

    const nextRoomAvatarMap: Record<string, string> = {}

    ;((data || []) as Array<{ display_name: string | null; avatar_url: string | null }>).forEach((row) => {
      const displayName = row.display_name?.trim() || ''
      const avatar = row.avatar_url?.trim() || ''

      if (!displayName || !avatar) return

      nextRoomAvatarMap[displayName] = avatar
    })

    setSeededAvatarMap((current) => ({
      ...current,
      [roomId]: nextRoomAvatarMap,
    }))
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

  const updateProfileDraft = useCallback((patch: Partial<ExtendedProfileDraft>) => {
    setProfileSaveState('idle')
    setProfileDraft((current) => ({
      ...current,
      ...patch,
    }))
  }, [])

  const upsertUserProfile = useCallback(async (profile: {
    displayName?: string
    username?: string
    college?: string
    avatarUrl?: string
    createdAt?: string
    branch?: string
    year?: string
    bio?: string
    interests?: string[]
    favMovie?: string
    relationshipStatus?: string
  }) => {
    const userId = getCurrentUserId()
    if (!userId) return false

    const payload: {
      uuid: string
      created_at?: string
      display_name?: string | null
      username?: string | null
      college?: string | null
      avatar_url?: string | null
      branch?: string | null
      year?: string | null
      bio?: string | null
      interests?: string[] | null
      fav_movie?: string | null
      relationship_status?: string | null
    } = {
      uuid: userId,
    }

    if (profile.createdAt !== undefined) payload.created_at = profile.createdAt
    if (profile.displayName !== undefined) payload.display_name = profile.displayName || null
    if (profile.username !== undefined) payload.username = profile.username || null
    if (profile.college !== undefined) payload.college = profile.college || null
    if (profile.avatarUrl !== undefined) payload.avatar_url = profile.avatarUrl || null
    if (profile.branch !== undefined) payload.branch = profile.branch || null
    if (profile.year !== undefined) payload.year = profile.year || null
    if (profile.bio !== undefined) payload.bio = profile.bio || null
    if (profile.interests !== undefined) payload.interests = profile.interests.length > 0 ? profile.interests : null
    if (profile.favMovie !== undefined) payload.fav_movie = profile.favMovie || null
    if (profile.relationshipStatus !== undefined) payload.relationship_status = profile.relationshipStatus || null

    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'uuid' })
    if (error) {
      console.error('[Users] upsert failed:', error)
      return false
    }

    return true
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

  const enableNotifications = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationStatus('unsupported')
      setNotificationErrorMessage('This browser does not support notifications.')
      return false
    }

    if (Notification.permission === 'denied') {
      localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'true')
      setNotificationStatus('error')
      setNotificationErrorMessage('Notifications are blocked for this app or site.')
      return false
    }

    setNotificationStatus('enabling')
    setNotificationErrorMessage('')

    try {
      const permission = Notification.permission === 'granted'
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
        return false
      }

      localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'true')
      setNotificationStatus('enabled')
      setNotificationErrorMessage('')
      return true
    } catch (error) {
      console.error('[Notifications] Enable failed', error)
      setNotificationStatus('error')
      setNotificationErrorMessage(error instanceof Error ? error.message : 'Notification setup failed.')
      return false
    }
  }, [])

  const handleEnableNotifications = useCallback(async () => {
    localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'true')
    const enabled = await enableNotifications()
    if (!enabled) return

    const subscriptionSaved = await ensurePushSubscriptionSaved(true)
    if (!subscriptionSaved) {
      setNotificationStatus('error')
      setNotificationErrorMessage('Notifications were enabled, but push setup could not be completed. Please try again.')
      return
    }

    setNotificationSheetOpen(false)
    showBrowserNotification({
      title: 'Notifications are on',
      body: 'You will now get alerts when new messages come in.',
      url: '/chat',
      tag: 'spreadz-notifications-enabled',
    })
  }, [enableNotifications, ensurePushSubscriptionSaved, showBrowserNotification])

  const closeNotificationSheet = useCallback(() => {
    setNotificationSheetOpen(false)
    localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'true')
  }, [])

  const handleNotificationPromptAfterSend = useCallback(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return

    const promptStatus = localStorage.getItem(PUSH_PROMPT_STATUS_STORAGE_KEY)
    if (promptStatus === 'true') return

    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'true')
      return
    }

    const sentCount = Number(localStorage.getItem(PUSH_SENT_COUNT_STORAGE_KEY) || '0') + 1
    localStorage.setItem(PUSH_SENT_COUNT_STORAGE_KEY, String(sentCount))

    if (sentCount >= PUSH_PROMPT_MESSAGE_THRESHOLD) {
      setNotificationSheetOpen(true)
    }
  }, [])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return

    const appliedVersion = localStorage.getItem(CLIENT_REFRESH_STORAGE_KEY)
    if (appliedVersion === CLIENT_REFRESH_VERSION) return

    localStorage.setItem(CLIENT_REFRESH_STORAGE_KEY, CLIENT_REFRESH_VERSION)

    const refreshClient = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map(registration => registration.update()))
        }

        if ('caches' in window) {
          const cacheKeys = await caches.keys()
          const cacheKeysToDelete = cacheKeys.filter(key => key === 'start-url' || key.includes('workbox-precache'))
          await Promise.all(cacheKeysToDelete.map(key => caches.delete(key)))
        }
      } catch (error) {
        console.error('[App] Client refresh failed', error)
      } finally {
        window.location.reload()
      }
    }

    void refreshClient()
  }, [isMounted])

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return

    if (!('Notification' in window)) {
      setNotificationStatus('unsupported')
      setNotificationErrorMessage('This browser does not support notifications.')
      return
    }

    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      localStorage.setItem(PUSH_PROMPT_STATUS_STORAGE_KEY, 'true')
      if (Notification.permission === 'granted') {
        setNotificationStatus('enabled')
        setNotificationErrorMessage('')
      } else {
        setNotificationStatus('error')
        setNotificationErrorMessage('Notifications are blocked for this app or site.')
      }
    }
  }, [isMounted])

  useEffect(() => {
    if (!authReady || !isMounted || typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    void ensurePushSubscriptionSaved()
  }, [authReady, ensurePushSubscriptionSaved, isMounted])

  useEffect(() => {
    if (displayName.trim() && accountUsername.trim()) {
      displayNameToUsernameRef.current[displayName.trim()] = accountUsername.trim()
    }
  }, [accountUsername, displayName])

  useEffect(() => {
    roomIdsRef.current = new Set(rooms.map((room) => room.id))
  }, [rooms])

  useEffect(() => {
    const nextRoomIndex = rooms.length === 0
      ? 0
      : Math.max(0, Math.min(currentRoomIndex, rooms.length - 1))

    if (nextRoomIndex === currentRoomIndex) return

    currentRoomIndexRef.current = nextRoomIndex
    setCurrentRoomIndex(nextRoomIndex)
  }, [currentRoomIndex, rooms.length])

  const applyRoomFeed = useCallback((nextRooms: Room[]) => {
    setRooms((previousRooms) => {
      const mergedRooms = mergeRoomFeed(previousRooms, nextRooms)
      const { normalizedRooms, nextRoomIndex } = getAnchoredRoomFeedState(
        mergedRooms,
        activeRoomIdRef.current,
        currentRoomIndexRef.current
      )

      currentRoomIndexRef.current = nextRoomIndex
      setCurrentRoomIndex((currentIndex) => (currentIndex === nextRoomIndex ? currentIndex : nextRoomIndex))

      return normalizedRooms
    })
  }, [])

  const fetchRooms = useCallback(async (_reason = 'unknown') => {
    const requestId = roomFeedFetchRequestIdRef.current + 1
    roomFeedFetchRequestIdRef.current = requestId
    roomFeedRealtimeFiredRef.current = false
    setRoomFeedStatus((currentStatus) => currentStatus === 'ready' ? currentStatus : 'loading')
    setRoomFeedErrorMessage('')

    const applyLatestRoomFeed = (nextRooms: Room[]) => {
      if (requestId !== roomFeedFetchRequestIdRef.current) {
        return
      }

      if (roomFeedRealtimeFiredRef.current) {
        return
      }

      applyRoomFeed(nextRooms)
      setRoomFeedErrorMessage('')
      setRoomFeedStatus('ready')
    }

    const applyRoomFeedError = (errorMessage: string) => {
      if (requestId !== roomFeedFetchRequestIdRef.current) {
        return
      }

      setRoomFeedErrorMessage(errorMessage)
      setRoomFeedStatus('error')
    }

    const orderedRoomsQuery = await (supabase.from('rooms') as any)
      .select('id, headline, created_at, feed_position, message_count')
      .not('headline', 'is', null)
      .neq('headline', '')
      .order('feed_position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (orderedRoomsQuery.error) {
      console.error('[Rooms] feed_position fetch failed, falling back:', orderedRoomsQuery.error)

      const { data, error } = await supabase
        .from('rooms')
        .select('id, headline, created_at, message_count')
        .not('headline', 'is', null)
        .neq('headline', '')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[Rooms] fetch failed:', error)
        applyRoomFeedError(error.message || 'Unable to load live rooms right now.')
        return
      }

      applyLatestRoomFeed((data || []) as Room[])
      return
    }

    applyLatestRoomFeed((orderedRoomsQuery.data || []) as Room[])
  }, [applyRoomFeed])

  const patchRoomFeed = useCallback((nextRoom: Room) => {
    roomFeedRealtimeFiredRef.current = true
    setRoomFeedErrorMessage('')
    setRoomFeedStatus('ready')

    setRooms((previousRooms) => {
      const nextRooms = previousRooms.some((room) => room.id === nextRoom.id)
        ? previousRooms.map((room) => room.id === nextRoom.id ? { ...room, ...nextRoom } : room)
        : [...previousRooms, nextRoom]

      const { normalizedRooms, nextRoomIndex } = getAnchoredRoomFeedState(
        nextRooms,
        activeRoomIdRef.current,
        currentRoomIndexRef.current
      )

      currentRoomIndexRef.current = nextRoomIndex
      setCurrentRoomIndex((currentIndex) => (currentIndex === nextRoomIndex ? currentIndex : nextRoomIndex))

      return normalizedRooms
    })
  }, [])

  useEffect(() => {
    if (!authReady) return

    let cancelled = false
    setMuteStateReady(false)

    const initializeMuteState = async () => {
      await loadMuteState()

      if (!cancelled) {
        setMuteStateReady(true)
      }
    }

    void initializeMuteState()

    return () => {
      cancelled = true
    }
  }, [authReady, loadMuteState])

  useEffect(() => {
    if (!showProfileModal) {
      if (profileSheetCloseTimeoutRef.current !== null) {
        window.clearTimeout(profileSheetCloseTimeoutRef.current)
        profileSheetCloseTimeoutRef.current = null
      }
      profileSheetTouchStartYRef.current = null
      setProfileSheetDragging(false)
      setProfileSaveState('idle')
      applyProfileSheetOffset(0)
      return
    }

    setProfileSheetDragging(false)
    setProfileSaveState('idle')
    applyProfileSheetOffset(0)
  }, [showProfileModal, applyProfileSheetOffset])

  useEffect(() => {
    if (!showProfileModal || typeof window === 'undefined') return

    const sheet = profileSheetRef.current
    if (!sheet) return

    const syncProfileSheetKeyboardInset = () => {
      const viewport = window.visualViewport
      const keyboardInset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0

      sheet.style.setProperty('--profile-sheet-keyboard-inset', `${keyboardInset}px`)
    }

    const handleFocusIn = (event: Event) => {
      scrollProfileFieldIntoView(event.target)
    }

    syncProfileSheetKeyboardInset()
    document.addEventListener('focusin', handleFocusIn)
    window.visualViewport?.addEventListener('resize', syncProfileSheetKeyboardInset)
    window.visualViewport?.addEventListener('scroll', syncProfileSheetKeyboardInset)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      window.visualViewport?.removeEventListener('resize', syncProfileSheetKeyboardInset)
      window.visualViewport?.removeEventListener('scroll', syncProfileSheetKeyboardInset)
      sheet.style.removeProperty('--profile-sheet-keyboard-inset')
    }
  }, [showProfileModal, scrollProfileFieldIntoView])

  useEffect(() => {
    if (readOnlyProfile || !pendingProfileReportMessageRef.current) return

    const reportMessage = pendingProfileReportMessageRef.current
    pendingProfileReportMessageRef.current = null
    setSheetClosing(false)
    setReportStatus('idle')
    setMuteStatus('idle')
    setReportSheetMessage(reportMessage)
  }, [readOnlyProfile])

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
        .select('display_name, college, avatar_url, username, branch, year, bio, interests, fav_movie, relationship_status, created_at')
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
      setTempProfileName(nextDisplayName)
      setTempProfileCollege(nextCollege)
      setAvatarUrl(userRow?.avatar_url || '')
      setProfileJoinedAt(userRow?.created_at || null)
      setAccountUsername(nextUsername)
      const nextExtendedProfile: ExtendedProfileFields = {
        branch: normalizeProfileText(userRow?.branch),
        year: normalizeProfileText(userRow?.year),
        bio: normalizeProfileText(userRow?.bio),
        interests: normalizeProfileInterests(userRow?.interests),
        favMovie: normalizeProfileText(userRow?.fav_movie),
        relationshipStatus: normalizeProfileText(userRow?.relationship_status),
      }
      setExtendedProfile(nextExtendedProfile)
      setProfileDraft(buildProfileDraft(nextExtendedProfile))
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

  useEffect(() => {
    if (!activeGifPickerRoomId) return

    const controller = new AbortController()
    const trimmedQuery = gifSearchInput.trim()
    const timeoutId = window.setTimeout(async () => {
      setGifLoading(true)
      setGifError('')

      try {
        const nextGifResults = await fetchGifResults(trimmedQuery, controller.signal)
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
    }, trimmedQuery ? 300 : 0)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [activeGifPickerRoomId, fetchGifResults, gifSearchInput])

  const triggerRevealsForMessages = useCallback((roomId: string, msgs: Message[]) => {
    msgs.forEach((m) => {
      scheduleReveal(roomId, m.id, 0)
    })
  }, [scheduleReveal])

  // Fetch messages for a specific room
  const fetchMessagesForRoom = useCallback(async (room: Room, options?: FetchMessagesOptions) => {
    const force = options?.force ?? false
    const revealMode = options?.revealMode ?? 'schedule'

    if (!force && fetchedRoomsRef.current.has(room.id)) {
      return
    }

    fetchedRoomsRef.current.add(room.id)
    const requestId = (roomMessageFetchRequestIdByRoomRef.current[room.id] || 0) + 1
    roomMessageFetchRequestIdByRoomRef.current[room.id] = requestId
    setRoomMessageStatusByRoom(prev => ({ ...prev, [room.id]: 'loading' }))

    const isStaleRequest = () => requestId !== roomMessageFetchRequestIdByRoomRef.current[room.id]

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT_COLUMNS)
        .eq('room_id', room.id)
        .order('created_at', { ascending: true })

      if (error) {
        fetchedRoomsRef.current.delete(room.id)
        setRoomMessageStatusByRoom(prev => ({ ...prev, [room.id]: 'error' }))
        console.error('[Messages] fetch failed', error)
        return
      }

      if (isStaleRequest()) {
        return
      }

      const messageRows = (data || [])
        .map((message: any) => normalizeMessageRow(message))
        .filter((message): message is MessageRow => Boolean(message))

      await Promise.all([
        cacheUsernamesForDisplayNames(messageRows.map(message => message.display_name)),
        fetchSeededAvatarsForRoom(room.id),
      ])

      if (isStaleRequest()) {
        return
      }

      const msgs = messageRows.map((message) => buildMessageFromRow(message))
      setRoomMessages(prev => ({
        ...prev,
        [room.id]: mergeRoomMessageFeed(prev[room.id] || [], msgs),
      }))
      setRoomMessageStatusByRoom(prev => ({ ...prev, [room.id]: 'ready' }))

      if (revealMode === 'instant') {
        setInstantVisibleMessageIds(room.id, msgs)
        return
      }

      requestAnimationFrame(() => {
        triggerRevealsForMessages(room.id, msgs)
      })
    } catch (error) {
      fetchedRoomsRef.current.delete(room.id)
      setRoomMessageStatusByRoom(prev => ({ ...prev, [room.id]: 'error' }))
      console.error('[Messages] fetch crashed', error)
    }
  }, [buildMessageFromRow, cacheUsernamesForDisplayNames, fetchSeededAvatarsForRoom, normalizeMessageRow, setInstantVisibleMessageIds, triggerRevealsForMessages])

  const syncMuteStateAndRooms = useCallback(async () => {
    await loadMuteState()

    const fetchedRooms = rooms.filter((room) => fetchedRoomsRef.current.has(room.id))
    if (fetchedRooms.length === 0) return

    await Promise.all(
      fetchedRooms.map((room) => fetchMessagesForRoom(room, { force: true, revealMode: 'instant' }))
    )
  }, [fetchMessagesForRoom, loadMuteState, rooms])

  useEffect(() => {
    if (!authReady) return

    const currentUserId = getCurrentUserId()
    if (!currentUserId) return

    const channel = supabase
      .channel('mutes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mutes' },
        (payload) => {
          const muteRow = (payload.eventType === 'DELETE' ? payload.old : payload.new) as {
            muter_id?: string
            muted_id?: string
          } | null

          if (!muteRow) return

          const involvesCurrentUser = muteRow.muter_id === currentUserId || muteRow.muted_id === currentUserId
          if (!involvesCurrentUser) return

          void syncMuteStateAndRooms()
        }
      )
      .subscribe()

    muteChannelRef.current = channel

    return () => {
      if (muteChannelRef.current) {
        supabase.removeChannel(muteChannelRef.current)
        muteChannelRef.current = null
      }
    }
  }, [authReady, getCurrentUserId, syncMuteStateAndRooms])

  const handleRealtimeMessage = useCallback((messageRow: any) => {
    const normalizedMessage = normalizeMessageRow(messageRow)
    if (!normalizedMessage) return

    const roomId = normalizedMessage.room_id
    if (!roomId) return

    const pendingMessageKey = getPendingMessageKey(normalizedMessage)
    const optimisticTempId = pendingMessageKey ? pendingOutgoingMessageIdsRef.current.get(pendingMessageKey) || '' : ''
    const messageAuthorId = typeof normalizedMessage.user_uuid === 'string' ? normalizedMessage.user_uuid : ''
    const messagePolicy = getRealtimeMessagePolicy({
      roomId,
      roomIsKnown: roomIdsRef.current.has(roomId),
      messageAuthorId,
      currentUserId: getCurrentUserId(),
      isMutedAuthor: Boolean(messageAuthorId && isMutedUser(messageAuthorId)),
      optimisticTempId,
    })

    if (messagePolicy.shouldFetchRooms) {
      void fetchRooms('unknown-room-message')
    }
    if (messagePolicy.shouldIgnore) return
    if (pendingMessageKey && optimisticTempId) {
      pendingOutgoingMessageIdsRef.current.delete(pendingMessageKey)
    }

    const incomingMessage = buildMessageFromRow(normalizedMessage)
    let shouldNotify = messagePolicy.shouldNotify

    scheduleReveal(roomId, incomingMessage.id, 0)
    setRoomMessageStatusByRoom(prev => ({ ...prev, [roomId]: 'ready' }))
    setRoomMessages(prev => {
      const existing = prev[roomId] || []
      if (existing.some(msg => msg.id === normalizedMessage.id)) {
        shouldNotify = false
        return prev
      }

      if (optimisticTempId) {
        const hasTempMessage = existing.some(msg => msg.id === optimisticTempId)
        if (!hasTempMessage) {
          return { ...prev, [roomId]: [...existing, incomingMessage] }
        }

        replaceVisibleMessageId(roomId, optimisticTempId, incomingMessage.id)

        return {
          ...prev,
          [roomId]: existing.map(msg => msg.id === optimisticTempId
            ? { ...incomingMessage, renderKey: msg.renderKey || optimisticTempId }
            : msg),
        }
      }

      return { ...prev, [roomId]: [...existing, incomingMessage] }
    })

    if (shouldNotify) {
      void handleIncomingMessageNotification(normalizedMessage)
    }

    void (async () => {
      await cacheUsernamesForDisplayNames([normalizedMessage.display_name])
      const hydratedMessage = buildMessageFromRow(normalizedMessage)

      setRoomMessages(prev => {
        const existing = prev[roomId] || []
        const messageIndex = existing.findIndex(msg => msg.id === normalizedMessage.id)
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
  }, [buildMessageFromRow, cacheUsernamesForDisplayNames, fetchRooms, getCurrentUserId, getPendingMessageKey, handleIncomingMessageNotification, isMutedUser, normalizeMessageRow, replaceVisibleMessageId, scheduleReveal])

  useEffect(() => {
    realtimeMessageHandlerRef.current = handleRealtimeMessage
  }, [handleRealtimeMessage])

  useEffect(() => {
    if (!authReady) return

    void fetchRooms('auth-ready')

    const channel = supabase
      .channel('rooms-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rooms' },
        (payload) => {
          const nextRoom = normalizeRoomRow(payload.new)
          if (!nextRoom) return
          patchRoomFeed(nextRoom)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms' },
        (payload) => {
          const nextRoom = normalizeRoomRow(payload.new)
          if (!nextRoom) return
          patchRoomFeed(nextRoom)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void fetchRooms('rooms-subscribed')
        }
      })

    roomsChannelRef.current = channel

    return () => {
      if (roomsChannelRef.current) {
        supabase.removeChannel(roomsChannelRef.current)
        roomsChannelRef.current = null
      }
    }
  }, [authReady, fetchRooms, normalizeRoomRow, patchRoomFeed])


  // Fetch messages for the active room and its adjacent neighbors as room state changes.
  useEffect(() => {
    if (!muteStateReady) return

    const activeRoom = rooms[currentRoomIndex]
    if (!activeRoom) return

    trackRoomEnter(activeRoom.id, activeRoom.headline)
    void fetchMessagesForRoom(activeRoom)

    const previousRoom = rooms[currentRoomIndex - 1]
    const nextRoom = rooms[currentRoomIndex + 1]

    if (previousRoom) {
      void fetchMessagesForRoom(previousRoom)
    }

    if (nextRoom) {
      void fetchMessagesForRoom(nextRoom)
    }
  }, [currentRoomIndex, fetchMessagesForRoom, muteStateReady, rooms])

  // Keep one long-lived messages subscription so room changes do not interrupt realtime inserts.
  useEffect(() => {
    if (!authReady || !muteStateReady) return

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          realtimeMessageHandlerRef.current(payload.new)
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
  }, [authReady, muteStateReady])

  useEffect(() => {
    if (!activeRoomId) {
      setShowJumpToLatest(false)
      return
    }

    roomHasUserScrolledByIdRef.current[activeRoomId] = false
    scrollCurrentRoomToBottom('auto')
  }, [activeRoomId, scrollCurrentRoomToBottom])

  useEffect(() => {
    if (!authReady || !activeRoomId) return

    const channel = supabase.channel(`room-presence-${activeRoomId}`, {
      config: {
        presence: {
          key: getCurrentUsername(),
        },
      },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const currentUserId = getCurrentUserId()
        const users = Object.keys(state).filter(userId => {
          if (userId === currentUserId) return false
          const presences = state[userId] as any[]
          return presences.some(p => p.isTyping)
        }).map(userId => {
          return (state[userId][0] as any).name
        }).filter(Boolean)
        setTypingUsers(users)
      })
      .subscribe()

    presenceChannelRef.current = channel

    return () => {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current)
        presenceChannelRef.current = null
      }
      setTypingUsers([])
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      isCurrentlyTypingRef.current = false
    }
  }, [authReady, activeRoomId, getCurrentUsername, getCurrentUserId])

  useEffect(() => {
    if (!activeRoomId) return

    const shouldStickToBottom = roomIsAtBottomByIdRef.current[activeRoomId] ?? true
    if (shouldStickToBottom) {
      scrollCurrentRoomToBottom('smooth')
      return
    }

    syncActiveRoomBottomState()
  }, [
    activeRoomId,
    activeRoomMessagesList,
    activeRoomVisibleMessageIds,
    scrollCurrentRoomToBottom,
    syncActiveRoomBottomState,
  ])

  // Auto-scroll when a new ghost message is revealed during a seed run
  useEffect(() => {
    if (!activeRoomId) return
    const shouldStickToBottom = roomIsAtBottomByIdRef.current[activeRoomId] ?? true
    if (!shouldStickToBottom) return
    scrollCurrentRoomToBottom('smooth')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId, ghostRevealCountByRoom[activeRoomId], scrollCurrentRoomToBottom])

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
  }, [activeRoomId, currentRoomIndex, isKeyboardOpen, syncComposerMetrics])

  useEffect(() => {
    return () => {
      clearRoomDragFrame()
      if (roomTransitionTimeoutRef.current !== null) {
        window.clearTimeout(roomTransitionTimeoutRef.current)
      }
    }
  }, [clearRoomDragFrame])

  useEffect(() => {
    if (isDraggingRoomRef.current || isAnimatingRoomRef.current) return

    clearRoomPanelStyles(
      [currentRoomIndex - 1, currentRoomIndex, currentRoomIndex + 1]
        .filter(index => index >= 0 && index < rooms.length)
    )
  }, [clearRoomPanelStyles, currentRoomIndex, rooms.length])

  useEffect(() => {
    const inputEl = composerBarRef.current?.querySelector('[contenteditable]') as HTMLElement | null
    if (!inputEl || !activeRoomId) return

    const nextText = inputTexts[activeRoomId] || ''
    if ((inputEl.textContent || '') !== nextText) {
      inputEl.textContent = nextText
    }
  }, [activeRoomId, inputTexts])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleKeyDown = (e: Event) => {
      const ke = e as unknown as KeyboardEvent;
      const activeElement = document.activeElement
      const isTyping = activeElement?.tagName === 'INPUT' ||
                       activeElement?.tagName === 'TEXTAREA' ||
                       (activeElement as HTMLElement)?.isContentEditable

      if (isTyping) return

      if (
        showProfileModal ||
        activeGifPickerRoomId ||
        friendsSheetOpen ||
        notificationSheetOpen ||
        activeFriendRequest ||
        backFeedbackModalOpen ||
        menuOpen
      ) {
        return
      }

      if (ke.key === 'ArrowDown') {
        const nextIndex = currentRoomIndex + 1
        if (nextIndex < rooms.length) {
          ke.preventDefault()
          const container = roomsContainerRef.current
          if (container) {
            container.classList.add('rooms-keyboard-animating')
            window.setTimeout(() => container.classList.remove('rooms-keyboard-animating'), 180)
          }
          currentRoomIndexRef.current = nextIndex
          setCurrentRoomIndex(nextIndex)
        }
      }
      if (ke.key === 'ArrowUp') {
        const prevIndex = currentRoomIndex - 1
        if (prevIndex >= 0) {
          ke.preventDefault()
          const container = roomsContainerRef.current
          if (container) {
            container.classList.add('rooms-keyboard-animating')
            window.setTimeout(() => container.classList.remove('rooms-keyboard-animating'), 180)
          }
          currentRoomIndexRef.current = prevIndex
          setCurrentRoomIndex(prevIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown as EventListener)
    return () => window.removeEventListener('keydown', handleKeyDown as EventListener)
  }, [
    currentRoomIndex,
    rooms.length,
    showProfileModal,
    activeGifPickerRoomId,
    friendsSheetOpen,
    notificationSheetOpen,
    activeFriendRequest,
    backFeedbackModalOpen,
    menuOpen
  ])

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


  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const openReportSheet = useCallback((msg: Message) => {
    setSheetClosing(false)
    setReportSheetMessage(msg)
    setReportStatus('idle')
    setMuteStatus('idle')
  }, [])

  const startLongPress = (msg: Message) => {
    clearLongPress()
    longPressTimerRef.current = window.setTimeout(() => {
      openReportSheet(msg)
    }, 450)
  }

  const closeSheet = useCallback(() => {
    if (sheetClosing) return
    setSheetClosing(true)
    window.setTimeout(() => {
      setReportSheetMessage(null)
      setReportStatus('idle')
      setMuteStatus('idle')
      setSheetClosing(false)
    }, 280)
  }, [sheetClosing])

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

  const handleMuteToggle = useCallback(async (targetUserId?: string | null) => {
    const currentUserId = getCurrentUserId()
    const normalizedTargetUserId = targetUserId?.trim() || ''

    if (!currentUserId || !normalizedTargetUserId || normalizedTargetUserId === currentUserId) {
      setMuteStatus('error')
      window.setTimeout(() => {
        setMuteStatus('idle')
      }, 1400)
      return false
    }

    setMuteStatus('submitting')

    const isCurrentlyMuted = isMutedUser(normalizedTargetUserId)
    const { error } = isCurrentlyMuted
      ? await supabase
        .from('mutes')
        .delete()
        .or(buildMutePairFilter(currentUserId, normalizedTargetUserId))
      : await supabase
        .from('mutes')
        .insert({
          muter_id: currentUserId,
          muted_id: normalizedTargetUserId,
        })

    if (error) {
      if (!isCurrentlyMuted && error.code === '23505') {
        await syncMuteStateAndRooms()
        setMuteStatus('done')
        return true
      }

      console.error('[Mutes] toggle failed:', error)
      setMuteStatus('error')
      window.setTimeout(() => {
        setMuteStatus('idle')
      }, 1400)
      return false
    }

    await syncMuteStateAndRooms()
    setMuteStatus('done')
    return true
  }, [buildMutePairFilter, getCurrentUserId, isMutedUser, syncMuteStateAndRooms])

  const handleSheetMute = useCallback(async () => {
    const didToggleMute = await handleMuteToggle(reportSheetMessage?.user_uuid)
    if (!didToggleMute) return
    closeSheet()
  }, [closeSheet, handleMuteToggle, reportSheetMessage])

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

  const clearGifPickerFrame = useCallback(() => {
    if (gifPickerFrameRef.current !== null) {
      window.cancelAnimationFrame(gifPickerFrameRef.current)
      gifPickerFrameRef.current = null
    }
  }, [])

  const applyGifPickerOffset = useCallback((offsetY: number) => {
    gifPickerOffsetYRef.current = offsetY
    gifPickerPendingOffsetYRef.current = offsetY

    if (gifPickerFrameRef.current !== null) return

    gifPickerFrameRef.current = window.requestAnimationFrame(() => {
      gifPickerFrameRef.current = null
      const sheet = gifPickerSheetRef.current
      if (!sheet) return
      sheet.style.transform = `translate3d(0, ${Math.round(gifPickerPendingOffsetYRef.current)}px, 0)`
    })
  }, [])

  const clearGifPickerCloseTimeout = useCallback(() => {
    if (gifPickerCloseTimeoutRef.current !== null) {
      window.clearTimeout(gifPickerCloseTimeoutRef.current)
      gifPickerCloseTimeoutRef.current = null
    }
  }, [])

  const resetGifPickerSheet = useCallback(() => {
    gifPickerTouchStartYRef.current = null
    gifPickerDraggedRef.current = false
    gifPickerSheetDraggingRef.current = false
    gifPickerTouchScrollRef.current = null
    gifPickerOffsetYRef.current = 0
    gifPickerPendingOffsetYRef.current = 0
    clearGifPickerFrame()
    const sheet = gifPickerSheetRef.current
    if (!sheet) return
    sheet.style.transform = 'translate3d(0, 0, 0)'
    sheet.style.transition = ''
  }, [clearGifPickerFrame])

  const closeGifPicker = useCallback(() => {
    clearGifPickerCloseTimeout()
    resetGifPickerSheet()
    setActiveGifPickerRoomId(null)
    setGifSearchInput('')
    setGifResults([])
    setGifLoading(false)
    setGifError('')
  }, [clearGifPickerCloseTimeout, resetGifPickerSheet])

  const dismissGifPicker = useCallback(() => {
    clearGifPickerCloseTimeout()

    const sheet = gifPickerSheetRef.current
    if (!sheet) {
      closeGifPicker()
      return
    }

    sheet.style.transition = ''
    const sheetHeight = sheet.offsetHeight
    const closeOffset = Math.max(sheetHeight + 48, gifPickerOffsetYRef.current + 72)
    applyGifPickerOffset(closeOffset)

    gifPickerCloseTimeoutRef.current = window.setTimeout(() => {
      gifPickerCloseTimeoutRef.current = null
      closeGifPicker()
    }, GIF_PICKER_CLOSE_DURATION_MS)
  }, [applyGifPickerOffset, clearGifPickerCloseTimeout, closeGifPicker])

  const openGifPicker = useCallback((roomId: string) => {
    clearGifPickerCloseTimeout()
    resetGifPickerSheet()
    setActiveGifPickerRoomId(roomId)
    setGifSearchInput('')
    setGifResults([])
    setGifError('')
    setGifLoading(false)
    setIsKeyboardOpen(false)
  }, [clearGifPickerCloseTimeout, resetGifPickerSheet])

  const toggleGifPicker = useCallback((roomId: string) => {
    if (activeGifPickerRoomId === roomId) {
      dismissGifPicker()
      return
    }

    openGifPicker(roomId)
  }, [activeGifPickerRoomId, dismissGifPicker, openGifPicker])

  const bindGifPickerSheetRef = useCallback((node: HTMLDivElement | null) => {
    gifPickerSheetRef.current = node
    if (!node) return
    node.style.transform = 'translate3d(0, 0, 0)'
    node.style.transition = ''
  }, [])

  const handleGifPickerHandleClick = useCallback(() => {
    if (gifPickerDraggedRef.current) {
      gifPickerDraggedRef.current = false
      return
    }

    dismissGifPicker()
  }, [dismissGifPicker])

  const handleGifPickerHandleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    dismissGifPicker()
  }, [dismissGifPicker])

  const handleGifPickerTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    clearGifPickerCloseTimeout()
    gifPickerDraggedRef.current = false
    gifPickerSheetDraggingRef.current = false
    gifPickerTouchScrollRef.current = e.target instanceof Element
      ? (e.target.closest('.gif-picker-grid') as HTMLDivElement | null)
      : null
    gifPickerTouchStartYRef.current = e.touches[0]?.clientY ?? null
  }, [clearGifPickerCloseTimeout])

  const handleGifPickerTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const startY = gifPickerTouchStartYRef.current
    const currentY = e.touches[0]?.clientY

    if (startY === null || currentY === undefined) return

    const dragDistance = currentY - startY
    const scrollEl = gifPickerTouchScrollRef.current
    const canDragSheet = gifPickerSheetDraggingRef.current || (dragDistance > 0 && (!scrollEl || scrollEl.scrollTop <= 0))

    if (!canDragSheet) return

    const nextOffset = Math.max(0, dragDistance)
    if (!gifPickerSheetDraggingRef.current) {
      const sheet = gifPickerSheetRef.current
      if (sheet) {
        sheet.style.transition = 'none'
      }
      gifPickerSheetDraggingRef.current = true
    }
    if (nextOffset > 3) {
      gifPickerDraggedRef.current = true
    }
    applyGifPickerOffset(nextOffset)

    e.preventDefault()
  }, [applyGifPickerOffset])

  const handleGifPickerTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const startY = gifPickerTouchStartYRef.current
    const endY = e.changedTouches[0]?.clientY
    const wasDraggingSheet = gifPickerSheetDraggingRef.current
    gifPickerTouchStartYRef.current = null
    gifPickerTouchScrollRef.current = null
    gifPickerSheetDraggingRef.current = false

    const sheet = gifPickerSheetRef.current
    if (sheet && wasDraggingSheet) {
      sheet.style.transition = ''
    }

    if (!wasDraggingSheet || startY === null || endY === undefined) return

    const dragDistance = Math.max(0, endY - startY)
    const sheetHeight = gifPickerSheetRef.current?.offsetHeight ?? 0
    const closeThreshold = sheetHeight > 0 ? sheetHeight * 0.2 : 64

    if (dragDistance >= closeThreshold) {
      dismissGifPicker()
      return
    }

    applyGifPickerOffset(0)
  }, [applyGifPickerOffset, dismissGifPicker])

  const handleGifPickerTouchCancel = useCallback(() => {
    gifPickerTouchStartYRef.current = null
    gifPickerDraggedRef.current = false
    gifPickerSheetDraggingRef.current = false
    gifPickerTouchScrollRef.current = null
    const sheet = gifPickerSheetRef.current
    if (sheet) {
      sheet.style.transition = ''
    }
    applyGifPickerOffset(0)
  }, [applyGifPickerOffset])

  const handleRoomMessagesClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>, roomId: string) => {
    if (activeGifPickerRoomId !== roomId) return
    e.preventDefault()
    e.stopPropagation()
    clearLongPress()
    dismissGifPicker()
  }, [activeGifPickerRoomId, clearLongPress, dismissGifPicker])

  useEffect(() => {
    closeGifPicker()
  }, [closeGifPicker, currentRoomIndex])

  useEffect(() => {
    return () => {
      clearGifPickerCloseTimeout()
      clearGifPickerFrame()
    }
  }, [clearGifPickerCloseTimeout, clearGifPickerFrame])

  const handleSend = async (roomId: string, overrideName?: string, overrideCollege?: string, contentOverride?: string) => {
    const rawText = contentOverride ?? inputTexts[roomId] ?? ''
    const text = rawText.trim()
    if (!text) return
    if (!isGifMessage(text) && isComposerMessageTooLong(rawText)) return
    const shouldUseOptimisticMessage = !isGifMessage(text)

    const userId = getCurrentUserId()
    const activeDisplayName = overrideName || displayName || localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)
    if (!activeDisplayName) {
      pendingSendRef.current = { roomId, contentOverride }
      setProfileModalMode('setup')
      setTempProfileName('')
      setTempProfileCollege('')
      setShowProfileModal(true)
      return
    }

    const activeCollege = overrideCollege !== undefined ? overrideCollege : (university || localStorage.getItem(COLLEGE_STORAGE_KEY) || '')
    const activeUsername = await ensureAccountUsername(activeDisplayName, activeCollege)
    if (!activeUsername) return
    pendingGifLoadScrollRoomIdRef.current = activeRoomId === roomId && isGifMessage(text) ? roomId : null
    const activeRoomName = rooms.find(room => room.id === roomId)?.headline || ''
    const tempId = `temp-${Date.now()}`
    const pendingMessageKey = getPendingMessageKey({
      room_id: roomId,
      display_name: activeDisplayName,
      content: text,
    })

    const optimisticMsg: Message = {
      id: tempId,
      renderKey: tempId,
      username: activeDisplayName,
      initials: getInitials(activeDisplayName),
      university: activeCollege,
      text,
      timestamp: formatTime(),
      room_name: activeRoomName,
      room_id: roomId,
      user_uuid: userId || null,
      senderUsername: activeUsername,
    }

    if (shouldUseOptimisticMessage && pendingMessageKey) {
      pendingOutgoingMessageIdsRef.current.set(pendingMessageKey, tempId)
    }

    if (shouldUseOptimisticMessage) {
      scheduleReveal(roomId, tempId, 0)

      setRoomMessages(prev => ({
        ...prev,
        [roomId]: [...(prev[roomId] || []), optimisticMsg]
      }))
    }
    if (contentOverride === undefined) {
      setInputTexts(prev => ({ ...prev, [roomId]: '' }))
      const inputEl = composerBarRef.current?.querySelector('[contenteditable]') as HTMLElement | null
      if (inputEl) inputEl.textContent = ''
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        content: text,
        display_name: activeDisplayName,
        college: activeCollege,
        room_name: activeRoomName,
        room_id: roomId,
        user_uuid: userId || null,
      })
      .select(MESSAGE_SELECT_COLUMNS)

    if (error) {
      if (pendingMessageKey) {
        pendingOutgoingMessageIdsRef.current.delete(pendingMessageKey)
      }
      if (shouldUseOptimisticMessage) {
        setRoomMessages(prev => ({
          ...prev,
          [roomId]: (prev[roomId] || []).filter(m => m.id !== tempId)
        }))
      }
      return
    }

    if (data && data[0]) {
      if (pendingMessageKey) {
        pendingOutgoingMessageIdsRef.current.delete(pendingMessageKey)
      }

      const normalizedMessage = normalizeMessageRow(data[0])
      if (!normalizedMessage) {
        return
      }

      const serverMessage = buildMessageFromRow(normalizedMessage, activeUsername)
      setRoomMessages(prev => ({
        ...prev,
        [roomId]: (() => {
          const existing = prev[roomId] || []
          const withoutTemp = existing.filter(msg => msg.id !== tempId)

          if (withoutTemp.some(msg => msg.id === serverMessage.id)) {
            return withoutTemp
          }

          return existing.some(msg => msg.id === tempId)
            ? existing.map(msg => msg.id === tempId
              ? { ...serverMessage, renderKey: msg.renderKey || tempId }
              : msg)
            : [...withoutTemp, serverMessage]
        })(),
      }))

      if (shouldUseOptimisticMessage) {
        replaceVisibleMessageId(roomId, tempId, serverMessage.id)
      }

      // Ensure the server-returned success message is also revealed
      scheduleReveal(roomId, serverMessage.id, 0)
      handleNotificationPromptAfterSend()
      void triggerServerPush({
        roomId,
        messageId: serverMessage.id,
      })
      trackMessageSent(roomId, activeRoomName)
      await incrementUserMessagesSent(activeUsername)
      await updateRoomMessageStats(roomId, activeUsername)
    }
  }

  const handleComposerKeyDown = (roomId: string, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return

    event.preventDefault()

    const currentText = inputTexts[roomId] ?? event.currentTarget.textContent ?? ''
    if (isComposerMessageEmpty(currentText) || isComposerMessageTooLong(currentText)) return

    void handleSend(roomId)
  }

  const handleGifSelect = async (roomId: string, gifUrl: string) => {
    const trimmedGifUrl = gifUrl.trim()
    if (!trimmedGifUrl) return

    closeGifPicker()
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
    setProfileJoinedAt((current) => current || new Date().toISOString())
    setProfileModalMode('preview')
    setShowProfileModal(true)
    setTempProfileName('')
    setTempProfileCollege('')
    await upsertUserProfile({
      displayName: name,
      username: nextUsername,
      college,
      avatarUrl,
    })

    if (pendingSendRef.current) {
      void handleSend(pendingSendRef.current.roomId, name, college, pendingSendRef.current.contentOverride)
      pendingSendRef.current = null
    }
  }

  const handleExtendedProfileSave = async (e?: FormEvent) => {
    e?.preventDefault()
    e?.stopPropagation()

    const nextExtendedProfile = buildExtendedProfileFields(profileDraft)
    setProfileSaveState('saving')

    const didSave = await upsertUserProfile({
      branch: nextExtendedProfile.branch,
      year: nextExtendedProfile.year,
      bio: nextExtendedProfile.bio,
      interests: nextExtendedProfile.interests,
      favMovie: nextExtendedProfile.favMovie,
      relationshipStatus: nextExtendedProfile.relationshipStatus,
    })

    if (!didSave) {
      setProfileSaveState('error')
      return
    }

    setExtendedProfile(nextExtendedProfile)
    setProfileDraft(buildProfileDraft(nextExtendedProfile))
    setProfileSaveState('idle')
    setProfileModalMode('preview')
    profileSheetTouchStartYRef.current = null
    setProfileSheetDragging(false)
    applyProfileSheetOffset(0)
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
    setProfileModalMode(displayName.trim() ? 'edit' : 'setup')
    setTempProfileName('')
    setTempProfileCollege('')
    setProfileDraft(buildProfileDraft(extendedProfile))
  }

  const handleProfileButtonClick = () => {
    setProfileModalMode(displayName.trim() ? 'preview' : 'setup')
    setProfileDraft(buildProfileDraft(extendedProfile))
    setShowProfileModal(true)
  }

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          text: "aa akha gujrat university ni group chat che try kari jo",
          url: 'https://spreadz.in',
        })
      } catch (error) {
        console.log('[Share] error:', error)
      }
    }
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

  const openReadOnlyProfile = useCallback(async (message: Message, fallbackAvatarUrl?: string | null) => {
    const nextRequestId = readOnlyProfileRequestIdRef.current + 1
    readOnlyProfileRequestIdRef.current = nextRequestId

    const fallbackProfile: ReadOnlyProfile = {
      displayName: message.username,
      handle: message.senderUsername || '',
      college: message.university || '',
      avatarUrl: fallbackAvatarUrl || null,
      joinedAt: message.created_at || null,
      branch: '',
      year: '',
      bio: '',
      interests: [],
      favMovie: '',
      relationshipStatus: '',
      limitedByPrivacy: false,
      reportMessage: message,
    }

    setReadOnlyProfile(fallbackProfile)

    const profileUserId = message.user_uuid?.trim()
    if (!profileUserId) {
      return
    }

    const { data, error } = await supabase
      .from('users')
      .select('display_name, username, college, avatar_url, created_at, branch, year, bio, interests, fav_movie, relationship_status')
      .eq('uuid', profileUserId)
      .maybeSingle()

    if (error) {
      console.error('[Users] read-only profile fetch failed:', error)
      return
    }

    if (!data || readOnlyProfileRequestIdRef.current !== nextRequestId) {
      return
    }

    const resolvedCollege = normalizeProfileText(data.college) || fallbackProfile.college
    const limitedByPrivacy = false

    setReadOnlyProfile({
      displayName: normalizeProfileText(data.display_name) || fallbackProfile.displayName,
      handle: normalizeProfileText(data.username) || fallbackProfile.handle,
      college: resolvedCollege,
      avatarUrl: normalizeProfileText(data.avatar_url) || fallbackProfile.avatarUrl,
      joinedAt: data.created_at || fallbackProfile.joinedAt,
      branch: limitedByPrivacy ? '' : normalizeProfileText(data.branch),
      year: limitedByPrivacy ? '' : normalizeProfileText(data.year),
      bio: limitedByPrivacy ? '' : normalizeProfileText(data.bio),
      interests: limitedByPrivacy ? [] : normalizeProfileInterests(data.interests),
      favMovie: limitedByPrivacy ? '' : normalizeProfileText(data.fav_movie),
      relationshipStatus: limitedByPrivacy ? '' : normalizeProfileText(data.relationship_status),
      limitedByPrivacy,
      reportMessage: message,
    })
  }, [])

  const closeReadOnlyProfile = useCallback(() => {
    readOnlyProfileRequestIdRef.current += 1
    setReadOnlyProfile(null)
  }, [])

  const handleReadOnlyProfileReport = () => {
    const reportMessage = readOnlyProfile?.reportMessage
    if (!reportMessage) return
    pendingProfileReportMessageRef.current = reportMessage
    setReadOnlyProfile(null)
  }

  const handleReadOnlyProfileMute = useCallback(async () => {
    const didToggleMute = await handleMuteToggle(readOnlyProfile?.reportMessage?.user_uuid)
    if (!didToggleMute) return
    setReadOnlyProfile(null)
  }, [handleMuteToggle, readOnlyProfile])

  const renderMessageBody = (msg: Message) => {
    if (isGifMessage(msg.text)) {
      const gifUrl = getGifUrlFromMessage(msg.text)
      if (!gifUrl) return null

      return (
        <div className="msg-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gifUrl}
            alt="GIF"
            className="msg-gif"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            loading="eager"
            decoding="async"
            draggable={false}
            onLoad={() => {
              handleGifMediaLoad(msg.room_id)
            }}
            onError={(e) => {
              const wrapper = e.currentTarget.parentElement as HTMLDivElement | null
              if (wrapper) {
                wrapper.style.display = 'none'
              }
              if (pendingGifLoadScrollRoomIdRef.current === msg.room_id) {
                pendingGifLoadScrollRoomIdRef.current = null
              }
            }}
          />
        </div>
      )
    }

    return <div className="msg-text">{msg.text}</div>
  }

  if (!isMounted) {
    return (
      <ChatStatusScreen
        eyebrow="Chat"
        title="Starting chat..."
        description="Preparing the chat client for this device."
        showSpinner
      />
    )
  }

  if (authErrorMessage) {
    return (
      <ChatStatusScreen
        eyebrow="Chat"
        title="We couldn't sign you in"
        description={authErrorMessage}
        actionLabel="Reload"
        onAction={() => {
          if (typeof window !== 'undefined') window.location.reload()
        }}
        tone="error"
      />
    )
  }

  if (!authReady) {
    return (
      <ChatStatusScreen
        eyebrow="Chat"
        title="Signing you in..."
        description="Connecting your chat session."
        showSpinner
      />
    )
  }

  if (roomFeedStatus === 'idle' || roomFeedStatus === 'loading') {
    return (
      <div className="chat-loading-shell" role="status" aria-live="polite" aria-busy="true">
        <div className="chat-loading-rail" aria-hidden="true" />
        <span className="chat-visually-hidden">Loading chat rooms.</span>
      </div>
    )
  }

  const hasSavedProfileName = Boolean(displayName.trim())
  const profileHandle = accountUsername.trim()
  const profileHandleLabel = profileHandle ? `@${profileHandle.replace(/^@/, '')}` : '@pending'
  const currentAvatarUrl = avatarUrl.trim()
  const hasAvatarPhoto = Boolean(currentAvatarUrl)
  const profilePreviewName = tempProfileName.trim() || displayName.trim() || 'User'
  const profilePreviewInitials = getInitials(profilePreviewName)
  const profilePreviewColor = getUserColor(profilePreviewName)
  const isComposerExpanded = isKeyboardOpen || Boolean(activeGifPickerRoomId)
  const resolvedRoomIndex = rooms.length === 0
    ? 0
    : Math.max(0, Math.min(currentRoomIndex, rooms.length - 1))
  const activeRoom = rooms[resolvedRoomIndex]
  const visibleRoomIndexes = [resolvedRoomIndex - 1, resolvedRoomIndex, resolvedRoomIndex + 1]
    .filter(index => index >= 0 && index < rooms.length)
  const isProfileSetupMode = profileModalMode === 'setup'
  const isProfileEditMode = profileModalMode === 'edit'
  const isProfileSettingsMode = profileModalMode === 'settings'
  const isProfilePreviewMode = profileModalMode === 'preview'
  const canCloseOwnProfileModal = !isProfileSetupMode || hasSavedProfileName
  const profileDraftInterests = normalizeProfileInterests(profileDraft.interestsInput)
  const savedProfileName = displayName.trim() || 'User'
  const savedProfileCollege = university.trim() || 'College not set'
  const ownProfileSheetProfile: ProfileSheetProfile | null = hasSavedProfileName
    ? {
      displayName: savedProfileName,
      handle: accountUsername,
      college: university,
      avatarUrl: currentAvatarUrl || null,
      joinedAt: profileJoinedAt,
      branch: extendedProfile.branch,
      year: extendedProfile.year,
      bio: extendedProfile.bio,
      interests: extendedProfile.interests,
      favMovie: extendedProfile.favMovie,
      relationshipStatus: extendedProfile.relationshipStatus,
      limitedByPrivacy: false,
    }
    : null
  const ownProfilePrimaryAction: ProfileSheetAction = {
    label: 'Edit',
    onClick: () => {
      setProfileModalMode('edit')
      setProfileDraft(buildProfileDraft(extendedProfile))
    },
    tone: 'default',
  }
  const readOnlyProfileSheetProfile: ProfileSheetProfile | null = readOnlyProfile
    ? {
      displayName: readOnlyProfile.displayName,
      handle: readOnlyProfile.handle,
      college: readOnlyProfile.college,
      avatarUrl: readOnlyProfile.avatarUrl,
      joinedAt: readOnlyProfile.joinedAt,
      branch: readOnlyProfile.branch,
      year: readOnlyProfile.year,
      bio: readOnlyProfile.bio,
      interests: readOnlyProfile.interests,
      favMovie: readOnlyProfile.favMovie,
      relationshipStatus: readOnlyProfile.relationshipStatus,
      limitedByPrivacy: readOnlyProfile.limitedByPrivacy,
    }
    : null
  const readOnlyProfileActions: ProfileSheetAction[] = []
  if (readOnlyProfile?.reportMessage?.user_uuid && readOnlyProfile.reportMessage.user_uuid !== getCurrentUserId()) {
    readOnlyProfileActions.push({
      label: muteStatus === 'submitting'
        ? (isMutedUser(readOnlyProfile.reportMessage?.user_uuid) ? 'Unmuting...' : 'Muting...')
        : (isMutedUser(readOnlyProfile.reportMessage?.user_uuid) ? 'Unmute' : 'Mute'),
      onClick: handleReadOnlyProfileMute,
      disabled: muteStatus === 'submitting',
    })
  }
  readOnlyProfileActions.push({
    label: 'Report User',
    onClick: handleReadOnlyProfileReport,
  })

  if (!activeRoom) {
    const hasRooms = rooms.length > 0
    const fallbackTitle = roomFeedErrorMessage
      ? 'Could not load chat rooms'
      : hasRooms
        ? 'We lost track of the current room'
        : 'No live rooms yet'
    const fallbackDescription = roomFeedErrorMessage
      || (hasRooms
        ? 'The room list loaded, but the selected room is unavailable. Reload the room feed to continue.'
        : 'There are no chat rooms ready right now. Try refreshing the room feed in a moment.')

    return (
      <ChatStatusScreen
        eyebrow="Rooms"
        title={fallbackTitle}
        description={fallbackDescription}
        actionLabel="Retry"
        onAction={() => {
          void fetchRooms('manual-retry')
        }}
        tone={roomFeedErrorMessage ? 'error' : 'default'}
      />
    )
  }

  return (
    <>
      <div
        className="rooms-container"
        ref={roomsContainerRef}
      >
        {visibleRoomIndexes.map((index) => {
          const room = rooms[index]
          const messages = roomMessages[room.id] || []
          const messageStatus = roomMessageStatusByRoom[room.id] ?? 'idle'
          const roomSeededAvatarMap = seededAvatarMap[room.id] || {}
          const visibleMessageIds = visibleMessageIdsByRoom[room.id] || EMPTY_VISIBLE_MESSAGE_IDS
          const scriptMsg = messages.find(m => m.username === 'SYSTEM_SEEDING_SCRIPT')
          const joinedAt = userJoinedAtByRoom[room.id]
          const elapsed = joinedAt ? (currentTime - joinedAt) / 1000 : 0
          const roomVisibleIds = new Set(visibleMessageIds)
          let augmentedMessages = messages
          let ghostTypingPersona: string | null = null
          if (scriptMsg && joinedAt) {
            try {
              const script = JSON.parse(scriptMsg.text) as any[]
              // First 2 messages are always visible immediately on room load.
              // From index 2 onwards, normal drip-feed timing applies.
              const ghostMessages = script
                .filter((m, i) => i < 2 || m.postAtSeconds <= elapsed)
                .map(m => {
                  const ghostId = `ghost-${room.id}-${m.order}`
                  roomVisibleIds.add(ghostId)
                  return {
                    id: ghostId,
                    username: m.displayName,
                    initials: getInitials(m.displayName),
                    university: m.college,
                    text: m.messageText,
                    timestamp: formatTime(new Date(joinedAt + m.postAtSeconds * 1000).toISOString()),
                    created_at: new Date(joinedAt + m.postAtSeconds * 1000).toISOString(),
                    room_id: room.id,
                    room_name: room.headline,
                  }
                })

              // Next pending script entry is the "typing" persona.
              // Skip the first 2 (already force-visible) when looking for what's next.
              const nextPending = script
                .filter((m, i) => i >= 2 && m.postAtSeconds > elapsed)
                .sort((a, b) => a.postAtSeconds - b.postAtSeconds)[0]
              ghostTypingPersona = nextPending ? (nextPending.displayName as string) : null

              augmentedMessages = [
                ...messages.filter(m => m.username !== 'SYSTEM_SEEDING_SCRIPT'),
                ...ghostMessages
              ].sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
            } catch (e) {
              augmentedMessages = messages.filter(m => m.username !== 'SYSTEM_SEEDING_SCRIPT')
            }
          } else {
            augmentedMessages = messages.filter(m => m.username !== 'SYSTEM_SEEDING_SCRIPT')
          }

          const renderableMessages = getRenderableMessages({
            messages: augmentedMessages,
            visibleMessageIds: roomVisibleIds,
            isMutedUser,
          }) as Message[]
          const showMessageLoadingState = messages.length === 0 && (messageStatus === 'idle' || messageStatus === 'loading')
          const showMessageErrorState = messages.length === 0 && messageStatus === 'error'
          const showEmptyRoomState = messages.length === 0 && messageStatus === 'ready'
          const showMutedRoomState = messages.length > 0 && renderableMessages.length === 0
          const isCurrentRoom = index === resolvedRoomIndex
          const isGifPickerOpen = activeGifPickerRoomId === room.id
          const composerText = inputTexts[room.id] ?? ''
          const remainingCharacters = Math.max(0, MESSAGE_MAX_LENGTH - composerText.length)
          const showComposerCounter = composerText.length > MESSAGE_COUNTER_THRESHOLD
          const isComposerAtLimit = composerText.length >= MESSAGE_MAX_LENGTH
          const isSendDisabled = isComposerMessageEmpty(composerText) || isComposerMessageTooLong(composerText)
          const roomPanelClassName = `room-panel ${isCurrentRoom ? 'active-room' : (index < resolvedRoomIndex ? 'room-before' : 'room-after')}`

          return (
            <div
              key={room.id}
              className={roomPanelClassName}
              ref={(el) => {
                roomPanelRefs.current[index] = el
              }}
              style={{ background: 'var(--bg)' }}
            >
              <div className={`header${isComposerExpanded ? ' hidden' : ''}`}>
                <div className="header-side" aria-hidden="true" />
                <div className="logo">
                  <Image src="/spreadz-logo.png" alt="SpreadZ" className="logo-img" width={176} height={88} priority unoptimized />
                </div>
                <div className="header-side">
                  <button 
                    type="button" 
                    className="share-btn" 
                    onClick={handleShare}
                    aria-label="Share"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </button>
                </div>
              </div>

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

              <div
                ref={isCurrentRoom ? activeRoomMessagesRef : undefined}
                className="room-messages"
                onClickCapture={isCurrentRoom ? (e) => handleRoomMessagesClickCapture(e, room.id) : undefined}
                onTouchStart={isCurrentRoom ? handleTouchStart : undefined}
                onTouchMove={isCurrentRoom ? handleTouchMove : undefined}
                onTouchEnd={isCurrentRoom ? handleTouchEnd : undefined}
                onTouchCancel={isCurrentRoom ? handleTouchCancel : undefined}
                onScroll={(e) => updateRoomBottomState(room.id, e.currentTarget)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); return false }}
              >
                {isCurrentRoom && showGlobalChatPopup && (
                  <div className="chat-notification-popup-shell">
                    <NotificationPopup
                      message={GLOBAL_CHAT_POPUP_COPY}
                      onClose={dismissGlobalChatPopup}
                    />
                  </div>
                )}
                <div ref={isCurrentRoom ? activeMessagesRef : undefined} className="messages">
                  <div className="messages-spacer" aria-hidden="true" />
                  {showMessageLoadingState && (
                    <div className="room-message-state" role="status" aria-live="polite">
                      <div className="room-message-state-title">Loading messages...</div>
                      <div className="room-message-state-copy">Pulling the latest conversation for this room.</div>
                    </div>
                  )}
                  {showMessageErrorState && (
                    <div className="room-message-state error" role="status" aria-live="polite">
                      <div className="room-message-state-title">Could not load messages</div>
                      <div className="room-message-state-copy">This room is available, but its message history did not load yet.</div>
                      <button
                        type="button"
                        className="room-message-state-button"
                        onClick={() => {
                          void fetchMessagesForRoom(room, { force: true, revealMode: 'instant' })
                        }}
                      >
                        Retry messages
                      </button>
                    </div>
                  )}
                  {showEmptyRoomState && (
                    <div className="room-message-state" role="status" aria-live="polite">
                      <div className="room-message-state-title">No messages yet</div>
                      <div className="room-message-state-copy">Be the first person to start this conversation.</div>
                    </div>
                  )}
                  {showMutedRoomState && (
                    <div className="room-message-state" role="status" aria-live="polite">
                      <div className="room-message-state-title">Messages hidden</div>
                      <div className="room-message-state-copy">This room has messages, but they are hidden because you muted the people who sent them.</div>
                    </div>
                  )}
                  {renderableMessages.map((msg, visibleIndex) => {
                    const isFirstInGroup = visibleIndex === 0 || renderableMessages[visibleIndex - 1].username !== msg.username
                    const isOwnMessage = msg.senderUsername === getCurrentUsername()
                    const showOwnMessageAvatar = isOwnMessage && hasAvatarPhoto
                    const seededMessageAvatarUrl = roomSeededAvatarMap[msg.username.trim()]?.trim() || ''
                    const messageAvatarUrl = seededMessageAvatarUrl || (showOwnMessageAvatar ? currentAvatarUrl : (msg.avatarUrl?.trim() || ''))
                    const isReadOnlyProfileAvatar = isFirstInGroup && !isOwnMessage
                    const isAvatarLoaded = messageAvatarUrl && loadedAvatarUrls.has(messageAvatarUrl)

                    return (
                      <div key={msg.renderKey || msg.id} className={`msg-reveal${isGifMessage(msg.text) ? ' has-media' : ''}`}
                        onMouseDown={() => startLongPress(msg)}
                        onMouseUp={clearLongPress}
                        onMouseLeave={clearLongPress}
                        onTouchStart={() => startLongPress(msg)}
                        onTouchEnd={clearLongPress}
                        onTouchCancel={clearLongPress}
                        onTouchMove={clearLongPress}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); return false }}
                      >
                        {isFirstInGroup && visibleIndex !== 0 && <div className="group-divider" />}
                        <div className={`msg ${isFirstInGroup ? 'group-start' : 'group-continuation'}`}>
                          {isFirstInGroup ? (
                            <>
                              <div
                                className={`avatar${isReadOnlyProfileAvatar ? ' clickable' : ''}`}
                                style={isAvatarLoaded ? undefined : { backgroundColor: getUserColor(msg.username) }}
                                onClick={isReadOnlyProfileAvatar ? (e) => {
                                  e.stopPropagation()
                                  void openReadOnlyProfile(msg, messageAvatarUrl || null)
                                } : undefined}
                              >
                                {isAvatarLoaded ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={messageAvatarUrl}
                                    alt={`${msg.username} profile`}
                                    className="profile-avatar-image"
                                    style={{ borderRadius: '50%' }}
                                    draggable={false}
                                    onLoad={() => {
                                      if (!loadedAvatarUrls.has(messageAvatarUrl)) {
                                        setLoadedAvatarUrls(prev => new Set(prev).add(messageAvatarUrl))
                                      }
                                    }}
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

              {isCurrentRoom && showJumpToLatest && messages.length > 0 && (
                <button
                  type="button"
                  className="jump-latest-btn"
                  onClick={() => scrollCurrentRoomToBottom('smooth')}
                  aria-label="Jump to latest messages"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v12" />
                    <path d="m7 13 5 5 5-5" />
                  </svg>
                </button>
              )}

              <div ref={isCurrentRoom ? composerLayerRef : undefined} className="composer-layer">
                {isGifPickerOpen && (
                  <div
                    ref={bindGifPickerSheetRef}
                    className="gif-picker"
                    onTouchStart={handleGifPickerTouchStart}
                    onTouchMove={handleGifPickerTouchMove}
                    onTouchEnd={handleGifPickerTouchEnd}
                    onTouchCancel={handleGifPickerTouchCancel}
                  >
                    <div className="gif-picker-topline">
                      <div
                        className="gif-picker-handle-zone"
                        role="button"
                        tabIndex={0}
                        aria-label="Close GIF picker"
                        onClick={handleGifPickerHandleClick}
                        onKeyDown={handleGifPickerHandleKeyDown}
                      >
                        <span className="gif-picker-handle" />
                      </div>
                    </div>
                    <div className="gif-picker-header">
                      <div className="gif-picker-header-copy">
                        <div className="gif-picker-title">GIFs</div>
                        <div className="gif-picker-mode">{gifSearchInput.trim() ? 'SEARCH' : 'TRENDING'}</div>
                      </div>
                      <button
                        type="button"
                        className="gif-picker-close"
                        aria-label="Close GIF picker"
                        onClick={dismissGifPicker}
                      >
                        Close
                      </button>
                    </div>
                    <div className="gif-search-shell">
                      <span className="gif-search-icon" aria-hidden="true">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="7" cy="7" r="4.5" />
                          <path d="M10.5 10.5 14 14" />
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
                    </div>
                    <div ref={gifPickerGridRef} className="gif-picker-grid">
                      {gifLoading && <div className="gif-picker-status">Loading GIFs...</div>}
                      {!gifLoading && gifError && <div className="gif-picker-status">{gifError}</div>}
                      {!gifLoading && !gifError && gifResults.length === 0 && (
                        <div className="gif-picker-status">No GIFs found.</div>
                      )}
                      {!gifLoading && !gifError && gifResults.map((gif) => (
                        <button
                          key={gif.id}
                          type="button"
                          className="gif-tile"
                          onClick={() => void handleGifSelect(room.id, gif.url)}
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
                              referrerPolicy="no-referrer"
                              crossOrigin="anonymous"
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                            />
                            <span className="gif-tile-badge" aria-hidden="true">GIF</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div ref={isCurrentRoom ? composerAreaRef : undefined} className="input-area global-composer">
                  {isCurrentRoom && (ghostTypingPersona || typingUsers.length > 0) && (
                    <div className="typing-indicator">
                      <div className="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                      <div className="typing-text">
                        {ghostTypingPersona ? (
                          <><b>{ghostTypingPersona}</b> is typing...</>
                        ) : typingUsers.length === 1 ? (
                          <><b>{typingUsers[0]}</b> is typing...</>
                        ) : typingUsers.length === 2 ? (
                          <><b>{typingUsers[0]}</b> and <b>{typingUsers[1]}</b> are typing...</>
                        ) : (
                          <><b>Several people</b> are typing...</>
                        )}
                      </div>
                    </div>
                  )}
                  <div
                    ref={isCurrentRoom ? composerBarRef : undefined}
                    className="input-wrap"
                  >
                    <div
                      contentEditable={true}
                      role="textbox"
                      aria-multiline="false"
                      aria-label="Say something..."
                      data-placeholder="Say something..."
                      className="chat-input-editable"
                      onBeforeInput={handleComposerBeforeInput}
                      onInput={(e) => handleComposerInput(room.id, e.currentTarget)}
                      onPaste={(e) => handleComposerPaste(room.id, e)}
                      onKeyDown={(e) => handleComposerKeyDown(room.id, e)}
                      onFocus={() => {
                        setIsKeyboardOpen(true)
                        if (activeGifPickerRoomId === room.id) {
                          closeGifPicker()
                        }
                      }}
                      onBlur={() => {
                        setIsKeyboardOpen(false)
                      }}
                      suppressContentEditableWarning={true}
                    />
                    <button
                      type="button"
                      className={`gif-btn${isGifPickerOpen ? ' active' : ''}`}
                      aria-label={isGifPickerOpen ? 'Close GIF picker' : 'Open GIF picker'}
                      title={isGifPickerOpen ? 'Close GIF picker' : 'Open GIF picker'}
                      onClick={() => toggleGifPicker(room.id)}
                    >
                      <span className="gif-btn-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="8" />
                          <path d="M9.2 10.2h.01" />
                          <path d="M14.8 10.2h.01" />
                          <path d="M8.8 14.1c.84 1 1.92 1.5 3.2 1.5 1.28 0 2.34-.5 3.2-1.5" />
                        </svg>
                      </span>
                    </button>
                    {showComposerCounter && (
                      <span
                        className={`composer-counter${isComposerAtLimit ? ' limit' : ''}`}
                        aria-live="polite"
                      >
                        {remainingCharacters}
                      </span>
                    )}
                    <button
                      type="button"
                      className="send-btn"
                      aria-label="Send"
                      disabled={isSendDisabled}
                      onClick={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement
                        btn.blur()
                        void handleSend(room.id)
                      }}
                    >
                      <svg
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M21 3L10.4 13.6" />
                        <path d="M21 3L14.8 20.4L10.4 13.6L3.6 9.2L21 3Z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <nav className="chat-bottom-nav" aria-label="Chat navigation">
        <Link href="/chat" className="chat-bottom-nav-tab active" aria-current="page">
          <span className="chat-bottom-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17.5 3.5 20V7.5A2.5 2.5 0 0 1 6 5h12a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 17H7Z" />
              <path d="M8 9.5h8" />
              <path d="M8 13h5.5" />
            </svg>
          </span>
          <span className="chat-bottom-nav-label">University Chat</span>
        </Link>

        <Link href="/directory" className="chat-bottom-nav-tab" aria-label="Open your college directory">
          <span className="chat-bottom-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18" />
              <path d="M5 21V7l7-4 7 4v14" />
              <path d="M9 21v-6h6v6" />
              <path d="M9 10h.01" />
              <path d="M15 10h.01" />
              <path d="M9 14h.01" />
              <path d="M15 14h.01" />
            </svg>
          </span>
          <span className="chat-bottom-nav-label">Your College</span>
        </Link>

        <button type="button" className="chat-bottom-nav-tab" onClick={handleProfileButtonClick} aria-label="Open profile">
          {hasAvatarPhoto ? (
            <span className="chat-bottom-nav-avatar" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentAvatarUrl} alt="" className="chat-bottom-nav-avatar-image" />
            </span>
          ) : (
            <span className="chat-bottom-nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
            </span>
          )}
          <span className="chat-bottom-nav-label">You</span>
        </button>
      </nav>

      <ProfileSheet
        open={Boolean(readOnlyProfileSheetProfile)}
        profile={readOnlyProfileSheetProfile}
        onClose={closeReadOnlyProfile}
        actions={readOnlyProfileActions}
        statusMessage={muteStatus === 'error' ? 'Mute failed' : ''}
      />

      <ProfileSheet
        open={showProfileModal && isProfilePreviewMode}
        profile={ownProfileSheetProfile}
        onClose={closeProfileModal}
        onSettingsClick={() => setProfileModalMode('settings')}
        showExtended
        primaryAction={ownProfilePrimaryAction}
      />

      {showProfileModal && !isProfilePreviewMode && (
        <div
          className="profile-overlay"
          onClick={() => {
            if (canCloseOwnProfileModal) closeProfileModal()
          }}
        >
          <form
            ref={profileSheetRef}
            className={`profile-sheet${isProfileEditMode ? ' profile-sheet-edit-mode' : ''}${isProfileSettingsMode ? ' profile-sheet-settings-mode' : ''}${profileSheetDragging ? ' dragging' : ''}`}
            onSubmit={isProfileSetupMode ? handleProfileSubmit : handleExtendedProfileSave}
            onClick={(e) => e.stopPropagation()}
          >
            {isProfileEditMode || isProfileSettingsMode ? (
              <>
                <div className={`profile-sheet-topbar${isProfileSettingsMode ? ' profile-sheet-settings-topbar' : ''}`}>
                  <button
                    type="button"
                    className="profile-back-button"
                    aria-label="Back to chat"
                    onClick={() => {
                      closeProfileModal()
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  {isProfileSettingsMode && (
                    <div className="profile-title-group">
                      <div className="profile-title">Settings</div>
                      <div className="profile-settings-handle">@{accountUsername}</div>
                    </div>
                  )}
                </div>
                {isProfileSettingsMode ? (
                  <div className="profile-settings-view">
                    <div className="profile-settings-search-wrap">
                      <div className="profile-settings-search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.3-4.3" />
                        </svg>
                        <input type="text" placeholder="Search settings" value={searchSettingsQuery} onChange={(e) => setSearchSettingsQuery(e.target.value)} />
                      </div>
                    </div>
                    <div className="profile-settings-list">
                      {(!searchSettingsQuery || "muted users manage the people you've silenced".includes(searchSettingsQuery.toLowerCase())) && (
                        <Link href="/about?section=muted" className="profile-settings-link" onClick={closeProfileModal}>
                          <div className="profile-settings-link-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M11 5L6 9H2v6h4l5 4V5z" />
                              <line x1="23" y1="9" x2="17" y2="15" />
                              <line x1="17" y1="9" x2="23" y2="15" />
                            </svg>
                          </div>
                          <div className="profile-settings-link-content">
                            <div className="profile-settings-link-title">Muted Users</div>
                            <div className="profile-settings-link-desc">Manage the people you&apos;ve silenced</div>
                          </div>
                          <div className="profile-settings-link-arrow">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </div>
                        </Link>
                      )}


                      {(!searchSettingsQuery || "about spreadz guidelines, privacy, and more".includes(searchSettingsQuery.toLowerCase())) && (
                        <Link href="/about?section=about" className="profile-settings-link" onClick={closeProfileModal}>
                          <div className="profile-settings-link-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="16" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                          </div>
                          <div className="profile-settings-link-content">
                            <div className="profile-settings-link-title">About Spreadz</div>
                            <div className="profile-settings-link-desc">Guidelines, Privacy, and more</div>
                          </div>
                          <div className="profile-settings-link-arrow">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </div>
                        </Link>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="profile-edit-header">
                  <div
                    className="profile-avatar-preview profile-edit-avatar"
                    style={!hasAvatarPhoto ? { backgroundColor: profilePreviewColor } : undefined}
                    onClick={() => {
                      if (!avatarUploading) avatarInputRef.current?.click()
                    }}
                  >
                    {hasAvatarPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`modal-${currentAvatarUrl}`}
                        src={currentAvatarUrl}
                        alt="Your profile"
                        className="profile-sheet-avatar-image"
                        draggable={false}
                      />
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
                  <div className="profile-edit-identity">
                    <div className="profile-edit-name">{savedProfileName}</div>
                    <div className="profile-edit-handle">{profileHandleLabel}</div>
                    <div className="profile-edit-college">{savedProfileCollege}</div>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="profile-avatar-input"
                    onChange={handleAvatarFileChange}
                  />
                </div>
                {avatarUploading && <div className="profile-avatar-status profile-edit-avatar-status">Uploading photo...</div>}
                <div className="profile-field">
                  <label className="profile-label" htmlFor="profile-branch">Branch</label>
                  <input
                    id="profile-branch"
                    type="text"
                    placeholder="e.g. CSE"
                    value={profileDraft.branch}
                    onChange={(e) => updateProfileDraft({ branch: e.target.value })}
                    className="profile-input"
                  />
                </div>
                <div className="profile-field">
                  <label className="profile-label" htmlFor="profile-year">Year</label>
                  <input
                    id="profile-year"
                    type="text"
                    placeholder="e.g. 2nd year"
                    value={profileDraft.year}
                    onChange={(e) => updateProfileDraft({ year: e.target.value })}
                    className="profile-input"
                  />
                </div>
                <div className="profile-field">
                  <label className="profile-label" htmlFor="profile-bio">Bio</label>
                  <textarea
                    id="profile-bio"
                    placeholder="Say a little about yourself"
                    value={profileDraft.bio}
                    onChange={(e) => updateProfileDraft({ bio: e.target.value })}
                    className="profile-input profile-textarea"
                    rows={4}
                  />
                </div>
                <div className="profile-field">
                  <label className="profile-label" htmlFor="profile-interests">Interests</label>
                  <input
                    id="profile-interests"
                    type="text"
                    placeholder="Music, football, anime"
                    value={profileDraft.interestsInput}
                    onChange={(e) => updateProfileDraft({ interestsInput: e.target.value })}
                    className="profile-input"
                  />
                  {profileDraftInterests.length > 0 && (
                    <div className="profile-tags-preview">
                      {profileDraftInterests.map((interest) => (
                        <span key={interest} className="profile-tag">{interest}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="profile-field">
                  <div className="profile-label-row">
                    <label className="profile-label" htmlFor="profile-fav-movie">Favorite movie</label>
                    <span className="profile-label-note">(optional) • only visible to your college students</span>
                  </div>
                  <input
                    id="profile-fav-movie"
                    type="text"
                    placeholder="Your all-time favorite"
                    value={profileDraft.favMovie}
                    onChange={(e) => updateProfileDraft({ favMovie: e.target.value })}
                    className="profile-input"
                  />
                </div>
                <div className="profile-field">
                  <div className="profile-label-row">
                    <label className="profile-label" htmlFor="profile-relationship-status">Relationship status</label>
                    <span className="profile-label-note">(optional) • only visible to your college students</span>
                  </div>
                  <input
                    id="profile-relationship-status"
                    type="text"
                    placeholder="Single, taken, it's complicated..."
                    value={profileDraft.relationshipStatus}
                    onChange={(e) => updateProfileDraft({ relationshipStatus: e.target.value })}
                    className="profile-input"
                  />
                </div>
                <button type="submit" className="profile-submit" disabled={profileSaveState === 'saving'}>
                  {profileSaveState === 'saving' ? 'Saving...' : 'Save'}
                </button>
                {profileSaveState === 'error' && <div className="profile-save-status error">Could not save right now.</div>}
              </>
            )}
          </>
        ) : (
              <>
                <div className="profile-sheet-topbar">
                  {canCloseOwnProfileModal ? (
                    <button
                      type="button"
                      className="profile-back-button"
                      aria-label="Back to chat"
                      onClick={closeProfileModal}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                    </button>
                  ) : <div className="profile-back-button-placeholder" />}
                </div>
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
                <div className="profile-legal-copy">
                  By saving, you agree to our{' '}
                  <Link href="/terms" className="profile-legal-link">
                    Terms of Service
                  </Link>{' '}
                  ,{' '}
                  <Link href="/privacy-policy" className="profile-legal-link">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/community-guidelines" className="profile-legal-link">
                    Community Guidelines
                  </Link>
                </div>
                <button type="submit" className="profile-submit">Save</button>
              </>
            )}
          </form>
        </div>
      )}

      <BackFeedbackModal
        open={backFeedbackModalOpen}
        onClose={closeBackFeedbackModal}
      />

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
            {reportSheetMessage.user_uuid && reportSheetMessage.user_uuid !== getCurrentUserId() && (
              <>
                <button
                  className="sheet-item sheet-item-report"
                  onClick={handleSheetMute}
                  disabled={muteStatus === 'submitting'}
                >
                  <span className="sheet-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9v6" />
                      <path d="M7 6v12" />
                      <path d="M11 4v16" />
                      <path d="M15 7v10" />
                      <path d="M19 10v4" />
                    </svg>
                  </span>
                  <span>
                    {muteStatus === 'submitting'
                      ? (isMutedUser(reportSheetMessage.user_uuid) ? 'Unmuting...' : 'Muting...')
                      : (isMutedUser(reportSheetMessage.user_uuid) ? 'Unmute' : 'Mute')}
                  </span>
                </button>
                <div className="sheet-divider" />
              </>
            )}
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
            {muteStatus === 'error' && <div className="sheet-confirm error">Mute failed</div>}
            {reportStatus === 'done' && <div className="sheet-confirm">Reported</div>}
            {reportStatus === 'error' && <div className="sheet-confirm error">Report failed</div>}
          </div>
        </div>
      )}

      {notificationSheetOpen && (
        <div className="sheet-overlay" onClick={closeNotificationSheet}>
          <div className="sheet notify-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="notify-title">Turn on notifications</div>
            <div className="notify-sub">
              After you enable this, new incoming chat messages can show up as notifications on this device.
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











































































