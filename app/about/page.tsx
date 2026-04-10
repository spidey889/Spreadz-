import type { Metadata } from 'next'
import Link from 'next/link'

const ABOUT_LINKS = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/community-guidelines', label: 'Community Guidelines' },
  { href: '/cookies-policy', label: 'Cookies Policy' },
]

export const metadata: Metadata = {
  title: 'About | SpreadZ',
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#111214] px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col">
        <Link
          href="/chat"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to chat
        </Link>

        <section className="mt-4 rounded-[28px] border border-white/10 bg-white/95 p-6 text-slate-900 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
          <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-slate-950">About</h1>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80">
            {ABOUT_LINKS.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between gap-3 px-4 py-4 text-[15px] font-medium text-slate-900 transition active:bg-slate-50 ${index !== ABOUT_LINKS.length - 1 ? 'border-b border-slate-200/80' : ''}`}
              >
                <span>{item.label}</span>
                <span className="text-slate-400" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
