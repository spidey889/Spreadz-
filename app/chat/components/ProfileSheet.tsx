'use client'

import { useEffect, useRef, useState, type TouchEvent } from 'react'

export type ProfileSheetProfile = {
  displayName: string
  handle: string
  college: string
  avatarUrl: string | null
  joinedAt?: string | null
  branch?: string
  year?: string
  bio?: string
  interests?: string[]
  favMovie?: string
  relationshipStatus?: string
  limitedByPrivacy?: boolean
}

export type ProfileSheetAction = {
  label: string
  onClick: () => void
  tone?: 'danger' | 'default'
  disabled?: boolean
}

type ProfileSheetProps = {
  open: boolean
  profile: ProfileSheetProfile | null
  onClose: () => void
  showExtended?: boolean
  actions?: ProfileSheetAction[]
  primaryAction?: ProfileSheetAction | null
  statusMessage?: string
}

const formatJoinedLabel = (isoString?: string | null) => {
  if (!isoString) return ''

  const targetDate = new Date(isoString)
  if (Number.isNaN(targetDate.getTime())) return ''

  return `Joined ${targetDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })}`
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

export function ProfileSheet({
  open,
  profile,
  onClose,
  showExtended = false,
  actions = [],
  primaryAction = null,
  statusMessage = '',
}: ProfileSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const touchStartYRef = useRef<number | null>(null)
  const offsetYRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
      touchStartYRef.current = null
      offsetYRef.current = 0
      setDragging(false)
      return
    }

    setDragging(false)
    offsetYRef.current = 0
    if (sheetRef.current) {
      sheetRef.current.style.setProperty('--profile-sheet-offset', '0px')
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current)
      }
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  if (!open || !profile) {
    return null
  }

  const applyOffset = (offset: number) => {
    offsetYRef.current = offset

    if (typeof window === 'undefined') return
    if (frameRef.current !== null) return

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      if (sheetRef.current) {
        sheetRef.current.style.setProperty('--profile-sheet-offset', `${offsetYRef.current}px`)
      }
    })
  }

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }

    const sheet = sheetRef.current
    if (!sheet) return

    // Only allow dragging if we are at the top of the scrollable content
    if (sheet.scrollTop > 0) {
      touchStartYRef.current = null
      return
    }

    touchStartYRef.current = event.touches[0]?.clientY ?? null
    setDragging(false)
  }

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current
    if (startY === null) return

    const currentY = event.touches[0]?.clientY ?? startY
    const delta = currentY - startY

    // If swiping up, let native scroll handle it
    if (delta < 0) {
      return
    }

    // If swiping down and we are at the top of the scroll, we drag the sheet
    if (sheetRef.current && sheetRef.current.scrollTop <= 0) {
      if (Math.abs(delta) < 5) return
      
      if (event.cancelable) {
        event.preventDefault()
      }
      setDragging(true)
      // Allow more dragging room but cap it reasonably
      applyOffset(Math.min(delta, 500))
    }
  }

  const resetDrag = () => {
    touchStartYRef.current = null
    setDragging(false)
    applyOffset(0)
  }

  const handleTouchEnd = () => {
    const startY = touchStartYRef.current
    if (startY === null) {
      return
    }

    const shouldClose = offsetYRef.current > 120

    touchStartYRef.current = null
    setDragging(false)

    if (!shouldClose) {
      applyOffset(0)
      return
    }

    // Smoothly animate the rest of the way down
    applyOffset(window.innerHeight)
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null
      onClose()
    }, 200)
  }

  const metaLine = [
    profile.handle ? `@${profile.handle.replace(/^@/, '')}` : '',
    profile.college,
  ].filter(Boolean).join(' • ')

  const joinedLabel = formatJoinedLabel(profile.joinedAt)
  const visibleInterests = profile.limitedByPrivacy ? [] : (profile.interests ?? []).filter(Boolean)
  const aboutRows = profile.limitedByPrivacy
    ? []
    : [
      { label: 'Branch', value: profile.branch?.trim() || '' },
      { label: 'Year', value: profile.year?.trim() || '' },
    ].filter((item) => Boolean(item.value))
  const favoriteRows = profile.limitedByPrivacy || !showExtended
    ? []
    : [
      { label: 'Favorite Movie', value: profile.favMovie?.trim() || '' },
      { label: 'Relationship Status', value: profile.relationshipStatus?.trim() || '' },
    ].filter((item) => Boolean(item.value))

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        className={`profile-sheet view-only${dragging ? ' dragging' : ''}`}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetDrag}
      >
        <div className="profile-sheet-view-drag-zone">
          <div className="sheet-handle" />
        </div>
        <div className="profile-sheet-view-content">
          <div className="profile-sheet-view-hero">
            <div
              className="profile-sheet-view-avatar"
              style={!profile.avatarUrl ? { backgroundColor: getUserColor(profile.displayName) } : undefined}
            >
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt={`${profile.displayName} profile`}
                  className="profile-avatar-image"
                  draggable={false}
                />
              ) : (
                <span>{getInitials(profile.displayName)}</span>
              )}
            </div>
            <div className="profile-sheet-view-name">{profile.displayName}</div>
            {metaLine && <div className="profile-sheet-view-meta-line">{metaLine}</div>}
          </div>

          <div className="profile-sheet-view-cards">
            {profile.limitedByPrivacy ? (
              <div className="profile-sheet-view-card profile-sheet-view-note-card">
                <div className="profile-sheet-view-card-label">Profile</div>
                <div className="profile-sheet-view-card-value">
                  Full profile details are limited to people from {profile.college || 'their college'}.
                </div>
              </div>
            ) : (
              <>
                {profile.bio?.trim() && (
                  <div className="profile-sheet-view-card">
                    <div className="profile-sheet-view-card-label">Bio</div>
                    <div className="profile-sheet-view-card-value">{profile.bio.trim()}</div>
                  </div>
                )}

                {(aboutRows.length > 0 || visibleInterests.length > 0) && (
                  <div className="profile-sheet-view-card">
                    <div className="profile-sheet-view-card-label">About</div>
                    <div className="profile-sheet-view-row-stack">
                      {aboutRows.map((item) => (
                        <div key={item.label} className="profile-sheet-view-card-row">
                          <span className="profile-sheet-view-card-row-label">{item.label}</span>
                          <span className="profile-sheet-view-card-row-value">{item.value}</span>
                        </div>
                      ))}
                    </div>
                    {visibleInterests.length > 0 && (
                      <div className="profile-sheet-view-interest-block">
                        <div className="profile-sheet-view-card-row-label">Interests</div>
                        <div className="profile-sheet-view-tag-list">
                          {visibleInterests.map((interest) => (
                            <span key={interest} className="profile-sheet-view-tag">{interest}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {favoriteRows.length > 0 && (
                  <div className="profile-sheet-view-card">
                    <div className="profile-sheet-view-card-label">Favorites</div>
                    <div className="profile-sheet-view-row-stack">
                      {favoriteRows.map((item) => (
                        <div key={item.label} className="profile-sheet-view-card-row">
                          <span className="profile-sheet-view-card-row-label">{item.label}</span>
                          <span className="profile-sheet-view-card-row-value">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {primaryAction && (
            <button
              type="button"
              className="profile-sheet-view-primary-action"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
            >
              {primaryAction.label}
            </button>
          )}

          {(joinedLabel || actions.length > 0 || statusMessage) && (
            <div className="profile-sheet-view-footer">
              {joinedLabel && <div className="profile-sheet-view-joined">{joinedLabel}</div>}
              {actions.length > 0 && (
                <div className="profile-sheet-view-actions">
                  {actions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className={`profile-sheet-view-action${action.tone === 'default' ? ' default' : ''}`}
                      onClick={action.onClick}
                      disabled={action.disabled}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
              {statusMessage && <div className="profile-sheet-view-action-status error">{statusMessage}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
