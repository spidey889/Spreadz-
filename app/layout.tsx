import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Spreadz Chat',
  description: 'Simple chat interface',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}




