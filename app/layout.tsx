import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { GoogleAnalytics } from '@next/third-parties/google'
import './globals.css'
import HackerNewsStartupSync from './HackerNewsStartupSync'
import Providers from './providers'

const exitFeedbackHistoryScript = `
  (() => {
    if (typeof window === 'undefined') return;

    const path = window.location.pathname;
    if (path !== '/' && path !== '/chat') return;

    const storageKey = 'spreadz_exit_feedback_history_installed';
    const feedbackPageKey = '__spreadzExitFeedbackPage';
    const currentPageKey = '__spreadzExitFeedbackCurrent';

    try {
      if (window.sessionStorage.getItem(storageKey) === '1') return;

      const currentUrl = path + window.location.search + window.location.hash;
      const currentHistoryState =
        window.history.state && typeof window.history.state === 'object' ? window.history.state : {};

      if (currentHistoryState[feedbackPageKey] || currentHistoryState[currentPageKey]) {
        window.sessionStorage.setItem(storageKey, '1');
        return;
      }

      const feedbackUrl = '/before-you-go?returnTo=' + encodeURIComponent(currentUrl);
      const feedbackState = { ...currentHistoryState, [feedbackPageKey]: true };
      const currentState = { ...currentHistoryState, [currentPageKey]: true };

      window.history.replaceState(feedbackState, '', feedbackUrl);
      window.history.pushState(currentState, '', currentUrl);
      window.sessionStorage.setItem(storageKey, '1');
    } catch (error) {
      console.error('[ExitFeedback] Failed to install history trap', error);
    }
  })();
`

export const metadata: Metadata = {
  title: 'SpreadZ',
  description: 'Global live chat',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
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
      <body className="bg-[#1a1a1f]">
        <script dangerouslySetInnerHTML={{ __html: exitFeedbackHistoryScript }} />
        <HackerNewsStartupSync />
        <Providers>{children}</Providers>
        <GoogleAnalytics gaId="G-CZRY2915RE" />
        <Analytics />
      </body>
    </html>
  )
}
