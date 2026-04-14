'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef, useState } from 'react'
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
  description: string
}

const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  {
    id: 'muted',
    label: 'Muted People',
    description: 'Manage the people you have muted.',
  },
  {
    id: 'about',
    label: 'About',
    description: 'Read our legal terms and platform policies.',
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
  description,
  onClick,
  showBorder,
}: {
  label: string
  description: string
  onClick: () => void
  showBorder: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition active:bg-slate-50 ${showBorder ? 'border-b border-slate-200/80' : ''}`}
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-slate-950">{label}</span>
        <span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span>
      </span>
      <span className="shrink-0 text-slate-400" aria-hidden="true">
        <ChevronIcon />
      </span>
    </button>
  )
}

function SectionHeader({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]"
      >
        <BackIcon />
        Back
      </button>
      <h2 className="mt-5 text-[28px] font-extrabold tracking-[-0.03em] text-slate-950">{title}</h2>
    </div>
  )
}

export function AboutSettingsView() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('menu')
  const [frameHeight, setFrameHeight] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)
  const detailSection: Exclude<SettingsSection, 'menu'> = activeSection === 'menu' ? 'about' : activeSection

  useLayoutEffect(() => {
    const updateHeight = () => {
      const target = activeSection === 'menu' ? menuRef.current : detailRef.current
      setFrameHeight(target?.offsetHeight ?? null)
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver(() => {
      updateHeight()
    })

    if (menuRef.current) observer.observe(menuRef.current)
    if (detailRef.current) observer.observe(detailRef.current)

    return () => observer.disconnect()
  }, [activeSection])

  const detailTitle = detailSection === 'about' ? 'About' : 'Muted People'

  return (
    <main className="min-h-screen bg-[#111214] px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col">
        <Link
          href="/chat"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
        >
          <BackIcon />
          Back to chat
        </Link>

        <section className="mt-4 overflow-hidden rounded-[28px] border border-white/10 bg-white/95 text-slate-900 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
          <div
            className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={frameHeight ? { height: `${frameHeight}px` } : undefined}
          >
            <div
              className="flex transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: activeSection === 'menu' ? 'translateX(0%)' : 'translateX(-50%)' }}
            >
              <div ref={menuRef} className="w-full shrink-0 p-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Settings</div>
                <h1 className="mt-2 text-[30px] font-extrabold tracking-[-0.03em] text-slate-950">Manage your account</h1>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Open a section to review muted people or read the legal and policy details for SpreadZ.
                </p>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                  {SETTINGS_MENU_ITEMS.map((item, index) => (
                    <MenuRow
                      key={item.id}
                      label={item.label}
                      description={item.description}
                      onClick={() => setActiveSection(item.id)}
                      showBorder={index !== SETTINGS_MENU_ITEMS.length - 1}
                    />
                  ))}
                </div>
              </div>

              <div ref={detailRef} className="w-full shrink-0 p-6">
                <SectionHeader title={detailTitle} onBack={() => setActiveSection('menu')} />

                {detailSection === 'about' ? (
                  <div className="mt-5">
                    <p className="text-sm leading-6 text-slate-500">
                      Everything here covers how SpreadZ works, how data is handled, and the rules people agree to while using the app.
                    </p>
                    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                      {ABOUT_LINKS.map((item, index) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center justify-between gap-3 px-4 py-4 text-[15px] font-semibold text-slate-950 transition active:bg-slate-50 ${index !== ABOUT_LINKS.length - 1 ? 'border-b border-slate-200/80' : ''}`}
                        >
                          <span>{item.label}</span>
                          <span className="text-slate-400" aria-hidden="true">
                            <ChevronIcon />
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <MutedUsersSection className="mt-5" />
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
