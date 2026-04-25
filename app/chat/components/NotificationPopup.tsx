import { useState, useEffect } from 'react'

const NOTIFICATION_DISMISSED_KEY = 'spreadz_gu_notification_dismissed'

interface NotificationPopupProps {
  messageCount: number
}

export function NotificationPopup({ messageCount }: NotificationPopupProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [hasDismissed, setHasDismissed] = useState(true)

  useEffect(() => {
    const dismissed = localStorage.getItem(NOTIFICATION_DISMISSED_KEY)
    if (dismissed === 'true') {
      setHasDismissed(true)
      return
    }
    setHasDismissed(false)

    const timer = setTimeout(() => {
      const isDismissed = localStorage.getItem(NOTIFICATION_DISMISSED_KEY)
      if (isDismissed !== 'true') {
        setIsVisible(true)
      }
    }, 10000)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (hasDismissed || isVisible) return

    if (messageCount >= 4) {
      setIsVisible(true)
    }
  }, [messageCount, hasDismissed, isVisible])

  useEffect(() => {
    if (isVisible) {
      const dismissTimer = setTimeout(() => {
        handleDismiss()
      }, 6000)
      return () => clearTimeout(dismissTimer)
    }
  }, [isVisible])

  const handleDismiss = () => {
    setIsVisible(false)
    setHasDismissed(true)
    localStorage.setItem(NOTIFICATION_DISMISSED_KEY, 'true')
  }

  if (hasDismissed || !isVisible) {
    return null
  }

  return (
    <div className="notification-popup-container">
      <div className="notification-popup-card">
        <p className="notification-popup-text">
          Gujarat University students are here... talk with students from different colleges of GU
        </p>
        <button onClick={handleDismiss} className="notification-popup-close" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <style jsx>{`
        .notification-popup-container {
          position: fixed;
          top: 88px;
          left: 16px;
          right: 16px;
          z-index: 100;
          display: flex;
          justify-content: center;
          pointer-events: none;
          animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .notification-popup-card {
          pointer-events: auto;
          background: rgba(30, 31, 34, 0.95);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          max-width: 400px;
          width: 100%;
        }

        .notification-popup-text {
          margin: 0;
          color: #f2f3f5;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.4;
          flex: 1;
        }

        .notification-popup-close {
          background: transparent;
          border: none;
          color: #b5bac1;
          padding: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: background 0.2s, color 0.2s;
          flex-shrink: 0;
        }

        .notification-popup-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
