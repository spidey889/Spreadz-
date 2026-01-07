'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [showSkip, setShowSkip] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/chat')
    }, 2000)

    const skipTimer = setTimeout(() => {
      setShowSkip(true)
    }, 500)

    return () => {
      clearTimeout(timer)
      clearTimeout(skipTimer)
    }
  }, [router])

  const handleSkip = () => {
    router.push('/chat')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-black">
      <h1 className="text-4xl font-bold mb-8 text-white">Spreadz Chat</h1>
      {showSkip && (
        <button
          onClick={handleSkip}
          className="px-6 py-3 bg-transparent text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-900 hover:text-white transition-colors text-sm"
        >
          Skip
        </button>
      )}
    </main>
  )
}




