import type { Metadata } from 'next'
import { AboutSettingsView } from './AboutSettingsView'

export const metadata: Metadata = {
  title: 'Settings | SpreadZ',
}

export default function AboutPage() {
  return <AboutSettingsView />
}
