'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  username: string
  text: string
  timestamp: Date
  isUser: boolean
}

// Mock initial messages
const initialMessages: Message[] = [
  {
    id: '1',
    username: 'Alice',
    text: 'Hey! How are you doing?',
    timestamp: new Date(Date.now() - 3600000),
    isUser: false,
  },
  {
    id: '2',
    username: 'You',
    text: 'I\'m doing great, thanks for asking!',
    timestamp: new Date(Date.now() - 3300000),
    isUser: true,
  },
  {
    id: '3',
    username: 'Bob',
    text: 'Anyone up for a quick chat?',
    timestamp: new Date(Date.now() - 1800000),
    isUser: false,
  },
  {
    id: '4',
    username: 'You',
    text: 'Sure, what\'s on your mind?',
    timestamp: new Date(Date.now() - 1500000),
    isUser: true,
  },
  {
    id: '5',
    username: 'Alice',
    text: 'Just checking in with everyone!',
    timestamp: new Date(Date.now() - 600000),
    isUser: false,
  },
]

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
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
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <h1 className="text-xl font-semibold text-gray-800">Chat</h1>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] sm:max-w-[60%] rounded-2xl px-4 py-2 ${
                message.isUser
                  ? 'bg-blue-500 text-white rounded-br-sm'
                  : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'
              }`}
            >
              {!message.isUser && (
                <div className="text-xs font-semibold mb-1 opacity-90">
                  {message.username}
                </div>
              )}
              <div className="text-sm sm:text-base break-words">
                {message.text}
              </div>
              <div
                className={`text-xs mt-1 ${
                  message.isUser ? 'text-blue-100' : 'text-gray-500'
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
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="flex items-center space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
          />
          <button
            onClick={handleSend}
            disabled={inputText.trim() === ''}
            className="bg-blue-500 text-white px-6 py-2 rounded-full hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base font-medium"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}




