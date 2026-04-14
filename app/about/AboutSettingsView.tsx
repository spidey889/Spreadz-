'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { MutedUsersSection } from './MutedUsersSection'

const ABOUT_LINKS = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/community-guidelines', label: 'Community Guidelines' },
  { href: '/cookies-policy', label: 'Cookies Policy' },
] as const

const USERNAME_STORAGE_KEY = 'spreadz_username'

type SettingsSection = 'menu' | 'muted' | 'about'

type SettingsMenuItem = {
  id: Exclude<SettingsSection, 'menu'>
  icon: ReactNode
  label: string
  subtitle: string
}

function MutedPeopleIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21a4 4 0 0 0-8 0" />
      <circle cx="12" cy="7" r="4" />
      <path d="m4 4 16 16" />
    </svg>
  )
}

function InfoCircleIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  {
    id: 'muted',
    icon: <MutedPeopleIcon />,
    label: 'Muted People',
    subtitle: 'Manage the people you have muted',
  },
  {
    id: 'about',
    icon: <InfoCircleIcon />,
    label: 'About',
    subtitle: 'Terms, privacy, guidelines, and cookies',
  },
]

function ChevronIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function MenuRow({
  icon,
  label,
  subtitle,
  onClick,
  showDivider,
}: {
  icon: ReactNode
  label: string
  subtitle: string
  onClick: () => void
  showDivider: boolean
}) {
  return (
    <div className={showDivider ? 'border-b border-white/10' : ''}>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-4 py-4 text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center text-white/55">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold tracking-[-0.02em] text-white">{label}</span>
          <span className="mt-1 block truncate text-sm text-white/45">{subtitle}</span>
        </span>
        <span className="shrink-0 text-white/35" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
    </div>
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
  const [username, setUsername] = useState('')
  const isMenuView = activeSection === 'menu'
  const isMutedView = activeSection === 'muted'

  useEffect(() => {
    if (typeof window === 'undefined') return
    setUsername(localStorage.getItem(USERNAME_STORAGE_KEY)?.trim() || '')
  }, [])

  return (
    <main className="min-h-screen bg-[#111214] px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col">
        {isMenuView ? (
          <>
            <Link
              href="/chat"
              className="inline-flex w-fit items-center text-[15px] font-medium text-white"
            >
              ← Back
            </Link>

            <section className="mt-8">
              <h1 className="text-[34px] font-extrabold tracking-[-0.03em] text-white">Settings</h1>
              {username ? (
                <div className="mt-1 text-[17px] text-white/40">@{username.replace(/^@/, '')}</div>
              ) : null}

              <div className="mt-5 border-t border-white/10">
                {SETTINGS_MENU_ITEMS.map((item, index) => (
                  <MenuRow
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    subtitle={item.subtitle}
                    onClick={() => setActiveSection(item.id)}
                    showDivider={index !== SETTINGS_MENU_ITEMS.length - 1}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="pt-1">
            <button
              type="button"
              onClick={() => setActiveSection('menu')}
              className="inline-flex w-fit items-center text-[15px] font-medium text-white"
            >
              ← Back
            </button>
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
