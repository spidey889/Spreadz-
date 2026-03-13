import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SpreadZ',
  description: 'Global live chat',
  manifest: '/manifest.json',
  themeColor: '#0a0a0a',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="bg-[#1a1a1f]">
      <body className="bg-[#1a1a1f]">{children}</body>
    </html>
  )
}
