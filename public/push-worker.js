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
      : 'You have a new message.'
  const url =
    typeof payload.url === 'string' && payload.url.trim()
      ? payload.url.trim()
      : '/chat'
  const tag =
    typeof payload.tag === 'string' && payload.tag.trim()
      ? payload.tag.trim()
      : 'spreadz-message'
  const icon =
    typeof payload.icon === 'string' && payload.icon.trim()
      ? payload.icon.trim()
      : '/spreadz-logo.png'
  const badge =
    typeof payload.badge === 'string' && payload.badge.trim()
      ? payload.badge.trim()
      : '/push-badge-monochrome.png'
  const image =
    typeof payload.image === 'string' && payload.image.trim()
      ? payload.image.trim()
      : ''

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      ...(image ? { image } : {}),
      tag,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      timestamp: Date.now(),
      actions: [
        {
          action: 'open-chat',
          title: 'Open Chat',
        },
      ],
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
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientsList) => {
      const existingClient = clientsList[0]

      if (existingClient) {
        if ('focus' in existingClient) {
          await existingClient.focus()
        }

        if ('navigate' in existingClient) {
          await existingClient.navigate(targetUrl)
        }

        return
      }

      if (self.clients.openWindow) {
        const openedClient = await self.clients.openWindow(targetUrl)
        if (openedClient && 'focus' in openedClient) {
          await openedClient.focus()
        }
      }
    })
  )
})
