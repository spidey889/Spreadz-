'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ProfileSheet, type ProfileSheetProfile } from '@/app/chat/components/ProfileSheet'
import { supabase } from '@/lib/supabase'

const COLLEGE_STORAGE_KEY = 'spreadz_college'
const USER_UUID_STORAGE_KEY = 'spreadz_user_uuid'

type DirectoryUser = ProfileSheetProfile & {
  id: string
  joinedAt: string | null
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
    if (normalizedEntry) uniqueValues.add(normalizedEntry)
  })

  return Array.from(uniqueValues)
}

const getUserColor = (username: string) => {
  const colors = ['#5865F2', '#ED4245', '#FEE75C', '#57F287', '#EB459E', '#FF6B35', '#00B0F4']
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const getInitials = (name: string) => (
  name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2)
)

const formatJoinedDate = (isoString?: string | null) => {
  if (!isoString) return 'Joined recently'

  const targetDate = new Date(isoString)
  if (Number.isNaN(targetDate.getTime())) return 'Joined recently'

  return `Joined ${targetDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })}`
}

export default function PeopleDirectoryPage() {
  const [college, setCollege] = useState('')
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [selectedProfile, setSelectedProfile] = useState<ProfileSheetProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const hasSingleVisibleProfile = users.length === 1

  useEffect(() => {
    let cancelled = false

    const loadDirectory = async () => {
      setLoading(true)
      setErrorMessage('')

      let resolvedCollege = normalizeProfileText(localStorage.getItem(COLLEGE_STORAGE_KEY))
      const storedUserId = normalizeProfileText(localStorage.getItem(USER_UUID_STORAGE_KEY))

      if (!resolvedCollege && storedUserId) {
        const { data: currentUserRow, error: currentUserError } = await supabase
          .from('users')
          .select('college')
          .eq('uuid', storedUserId)
          .maybeSingle()

        if (currentUserError) {
          console.error('[Directory] current user fetch failed:', currentUserError)
        }

        resolvedCollege = normalizeProfileText(currentUserRow?.college)
        if (resolvedCollege) {
          localStorage.setItem(COLLEGE_STORAGE_KEY, resolvedCollege)
        }
      }

      if (cancelled) return

      setCollege(resolvedCollege)

      if (!resolvedCollege) {
        setUsers([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('users')
        .select('uuid, display_name, username, college, avatar_url, created_at, branch, year, bio, interests, fav_movie, relationship_status')
        .eq('college', resolvedCollege)
        .order('display_name', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('[Directory] users fetch failed:', error)
        setErrorMessage('Could not load your college directory right now.')
        setUsers([])
        setLoading(false)
        return
      }

      const nextUsers: DirectoryUser[] = []

      ;(data || []).forEach((row) => {
        const displayName = normalizeProfileText(row.display_name)
        if (!displayName) return

        nextUsers.push({
          id: row.uuid,
          displayName,
          handle: normalizeProfileText(row.username),
          college: normalizeProfileText(row.college),
          avatarUrl: normalizeProfileText(row.avatar_url) || null,
          joinedAt: row.created_at || null,
          branch: normalizeProfileText(row.branch),
          year: normalizeProfileText(row.year),
          bio: normalizeProfileText(row.bio),
          interests: normalizeProfileInterests(row.interests),
          favMovie: normalizeProfileText(row.fav_movie),
          relationshipStatus: normalizeProfileText(row.relationship_status),
          limitedByPrivacy: false,
        })
      })

      setUsers(nextUsers)
      setLoading(false)
    }

    void loadDirectory()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <div className="people-directory-page">
        <div className="people-directory-shell">
          <div className="people-directory-header">
            <Link href="/chat" className="people-directory-back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
              <span>Back to chat</span>
            </Link>
            <div className="people-directory-copy">
              <h1 className="people-directory-title">
                {college ? `People from ${college}` : 'People from your college'}
              </h1>
            </div>
          </div>

          {loading ? (
            <div className="people-directory-state">Loading your directory...</div>
          ) : errorMessage ? (
            <div className="people-directory-state error">{errorMessage}</div>
          ) : !college ? (
            <div className="people-directory-state">
              Add your college in your profile first, then this directory will fill in automatically.
            </div>
          ) : users.length === 0 ? (
            <div className="people-directory-state">
              No visible profiles from {college} yet.
            </div>
          ) : (
            <>
              <div className="people-directory-list">
                {users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="people-directory-card"
                    onClick={() => setSelectedProfile(user)}
                  >
                    <div
                      className="people-directory-avatar"
                      style={!user.avatarUrl ? { backgroundColor: getUserColor(user.displayName) } : undefined}
                    >
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatarUrl}
                          alt={`${user.displayName} profile`}
                          className="profile-avatar-image"
                          draggable={false}
                        />
                      ) : (
                        <span>{getInitials(user.displayName)}</span>
                      )}
                    </div>
                    <div className="people-directory-card-copy">
                      <div className="people-directory-card-name">{user.displayName}</div>
                      <div className="people-directory-card-college">{user.college || college}</div>
                      <div className="people-directory-card-joined">
                        {formatJoinedDate(user.joinedAt)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {hasSingleVisibleProfile ? (
                <div className="people-directory-state people-directory-state-tease">
                  More students joining soon 👀
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <ProfileSheet
        open={Boolean(selectedProfile)}
        profile={selectedProfile}
        onClose={() => setSelectedProfile(null)}
        showExtended
      />
    </>
  )
}
