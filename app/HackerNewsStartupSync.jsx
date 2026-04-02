import { unstable_noStore as noStore } from 'next/cache'

import { syncHackerNewsOnce } from '@/lib/syncHackerNews'

export default async function HackerNewsStartupSync() {
  noStore()
  await syncHackerNewsOnce()
  return null
}
