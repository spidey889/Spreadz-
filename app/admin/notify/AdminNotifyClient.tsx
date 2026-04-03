'use client'

import { useMemo, useState } from 'react'

type AdminNotifyClientProps = {
  isInitiallyAuthorized: boolean
  secretConfigured: boolean
}

type BroadcastResponse = {
  ok?: boolean
  error?: string
  subscriptionsFound?: number
  attempted?: number
  sent?: number
  deleted?: number
  failed?: number
  invalid?: number
}

const pageStyle = {
  minHeight: '100dvh',
  overflowY: 'auto' as const,
  background:
    'radial-gradient(circle at top, rgba(124,255,183,0.12), transparent 24%), linear-gradient(180deg, #111214, #171a20)',
  color: '#f5f7fa',
  padding: '32px 16px 48px',
}

const shellStyle = {
  width: '100%',
  maxWidth: '560px',
  margin: '0 auto',
}

const cardStyle = {
  background: 'rgba(19, 22, 27, 0.96)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '24px',
  padding: '24px',
  boxShadow: '0 24px 48px rgba(0,0,0,0.28)',
  backdropFilter: 'blur(16px)',
}

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#9da7b5',
  marginBottom: '8px',
}

const inputStyle = {
  width: '100%',
  borderRadius: '16px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(8, 10, 13, 0.8)',
  color: '#f5f7fa',
  padding: '14px 16px',
  fontSize: '15px',
  outline: 'none',
  fontFamily: 'inherit',
}

const buttonStyle = {
  border: 'none',
  borderRadius: '16px',
  padding: '14px 18px',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

export default function AdminNotifyClient({
  isInitiallyAuthorized,
  secretConfigured,
}: AdminNotifyClientProps) {
  const [isAuthorized, setIsAuthorized] = useState(isInitiallyAuthorized)
  const [adminKey, setAdminKey] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [authPending, setAuthPending] = useState(false)
  const [sendPending, setSendPending] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
    secretConfigured
      ? isInitiallyAuthorized
        ? 'Broadcast access unlocked.'
        : 'Enter the admin secret to unlock this page.'
      : 'Set ADMIN_BROADCAST_SECRET or ADMIN_SECRET_KEY first.'
  )
  const [errorMessage, setErrorMessage] = useState('')

  const canSend = useMemo(() => {
    return isAuthorized && title.trim().length > 0 && message.trim().length > 0 && !sendPending
  }, [isAuthorized, message, sendPending, title])

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!adminKey.trim()) {
      setErrorMessage('Enter the admin secret key.')
      return
    }

    setAuthPending(true)
    setErrorMessage('')
    setStatusMessage('Verifying admin key...')

    try {
      const response = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ admin_key: adminKey.trim() }),
      })

      const payload = (await response.json().catch(() => null)) as BroadcastResponse | null

      if (!response.ok) {
        setErrorMessage(payload?.error || 'Admin key verification failed.')
        setStatusMessage('Unlock failed.')
        return
      }

      setIsAuthorized(true)
      setAdminKey('')
      setStatusMessage('Broadcast access unlocked.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Admin key verification failed.')
      setStatusMessage('Unlock failed.')
    } finally {
      setAuthPending(false)
    }
  }

  const handleLogout = async () => {
    setErrorMessage('')
    setStatusMessage('Signing out...')

    try {
      await fetch('/api/admin-auth', { method: 'DELETE' })
    } catch (error) {
      console.error('[AdminNotify] Logout failed', error)
    }

    setIsAuthorized(false)
    setAdminKey('')
    setTitle('')
    setMessage('')
    setStatusMessage('Enter the admin secret to unlock this page.')
  }

  const handleBroadcast = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || !message.trim()) {
      setErrorMessage('Both title and message are required.')
      return
    }

    setSendPending(true)
    setErrorMessage('')
    setStatusMessage('Sending broadcast...')

    try {
      const response = await fetch('/api/broadcast-push', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
        }),
      })

      const payload = (await response.json().catch(() => null)) as BroadcastResponse | null

      if (!response.ok || !payload?.ok) {
        if (response.status === 401) {
          setIsAuthorized(false)
        }

        setErrorMessage(payload?.error || 'Broadcast send failed.')
        setStatusMessage('Broadcast failed.')
        return
      }

      setTitle('')
      setMessage('')
      setStatusMessage(
        `Broadcast sent to ${payload.sent ?? 0} subscriptions. Attempted ${payload.attempted ?? 0}, deleted ${payload.deleted ?? 0}, failed ${payload.failed ?? 0}.`
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Broadcast send failed.')
      setStatusMessage('Broadcast failed.')
    } finally {
      setSendPending(false)
    }
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={{ marginBottom: '18px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '999px',
              background: 'rgba(124,255,183,0.1)',
              border: '1px solid rgba(124,255,183,0.16)',
              color: '#b9ffd4',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            SpreadZ Admin
          </div>
          <h1
            style={{
              fontSize: '34px',
              lineHeight: 1.05,
              letterSpacing: '-0.04em',
              margin: '16px 0 10px',
            }}
          >
            Broadcast Push Notifications
          </h1>
          <p style={{ color: '#aab3bf', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
            Send a one-off notification to every saved push subscriber.
          </p>
        </div>

        <section style={cardStyle}>
          {!secretConfigured && (
            <div
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(255, 160, 122, 0.24)',
                background: 'rgba(255, 160, 122, 0.1)',
                color: '#ffd4c4',
                padding: '14px 16px',
                fontSize: '14px',
                lineHeight: 1.5,
              }}
            >
              Add `ADMIN_BROADCAST_SECRET` to your environment to enable this page.
            </div>
          )}

          {secretConfigured && !isAuthorized && (
            <form onSubmit={handleUnlock}>
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

              <button
                type="submit"
                disabled={authPending}
                style={{
                  ...buttonStyle,
                  width: '100%',
                  background: 'linear-gradient(135deg, #9af7b2, #6dd6ff)',
                  color: '#071017',
                  opacity: authPending ? 0.75 : 1,
                }}
              >
                {authPending ? 'Unlocking...' : 'Unlock Broadcast Panel'}
              </button>
            </form>
          )}

          {secretConfigured && isAuthorized && (
            <form onSubmit={handleBroadcast}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div>
                  <div style={labelStyle}>Status</div>
                  <div style={{ fontSize: '15px', color: '#dbe2ea', marginTop: '-2px' }}>
                    Authorized
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    ...buttonStyle,
                    background: 'rgba(255,255,255,0.08)',
                    color: '#f5f7fa',
                    padding: '12px 14px',
                  }}
                >
                  Lock
                </button>
              </div>

              <div style={{ marginTop: '18px' }}>
                <label htmlFor="broadcast-title" style={labelStyle}>
                  Notification Title
                </label>
                <input
                  id="broadcast-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="SpreadZ update"
                  maxLength={80}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginTop: '18px' }}>
                <label htmlFor="broadcast-message" style={labelStyle}>
                  Notification Message
                </label>
                <textarea
                  id="broadcast-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Type the message you want everyone to receive."
                  rows={5}
                  maxLength={240}
                  style={{
                    ...inputStyle,
                    resize: 'vertical' as const,
                    minHeight: '132px',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={!canSend}
                style={{
                  ...buttonStyle,
                  width: '100%',
                  marginTop: '20px',
                  background: 'linear-gradient(135deg, #9af7b2, #6dd6ff)',
                  color: '#071017',
                  opacity: canSend ? 1 : 0.6,
                }}
              >
                {sendPending ? 'Sending Broadcast...' : 'Send Broadcast'}
              </button>
            </form>
          )}

          <div
            style={{
              marginTop: '18px',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              padding: '14px 16px',
            }}
          >
            <div style={labelStyle}>System Message</div>
            <div style={{ color: '#dce2ea', fontSize: '14px', lineHeight: 1.55 }}>{statusMessage}</div>
            {errorMessage && (
              <div
                style={{
                  marginTop: '10px',
                  color: '#ffb8b8',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
              >
                {errorMessage}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
