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
  onSettingsClick?: () => void
  showExtended?: boolean
  actions?: ProfileSheetAction[]
  primaryAction?: ProfileSheetAction | null
  statusMessage?: string
}

const formatJoinedDate = (isoString?: string | null) => {
  if (!isoString) return ''

  const targetDate = new Date(isoString)
  if (Number.isNaN(targetDate.getTime())) return ''

  return targetDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
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
  onSettingsClick,
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

    if (delta < 0) {
      return
    }

    if (sheetRef.current && sheetRef.current.scrollTop <= 0) {
      if (Math.abs(delta) < 5) return

      if (event.cancelable) {
        event.preventDefault()
      }
      setDragging(true)
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

    applyOffset(window.innerHeight)
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null
      onClose()
    }, 200)
  }

  const joinedDate = formatJoinedDate(profile.joinedAt)
  const bioText = profile.bio?.trim() || ''
  const collegeLabel = profile.college?.trim() || 'College not set'
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
    <>
      <div className="profile-overlay discord-profile-overlay" onClick={onClose}>
        <div
          ref={sheetRef}
          className={`profile-sheet view-only discord-profile-sheet${dragging ? ' dragging' : ''}`}
          onClick={(event) => event.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={resetDrag}
        >
          <div className="profile-sheet-view-drag-zone">
            <div className="sheet-handle" />
            {onSettingsClick && (
              <button
                type="button"
                className="profile-sheet-settings-button"
                aria-label="Settings"
                onClick={(event) => {
                  event.stopPropagation()
                  onSettingsClick()
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}
          </div>

          <div className="profile-sheet-view-content">
            <div className="profile-sheet-view-hero">
              <div className="discord-profile-sheet-banner" />
              <div className="discord-profile-sheet-avatar-row">
                <div
                  className="profile-sheet-view-avatar discord-profile-sheet-avatar"
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
              </div>
              <div className="discord-profile-sheet-identity">
                <div className="profile-sheet-view-name">{profile.displayName}</div>
                <div className="discord-profile-sheet-college">{collegeLabel}</div>
              </div>
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
                  {(bioText || joinedDate) && (
                    <div className="profile-sheet-view-card discord-profile-sheet-bio-card">
                      <div className="profile-sheet-view-card-label">Bio</div>
                      {bioText && <div className="profile-sheet-view-card-value">{bioText}</div>}
                      {joinedDate && (
                        <div className="discord-profile-sheet-detail-block">
                          <div className="profile-sheet-view-card-label discord-profile-sheet-inline-label">Member Since</div>
                          <div className="discord-profile-sheet-detail-value">{joinedDate}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {(aboutRows.length > 0 || visibleInterests.length > 0) && (
                    <div className="profile-sheet-view-card">
                      <div className="profile-sheet-view-card-label">About</div>
                      <div className="discord-profile-sheet-chip-stack">
                        {aboutRows.map((item) => (
                          <div key={item.label} className="discord-profile-sheet-chip-group">
                            <div className="profile-sheet-view-card-row-label">{item.label}</div>
                            <div className="profile-sheet-view-tag-list discord-profile-sheet-chip-list">
                              <span className="profile-sheet-view-tag discord-profile-sheet-chip">{item.value}</span>
                            </div>
                          </div>
                        ))}
                        {visibleInterests.length > 0 && (
                          <div className="discord-profile-sheet-chip-group">
                            <div className="profile-sheet-view-card-row-label">Interests</div>
                            <div className="profile-sheet-view-tag-list discord-profile-sheet-chip-list">
                              {visibleInterests.map((interest) => (
                                <span key={interest} className="profile-sheet-view-tag discord-profile-sheet-chip">{interest}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {favoriteRows.length > 0 && (
                    <div className="profile-sheet-view-card discord-profile-sheet-plain-card">
                      <div className="profile-sheet-view-row-stack">
                        {favoriteRows.map((item) => (
                          <div key={item.label} className="discord-profile-sheet-detail-row">
                            <div className="profile-sheet-view-card-row-label">{item.label}</div>
                            <div className="profile-sheet-view-card-row-value">{item.value}</div>
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

            {(actions.length > 0 || statusMessage) && (
              <div className="profile-sheet-view-footer">
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

      <style jsx global>{`
        .discord-profile-overlay {
          padding: 14px 0 0;
        }
        .discord-profile-sheet {
          width: 100%;
          max-width: none;
          max-height: calc(min(100dvh, 100svh) - 14px);
          margin-top: 14px;
          padding: 0 0 calc(22px + env(safe-area-inset-bottom, 0px));
          gap: 0;
          background: #1e1f22;
          border: none;
          border-radius: 28px 28px 0 0;
          box-shadow: 0 -24px 46px rgba(0, 0, 0, 0.48);
          overflow-x: hidden;
          scroll-padding-top: 128px;
          scroll-padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
        }
        .discord-profile-sheet .profile-sheet-view-drag-zone {
          position: absolute;
          inset: 0 0 auto;
          min-height: 48px;
          padding: 12px 0 0;
          z-index: 3;
          touch-action: none;
          pointer-events: none;
        }
        .discord-profile-sheet .sheet-handle {
          background: rgba(255, 255, 255, 0.84);
          pointer-events: none;
        }
        .discord-profile-sheet .profile-sheet-settings-button {
          top: 10px;
          right: 16px;
          background: rgba(30, 31, 34, 0.76);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.24);
          pointer-events: auto;
        }
        .discord-profile-sheet .profile-sheet-view-content {
          gap: 20px;
        }
        .discord-profile-sheet .profile-sheet-view-hero {
          gap: 0;
          padding: 0;
        }
        .discord-profile-sheet-banner {
          width: 100%;
          height: 110px;
          background: var(--context-accent-green, #67d996);
        }
        .discord-profile-sheet-avatar-row {
          padding: 0 18px;
          margin-top: -50px;
          position: relative;
          z-index: 1;
        }
        .discord-profile-sheet-avatar {
          width: 100px;
          height: 100px;
          flex: 0 0 100px;
          border: none;
          box-shadow: none;
        }
        .discord-profile-sheet-identity {
          padding: 12px 20px 0;
        }
        .discord-profile-sheet .profile-sheet-view-name {
          font-size: 32px;
          font-weight: 900;
          font-style: italic;
          line-height: 1.04;
          letter-spacing: -0.03em;
          color: #ffffff;
          text-wrap: balance;
        }
        .discord-profile-sheet-college {
          margin-top: 4px;
          color: #a7adb5;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.4;
        }
        .discord-profile-sheet .profile-sheet-view-cards {
          gap: 14px;
          margin-top: 0;
          padding: 0 12px;
        }
        .discord-profile-sheet .profile-sheet-view-card {
          border: none;
          border-radius: 18px;
          background: #2b2d31;
          padding: 18px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }
        .discord-profile-sheet .profile-sheet-view-card-label {
          color: #b5bac1;
          margin-bottom: 10px;
        }
        .discord-profile-sheet .profile-sheet-view-card-value,
        .discord-profile-sheet .profile-sheet-view-card-row-value {
          color: #f2f3f5;
        }
        .discord-profile-sheet .profile-sheet-view-card-row-label,
        .discord-profile-sheet .profile-sheet-view-note-card .profile-sheet-view-card-value {
          color: #b5bac1;
        }
        .discord-profile-sheet-bio-card .profile-sheet-view-card-value {
          line-height: 1.6;
          font-size: 15px;
        }
        .discord-profile-sheet-detail-block {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
        }
        .discord-profile-sheet-inline-label {
          margin-bottom: 6px;
        }
        .discord-profile-sheet-detail-value {
          color: #f2f3f5;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.45;
        }
        .discord-profile-sheet-chip-stack {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .discord-profile-sheet-chip-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .discord-profile-sheet-chip-list {
          margin-top: 0;
        }
        .discord-profile-sheet-chip {
          background: #1e1f22;
          color: #eef1f3;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 700;
        }
        .discord-profile-sheet-plain-card .profile-sheet-view-row-stack {
          gap: 14px;
        }
        .discord-profile-sheet-detail-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .discord-profile-sheet .profile-sheet-view-primary-action {
          width: auto;
          min-width: 136px;
          margin: 0 auto;
          padding: 10px 30px;
          border-radius: 999px;
          background: var(--context-accent-green, #67d996);
          color: #102116;
          box-shadow: 0 10px 24px rgba(103, 217, 150, 0.18);
        }
        .discord-profile-sheet .profile-sheet-view-footer {
          gap: 10px;
          margin-top: 0;
          padding: 0 12px;
        }
        .discord-profile-sheet .profile-sheet-view-actions {
          gap: 14px;
        }
        .discord-profile-sheet .profile-sheet-view-action.default {
          color: #f2f3f5;
        }
        .discord-profile-sheet .profile-sheet-view-action-status {
          color: #ff8a8a;
        }
      `}</style>
    </>
  )
}
