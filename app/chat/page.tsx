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
  colorClass: string
}

const COLORS = ['c1', 'c2', 'c3', 'c4', 'c5']

const getInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function GlobalChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    // 1. Fetch existing messages
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })

      if (data) {
        setMessages(data.map((m: any) => ({
          id: m.id,
          username: m.username || 'Anonymous',
          initials: getInitials(m.username || 'Anonymous'),
          university: '',
          text: m.content,
          timestamp: 'now',
          colorClass: COLORS[Math.abs(m.username?.length || 0) % COLORS.length],
        })))
      }
    }

    fetchMessages()

    // 2. Subscribe to real-time messages with deduplication
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new
          setMessages((prev) => {
            // Deduplicate by id
            if (prev.some(msg => msg.id === m.id)) return prev

            const newMessage: Message = {
              id: m.id,
              username: m.username || 'Anonymous',
              initials: getInitials(m.username || 'Anonymous'),
              university: '',
              text: m.content,
              timestamp: 'now',
              colorClass: COLORS[Math.abs(m.username?.length || 0) % COLORS.length],
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

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text) return

    const tempId = `temp-${Date.now()}`
    const username = 'Anonymous'

    // Optimistically add to state
    const optimisticMsg: Message = {
      id: tempId,
      username,
      initials: getInitials(username),
      university: '',
      text,
      timestamp: 'now',
      colorClass: COLORS[Math.abs(username.length) % COLORS.length],
    }
    setMessages(prev => [...prev, optimisticMsg])
    setInputText('')
    inputRef.current?.blur()

    const { data, error } = await supabase
      .from('messages')
      .insert({ content: text, username })
      .select()

    if (error) {
      console.error('Error sending message:', error)
      // Optionally remove optimistic message or show error
      setMessages(prev => prev.filter(m => m.id !== tempId))
      return
    }

    // Replace optimistic message with real message from DB to ensure correct ID
    if (data && data[0]) {
      const realMsg = data[0]
      setMessages(prev => prev.map(m => m.id === tempId ? {
        id: realMsg.id,
        username: realMsg.username || 'Anonymous',
        initials: getInitials(realMsg.username || 'Anonymous'),
        university: '',
        text: realMsg.content,
        timestamp: 'now',
        colorClass: COLORS[Math.abs(realMsg.username?.length || 0) % COLORS.length],
      } : m))
    }
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
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />

      <div className="screen">
        <div className={`header${isKeyboardOpen ? ' hidden' : ''}`}>
          <div className="logo">
            <img src="/spreadz-logo.png" alt="SpreadZ" className="logo-img" />
          </div>

          <button className="settings-btn" aria-label="Settings">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        <div className={`ai-card-wrap${isKeyboardOpen ? ' hidden' : ''}`}>
          <div className="ai-card">
            <div className="ai-headline">
              &quot;Engineers split on whether AI raises the bar — or kills entry-level jobs&quot;
            </div>
          </div>
        </div>

        <div className="messages">
          {messages.map((msg, index) => (
            <div className="msg" key={msg.id}>
              <div className={`avatar ${msg.colorClass}`}>{msg.initials}</div>
              <div className="msg-body">
                <div className="msg-top">
                  <span className="msg-name">{msg.username}</span>
                  <span className="msg-time">{msg.timestamp}</span>
                </div>
                {msg.university && <div className="msg-college">{msg.university}</div>}
                <div className="msg-text">{msg.text}</div>
              </div>
            </div>
          ))}

          <div className="typing-row">
            <div className="avatar c1">SC</div>
            <div>
              <div style={{ fontSize: '12px', color: '#636366', marginBottom: '5px' }}>
                Sofia Chen · Harvard
              </div>
              <div className="typing-dots">
                <div className="td"></div>
                <div className="td"></div>
                <div className="td"></div>
              </div>
            </div>
          </div>
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
            <button className="send-btn" aria-label="Send" onClick={handleSend}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #1c1c1e;
    --surface: #2c2c2e;
    --border: #3a3a3c;
    --border-light: #48484a;
    --text: #f2f2f7;
    --text-sub: #ababab;
    --text-dim: #636366;
  }

  html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }

  body {
    background: var(--bg);
    font-family: 'Inter', sans-serif;
    height: 100vh;
    height: 100dvh;
  }

  .screen {
    width: 100%;
    height: 100vh;
    height: 100dvh;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 4px;
    padding-bottom: 4px;
    padding-left: 8px;
    padding-right: 18px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    overflow: visible;
    position: relative;
    z-index: 10;
  }

  .logo {
    display: flex;
    align-items: center;
    position: relative;
    z-index: 10;
  }

  .logo-img {
    height: 90px;
    width: auto;
    object-fit: contain;
    position: relative;
    z-index: 10;
    margin: -16px 0;
  }

  .settings-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    padding: 4px;
    transition: color 0.15s;
  }

  .settings-btn:hover { color: var(--text-sub); }

  .ai-card-wrap {
    margin: 12px 14px;
    position: relative;
  }

  .ai-card-wrap::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 30% 60%, rgba(57,255,20,0.12) 0%, transparent 65%),
                radial-gradient(ellipse at 80% 20%, rgba(100,180,255,0.10) 0%, transparent 60%);
    pointer-events: none;
  }

  .ai-card {
    position: relative;
    background: linear-gradient(155deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.07) 45%, rgba(255,255,255,0.04) 100%);
    backdrop-filter: blur(80px) saturate(200%) brightness(1.15);
    -webkit-backdrop-filter: blur(80px) saturate(200%) brightness(1.15);
    border-radius: 22px;
    padding: 12px 16px;
    overflow: hidden;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.13), 0 4px 6px rgba(0,0,0,0.35), 0 16px 48px rgba(0,0,0,0.6), inset 0 2px 8px rgba(255,255,255,0.18), inset 0 -3px 10px rgba(0,0,0,0.28);
  }

  .ai-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 8%;
    right: 8%;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 20%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.55) 80%, transparent 100%);
  }

  .ai-card::after {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: 21px;
    background: linear-gradient(170deg, rgba(255,255,255,0.09) 0%, transparent 55%, rgba(0,0,0,0.06) 100%);
    pointer-events: none;
  }

  .ai-headline {
    font-size: 0.95rem;
    font-weight: 500;
    color: rgba(235,245,255,0.95);
    line-height: 1.5;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .messages::-webkit-scrollbar { display: none; }

  .msg {
    display: flex;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255,255,255,0.15);
    cursor: pointer;
    transition: background 0.12s;
  }

  .msg:hover { background: rgba(255,255,255,0.02); }

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 15px;
  }

  .msg-body { flex: 1; min-width: 0; }

  .msg-top {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }

  .msg-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
  }

  .msg-time {
    font-size: 12px;
    color: var(--text-dim);
    margin-left: auto;
    flex-shrink: 0;
  }

  .msg-college {
    font-size: 12px;
    color: var(--text-dim);
    margin-bottom: 6px;
  }

  .msg-text {
    font-size: 14px;
    color: #d1d1d6;
    line-height: 1.5;
  }

  .typing-row {
    display: flex;
    gap: 12px;
    padding: 14px 18px;
    align-items: center;
  }

  .typing-dots {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .td {
    width: 6px;
    height: 6px;
    background: var(--text-dim);
    border-radius: 50%;
    animation: tbounce 1.2s infinite;
  }

  .td:nth-child(2) { animation-delay: .2s; }
  .td:nth-child(3) { animation-delay: .4s; }

  @keyframes tbounce {
    0%, 60%, 100% { transform: translateY(0); opacity: .35; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  .input-area {
    background: var(--bg);
    padding: 8px 16px 12px;
    border-top: 1px solid var(--border);
  }

  .hint {
    text-align: center;
    font-size: 11px;
    color: var(--text-dim);
    padding: 0 0 10px;
    opacity: 0.7;
  }

  .input-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--border-light);
    border-radius: 24px;
    padding: 6px 12px 6px 16px;
    transition: border-color 0.15s;
  }

  .input-wrap:focus-within { border-color: var(--border-light); }

  input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    color: var(--text);
  }

  input::placeholder { color: rgba(255,255,255,0.5); }

  .send-btn {
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 6px;
    color: var(--text-dim);
    transition: color 0.15s;
  }

  .send-btn:hover { color: var(--text-sub); }

  .c1 { background: #2c2442; color: #a78bfa; }
  .c2 { background: #2a1a1a; color: #f87171; }
  .c3 { background: #162416; color: #4ade80; }
  .c4 { background: #2a2210; color: #fbbf24; }
  .c5 { background: #101e2e; color: #60a5fa; }

  .hidden { display: none !important; }
      `}</style>
    </>
  )
}
