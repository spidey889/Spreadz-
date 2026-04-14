import type { Metadata } from 'next'
import { AboutSettingsView } from './AboutSettingsView'

export const metadata: Metadata = {
  title: 'About | SpreadZ',
}

export default function AboutPage() {
  return <AboutSettingsView />
}
