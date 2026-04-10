import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Community Guidelines | SpreadZ',
}

export default async function CommunityGuidelinesPage() {
  const guidelinesHtml = await readFile(
    path.join(process.cwd(), 'app', 'community-guidelines', 'community-guidelines.html'),
    'utf8',
  )

  return (
    <main className="h-screen overflow-y-auto bg-[#111214] px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
        >
          Back to SpreadZ
        </Link>
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
          <div dangerouslySetInnerHTML={{ __html: guidelinesHtml }} />
        </section>
      </div>
    </main>
  )
}
