'use client'

type NotificationPopupProps = {
  message: string
  onClose: () => void
}

export function NotificationPopup({ message, onClose }: NotificationPopupProps) {
  return (
    <div className="chat-notification-popup" role="status" aria-live="polite">
      <p className="chat-notification-popup-copy">{message}</p>
      <button
        type="button"
        className="chat-notification-popup-close"
        onClick={onClose}
        aria-label="Close chat popup"
      >
        X
      </button>
    </div>
  )
}
