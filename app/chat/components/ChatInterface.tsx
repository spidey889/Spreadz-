'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  username: string
  initials: string
  university: string
  text: string
  timestamp: Date
  isUser: boolean
  color: string
}

const COLORS = [
  '#7c8cb0', '#8b7ea0', '#7a9e8e', '#9e8a7a',
  '#8a7a9e', '#7a8a9e', '#9e9a7a', '#7a9e9a',
  '#8a9e7a', '#9e7a8a', '#7a8a8a', '#8a8a7a',
]

function getColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const INITIAL_MESSAGES: Omit<Message, 'id' | 'color'>[] = [
  { username: 'Sofia Ramirez', initials: 'SR', university: 'UC Berkeley', text: 'AI won\'t replace devs — it\'ll replace the ones who don\'t use it.', timestamp: new Date(Date.now() - 15000), isUser: false },
  { username: 'Ava Lawson', initials: 'AL', university: 'Stanford', text: 'Easy to say when you already have a job lol. Fresh grads are cooked.', timestamp: new Date(Date.now() - 60000), isUser: false },
  { username: 'Marcus Webb', initials: 'MW', university: 'Carnegie Mellon', text: 'Built my whole MVP with AI. No team. The moat is speed + ideas now.', timestamp: new Date(Date.now() - 120000), isUser: false },
  { username: 'Jake Reynolds', initials: 'JR', university: 'U of Michigan', text: '"Prompt engineering" as a real skill 💀 it\'s literally just talking.', timestamp: new Date(Date.now() - 180000), isUser: false },
  { username: 'Noah Torres', initials: 'NT', university: 'Georgia Tech', text: 'Systems thinking and architecture don\'t go away. AI kills the boring parts.', timestamp: new Date(Date.now() - 240000), isUser: false },
  { username: 'Sofia Chen', initials: 'SC', university: 'Harvard', text: 'The people panicking are the ones who were Googling everything anyway.', timestamp: new Date(Date.now() - 300000), isUser: false },
  { username: 'Emily Park', initials: 'EP', university: 'MIT', text: 'Just shipped a feature in 2 hours that would\'ve taken 2 days. Wild times.', timestamp: new Date(Date.now() - 360000), isUser: false },
  { username: 'Raj Patel', initials: 'RP', university: 'IIT Bombay', text: 'Hot take: AI makes senior devs MORE valuable, not less.', timestamp: new Date(Date.now() - 420000), isUser: false },
  { username: 'Liam Chen', initials: 'LC', university: 'Waterloo', text: 'The bar for entry-level just got higher. Adapt or get left behind.', timestamp: new Date(Date.now() - 480000), isUser: false },
  { username: 'Priya Sharma', initials: 'PS', university: 'NUS', text: 'My intern writes better code than some seniors because of Copilot. That says something.', timestamp: new Date(Date.now() - 540000), isUser: false },
]

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(() =>
    INITIAL_MESSAGES.map((m, i) => ({
      ...m,
      id: `init-${i}`,
      color: getColor(m.username),
    }))
  )
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = () => {
    if (inputText.trim() === '') return

    const newMessage: Message = {
      id: Date.now().toString(),
      username: 'You',
      initials: 'YO',
      university: '',
      text: inputText.trim(),
      timestamp: new Date(),
      isUser: true,
      color: '#7c8cb0',
    }

    setMessages((prev) => {
      const updated = [...prev, newMessage]
      return updated.slice(-50)
    })

    setInputText('')
    inputRef.current?.focus()
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h`

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d`
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#1a1a1f' }}>
      <div className="w-full max-w-[440px] mx-auto h-full flex flex-col py-2 px-3">

        {/* ── Top Bar ── */}
        <div className="flex items-center justify-between px-2 py-2.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-bold tracking-wider px-1.5 py-1 rounded"
              style={{ background: '#25252b', color: '#7a7a85' }}
            >
              Sz
            </span>
            <span className="text-sm font-medium" style={{ color: '#a0a0a8' }}>
              SpreadZ
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="#55555f"
            className="w-[18px] h-[18px]"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        </div>

        {/* ── Chat Panel Container ── */}
        <div
          className="flex-1 flex flex-col min-h-0 rounded-xl overflow-hidden"
          style={{
            background: '#22222a',
            border: '1px solid #2a2a32',
          }}
        >
          {/* Topic Header */}
          <div
            className="px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid #2a2a32' }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium" style={{ color: '#b0b0b8' }}>
                Tech & Careers
              </span>
              <span className="text-[12px]" style={{ color: '#55555f' }}>·</span>
              <span className="text-[12px]" style={{ color: '#66666f' }}>47 live</span>
            </div>
            <p
              className="text-[14px] leading-relaxed mt-1"
              style={{ color: '#8a8a95' }}
            >
              Engineers split on whether AI raises the bar or kills entry-level jobs
            </p>
          </div>

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto min-h-0 chat-scroll">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className="animate-fade-in"
              >
                <div className="flex gap-3 px-4 py-3.5">
                  {/* Initials bubble */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{
                      backgroundColor: message.color + '1a',
                      color: message.color,
                    }}
                  >
                    <span className="text-[11px] font-semibold leading-none">
                      {message.initials}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: '#9a9aa5' }}
                      >
                        {message.username}
                      </span>
                      {message.university && (
                        <>
                          <span className="text-[11px]" style={{ color: '#44444d' }}>·</span>
                          <span className="text-[11px]" style={{ color: '#55555f' }}>
                            {message.university}
                          </span>
                        </>
                      )}
                      <span
                        className="text-[11px] ml-auto flex-shrink-0"
                        style={{ color: '#44444d' }}
                      >
                        {formatTime(message.timestamp)}
                      </span>
                    </div>
                    <p
                      className="text-[14.5px] leading-[1.55] mt-1 break-words"
                      style={{ color: '#d8d8df' }}
                    >
                      {message.text}
                    </p>
                  </div>
                </div>

                {/* Thin divider between messages */}
                {index < messages.length - 1 && (
                  <div
                    className="mx-4"
                    style={{ height: '1px', background: '#2a2a32' }}
                  />
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar — inside the panel */}
          <div
            className="px-3 py-2.5 flex-shrink-0"
            style={{ borderTop: '1px solid #2a2a32' }}
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Say something…"
                className="flex-1 px-3.5 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{
                  background: '#1a1a1f',
                  color: '#d0d0d8',
                  border: '1px solid #2a2a32',
                }}
              />
              <button
                onClick={handleSend}
                disabled={inputText.trim() === ''}
                className="p-2 rounded-lg transition-all duration-200"
                style={{
                  opacity: inputText.trim() ? 1 : 0.3,
                  background: inputText.trim() ? '#2a2a35' : 'transparent',
                  color: inputText.trim() ? '#9a9aa5' : '#44444d',
                  cursor: inputText.trim() ? 'pointer' : 'default',
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                  stroke="currentColor"
                  className="w-[18px] h-[18px]"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
