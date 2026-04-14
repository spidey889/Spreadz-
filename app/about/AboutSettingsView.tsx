'use client'

import Link from 'next/link'
import { useState } from 'react'
import { MutedUsersSection } from './MutedUsersSection'

const ABOUT_LINKS = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/community-guidelines', label: 'Community Guidelines' },
  { href: '/cookies-policy', label: 'Cookies Policy' },
] as const

type SettingsSection = 'menu' | 'muted' | 'about'

type SettingsMenuItem = {
  id: Exclude<SettingsSection, 'menu'>
  label: string
}

const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  {
    id: 'muted',
    label: 'Muted People',
  },
  {
    id: 'about',
    label: 'About',
  },
]

function ChevronIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function MenuRow({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.06)] px-5 py-4 text-left text-white shadow-[0_16px_32px_rgba(0,0,0,0.24)] active:bg-[rgba(255,255,255,0.09)]"
    >
      <span className="text-[16px] font-semibold tracking-[-0.01em]">{label}</span>
      <span className="shrink-0 text-white/45" aria-hidden="true">
        <ChevronIcon />
      </span>
    </button>
  )
}

function SectionBackButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-[rgba(255,255,255,0.06)] px-4 py-2 text-sm font-medium text-white active:bg-[rgba(255,255,255,0.09)]"
    >
      <BackIcon />
      {label}
    </button>
  )
}

function LegalLinkRow({
  href,
  label,
}: {
  href: string
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.06)] px-5 py-4 text-[15px] font-semibold text-white shadow-[0_16px_32px_rgba(0,0,0,0.24)] active:bg-[rgba(255,255,255,0.09)]"
    >
      <span>{label}</span>
      <span className="shrink-0 text-white/45" aria-hidden="true">
        <ChevronIcon />
      </span>
    </Link>
  )
}

export function AboutSettingsView() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('menu')
  const isMenuView = activeSection === 'menu'
  const isMutedView = activeSection === 'muted'

  return (
    <main className="min-h-screen bg-[#111214] px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col">
        {isMenuView ? (
          <>
            <Link
              href="/chat"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-[rgba(255,255,255,0.06)] px-4 py-2 text-sm font-medium text-white active:bg-[rgba(255,255,255,0.09)]"
            >
              <BackIcon />
              Back to chat
            </Link>

            <section className="mt-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Settings</div>
              <h1 className="mt-3 text-[30px] font-extrabold tracking-[-0.03em] text-white">About</h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-white/55">
                Choose a section to manage muted people or read the platform policies.
              </p>

              <div className="mt-6 space-y-3">
                {SETTINGS_MENU_ITEMS.map((item) => (
                  <MenuRow
                    key={item.id}
                    label={item.label}
                    onClick={() => setActiveSection(item.id)}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="pt-1">
            <SectionBackButton label="Back" onClick={() => setActiveSection('menu')} />
            <h1 className="mt-5 text-[30px] font-extrabold tracking-[-0.03em] text-white">
              {isMutedView ? 'Muted People' : 'About'}
            </h1>

            {isMutedView ? (
              <MutedUsersSection className="mt-6" />
            ) : (
              <div className="mt-6 space-y-3">
                {ABOUT_LINKS.map((item) => (
                  <LegalLinkRow key={item.href} href={item.href} label={item.label} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
