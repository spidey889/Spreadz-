'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Message {
  id: string
  username: string
  initials: string
  university: string
  text: string
  timestamp: string
  created_at?: string
}

const AVATAR_COLORS = ['#5865F2', '#ED4245', '#FEE75C', '#57F287', '#EB459E', '#FF6B35', '#00B0F4']

const getUserColor = (username: string) => {
  const colors = ['#5865F2', '#ED4245', '#FEE75C', '#57F287', '#EB459E', '#FF6B35', '#00B0F4'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const getInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const formatTime = (isoString?: string) => {
  if (!isoString) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function GlobalChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [username, setUsername] = useState('')
  const [university, setUniversity] = useState('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [tempProfileName, setTempProfileName] = useState('')
  const [tempProfileCollege, setTempProfileCollege] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsMounted(true)
    const storedName = localStorage.getItem('spreadz_username')
    const storedCollege = localStorage.getItem('spreadz_college')
    if (storedName) setUsername(storedName)
    if (storedCollege) setUniversity(storedCollege)
  }, [])

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })

      if (data) {
        setMessages(data.map((m: any) => ({
          id: m.id,
          username: m.username || 'Anonymous',
          initials: getInitials(m.username || 'Anonymous'),
          university: m.university || '',
          text: m.content,
          timestamp: formatTime(m.created_at),
          created_at: m.created_at
        })))
      }
    }

    fetchMessages()

    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new
          setMessages((prev) => {
            if (prev.some(msg => msg.id === m.id)) return prev

            const newMessage: Message = {
              id: m.id,
              username: m.username || 'Anonymous',
              initials: getInitials(m.username || 'Anonymous'),
              university: m.university || '',
              text: m.content,
              timestamp: formatTime(m.created_at),
              created_at: m.created_at
            }
            return [...prev, newMessage]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (overrideName?: string, overrideCollege?: string) => {
    const text = inputText.trim()
    if (!text) return

    const activeName = overrideName || username || localStorage.getItem('spreadz_username')
    if (!activeName) {
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
      timestamp: formatTime()
    }
    setMessages(prev => [...prev, optimisticMsg])
    setInputText('')
    inputRef.current?.blur()

    const { data, error } = await supabase
      .from('messages')
      .insert({ content: text, username: activeName, university: activeCollege })
      .select()

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      return
    }

    if (data && data[0]) {
      const m = data[0]
      setMessages(prev => prev.map(msg => msg.id === tempId ? {
        id: m.id,
        username: m.username || 'Anonymous',
        initials: getInitials(m.username || 'Anonymous'),
        university: m.university || '',
        text: m.content,
        timestamp: formatTime(m.created_at),
        created_at: m.created_at
      } : msg))
    }
  }

  const handleProfileSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const name = tempProfileName.trim()
    const college = tempProfileCollege.trim()
    if (!name) return

    localStorage.setItem('spreadz_username', name)
    localStorage.setItem('spreadz_college', college)
    setUsername(name)
    setUniversity(college)
    setShowProfileModal(false)
    handleSend(name, college)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isMounted) return null

  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content" />
      <div className="screen">
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

        <div className={`ai-card-wrap${isKeyboardOpen ? ' hidden' : ''}`}>
          <div className="ai-card">
            <div className="card-label">LIVE DISCUSSION</div>
            <div className="ai-headline">Engineers split on whether AI raises the bar — or kills entry-level jobs</div>
          </div>
        </div>

        <div className="messages">
          {messages.map((msg, index) => {
            const isFirstInGroup = index === 0 || messages[index - 1].username !== msg.username
            return (
              <div key={msg.id}>
                {isFirstInGroup && index !== 0 && <div className="group-divider" />}
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
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <div className={`hint${isKeyboardOpen ? ' hidden' : ''}`}>↕ swipe for new people &amp; topics</div>
          <div className="input-wrap">
            <input
              ref={inputRef}
              type="text"
              placeholder="What's on your mind?"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsKeyboardOpen(true)}
              onBlur={() => setIsKeyboardOpen(false)}
            />
            <button className="send-btn" aria-label="Send" onClick={() => handleSend()}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
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

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #111214;
          --surface: #1E1F22;
          --border: #2E2F35;
          --discord-blurple: #5865F2;
          --text-primary: #F2F3F5;
          --text-msg: #DCDDDE;
          --text-muted: #72767D;
          --headline-bg: #0D0D0D;
          --accent-green: #00FF88;
        }

        html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; }
        body { background: var(--bg); color: var(--text-primary); }

        .screen { width: 100%; height: 100dvh; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }

        .header { display: flex; align-items: center; justify-content: space-between; padding: 4px 18px 4px 8px; background: var(--bg); position: relative; z-index: 10; }
        .logo-img { height: 90px; margin: -16px 0; object-fit: contain; }
        .settings-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px; transition: color 0.1s; }
        .settings-btn:hover { color: var(--text-primary); }

        .ai-card-wrap { margin: 12px 16px; }
        .ai-card { background: var(--headline-bg); border-left: 3px solid var(--accent-green); border-radius: 4px; padding: 14px 18px; position: relative; }
        .card-label { color: var(--accent-green); font-size: 9px; font-weight: 700; letter-spacing: 2px; margin-bottom: 4px; }
        .ai-headline { font-size: 16px; color: #FFFFFF; font-weight: 600; line-height: 1.4; }

        .messages { flex: 1; overflow-y: auto; padding: 0 16px; scrollbar-width: none; }
        .messages::-webkit-scrollbar { display: none; }

        .msg { display: flex; gap: 16px; width: 100%; }
        .group-start { margin-top: 20px; }
        .group-continuation { margin-top: 2px; }
        .group-divider { height: 1px; width: 100%; background: #1E1F22; margin: 20px 0; }

        .avatar { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: white; }
        
        .msg-content { flex: 1; min-width: 0; position: relative; }
        .msg-content.continuation { margin-left: 54px; } /* 38px avatar + 16px gap */

        .msg-header { display: flex; align-items: baseline; margin-bottom: 2px; }
        .msg-username { font-size: 15px; font-weight: 700; color: #FFFFFF; }
        .msg-university { font-size: 13px; color: #71767B; margin-left: 6px; }
        .msg-timestamp { font-size: 13px; color: #71767B; margin-left: auto; }

        .msg-text { font-size: 15px; color: #E7E9EA; line-height: 1.5; margin-top: 2px; word-wrap: break-word; }

        .input-area { background: var(--bg); padding: 8px 16px 16px; }
        .hint { text-align: center; font-size: 11px; color: var(--text-muted); padding-bottom: 8px; opacity: 0.7; }
        
        .input-wrap { display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 24px; padding: 4px 4px 4px 16px; transition: box-shadow 0.2s; }
        .input-wrap:focus-within { box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.15); }
        
        input { flex: 1; background: none; border: none; outline: none; font-size: 15px; color: var(--text-primary); font-family: inherit; }
        input::placeholder { color: var(--text-muted); }

        .send-btn { background: #5865F2; color: white; border: none; border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s, background 0.2s; flex-shrink: 0; }
        .send-btn:hover { background: #4752c4; }
        .send-btn:active { transform: scale(0.95); }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
        .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 28px; padding: 32px; width: 100%; max-width: 360px; text-align: center; }
        .modal-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 24px; color: var(--text-primary); }
        .modal-sub { font-size: 0.9rem; color: var(--text-muted); margin: 12px 0 8px; text-align: left; }
        .modal-inputs { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
        .modal-input { background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; color: var(--text-primary); font-size: 1rem; outline: none; width: 100%; }
        .join-btn { background: var(--text-primary); color: var(--bg); border: none; border-radius: 14px; padding: 16px; width: 100%; font-size: 1.1rem; font-weight: 700; cursor: pointer; }

        .hidden { display: none !important; }
      `}</style>
    </>
  )
}
