self.__WB_DISABLE_DEV_LOGS = true

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
        await self.clients.openWindow(targetUrl)
      }
    })
  )
})
