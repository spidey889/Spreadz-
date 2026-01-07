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
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    const displayMinutes = minutes.toString().padStart(2, '0')
    return `${displayHours}:${displayMinutes} ${ampm}`
  }

  return (
    <div className="h-screen bg-black">
      <div className="w-full max-w-[420px] mx-auto h-full flex flex-col">
        {/* Header */}
        <div className="bg-black border-b border-gray-800 px-3 py-3">
          <h1 className="text-lg font-semibold text-white">Global Chat</h1>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2.5 ${
                  message.isUser
                    ? 'bg-blue-500 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                }`}
              >
                {!message.isUser && (
                  <div className="text-xs font-semibold mb-1 text-gray-300">
                    {message.username}
                  </div>
                )}
                <div className="text-sm break-words leading-relaxed">
                  {message.text}
                </div>
                <div
                  className={`text-xs mt-1.5 ${
                    message.isUser ? 'text-blue-100' : 'text-gray-400'
                  }`}
                >
                  {formatTime(message.timestamp)}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-black border-t border-gray-800 px-3 py-3">
          <div className="flex items-center space-x-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="What's on your mind today?"
              className="flex-1 px-4 py-2.5 bg-gray-900 text-white border border-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-500 text-sm"
            />
            <button
              onClick={handleSend}
              disabled={inputText.trim() === ''}
              className="bg-blue-500 text-white px-5 py-2.5 rounded-full hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}




