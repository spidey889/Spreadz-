import type { MetadataRoute } from 'next'

const siteUrl = 'https://spreadz.in'

const routes = [
  '',
  '/about',
  '/chat',
  '/community-guidelines',
  '/cookies-policy',
  '/privacy',
  '/privacy-policy',
  '/terms',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
  }))
}
