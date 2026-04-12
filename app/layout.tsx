import type { Metadata } from 'next'
import { GoogleAnalytics } from '@next/third-parties/google'
import './globals.css'
import HackerNewsStartupSync from './HackerNewsStartupSync'
import Providers from './providers'

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Spreadz',
  url: 'https://spreadz.in',
  logo: 'https://spreadz.in/icon-512x512.png',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://spreadz.in'),
  title: 'SpreadZ',
  description: 'Global live chat',
  manifest: '/manifest.json',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="bg-[#1a1a1f]">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="bg-[#1a1a1f]">
        <HackerNewsStartupSync />
        <Providers>{children}</Providers>
        <GoogleAnalytics gaId="G-CZRY2915RE" />
      </body>
    </html>
  )
}
