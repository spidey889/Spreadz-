self.__WB_DISABLE_DEV_LOGS = true

self.addEventListener('push', (event) => {
  let payload = {}

  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { body: event.data.text() }
    }
  }

  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : 'SpreadZ'
  const body =
    typeof payload.body === 'string' && payload.body.trim()
      ? payload.body.trim()
      : 'You have a new update.'
  const url =
    typeof payload.url === 'string' && payload.url.trim()
      ? payload.url.trim()
      : '/chat'
  const tag =
    typeof payload.tag === 'string' && payload.tag.trim()
      ? payload.tag.trim()
      : 'spreadz-prototype'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192x192.png',
      badge: '/favicon-48x48.png',
      tag,
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url =
    event.notification && event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : '/chat'
  const targetUrl = new URL(url, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus()
        }
      }

      if (clientsList[0] && 'navigate' in clientsList[0]) {
        return clientsList[0].navigate(targetUrl).then(() => clientsList[0].focus())
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }

      return undefined
    })
  )
})
