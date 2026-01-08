'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  username: string
  text: string
  timestamp: Date
  isUser: boolean
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
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
      text: inputText.trim(),
      timestamp: new Date(),
      isUser: true,
    }

    setMessages((prev) => {
      const updated = [...prev, newMessage]
      // Keep only last 50 messages
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
    if (diffDays < 7) return `${diffDays}d`
    
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    const displayMinutes = minutes.toString().padStart(2, '0')
    return `${displayHours}:${displayMinutes} ${ampm}`
  }

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="w-full max-w-[420px] mx-auto h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-black border-b border-gray-800 px-3 py-3 shadow-lg flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <h1 className="text-lg font-semibold text-white">Global Chat</h1>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5 min-h-0 max-h-full bg-black">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500 text-sm">Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className="animate-fade-in"
              >
                <div className="bg-gray-900 border-l-2 border-gray-700 rounded-sm px-3 py-2 hover:bg-gray-800/80 hover:border-gray-600 transition-all">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-semibold text-white">
                      {message.username}
                    </div>
                    <div className="text-xs text-gray-500 ml-3 flex-shrink-0">
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                  <div className="text-sm text-gray-200 break-words leading-normal">
                    {message.text}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-black border-t border-gray-800 px-3 py-3 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="What's on your mind?"
              className="flex-1 px-4 py-3 bg-gray-900 text-white border border-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:shadow-lg focus:shadow-blue-500/20 placeholder-gray-500 text-sm"
            />
            <button
              onClick={handleSend}
              disabled={inputText.trim() === ''}
              className="bg-blue-500 text-white p-3 rounded-full hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
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
  )
}




