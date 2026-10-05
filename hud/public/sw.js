// Gandalf's service worker: makes the app installable and opens the "shell" even on a flaky network.
// Never caches anything from the API (/api): vault data and Gandalf's replies always come from the Bridge.
const CACHE = 'gandalf-v3'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return

  // Navigation (opening a screen): network first; offline, the cached shell.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')))
    return
  }

  // Build files have a hash in their name: they can come from the cache.
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ||
          fetch(e.request).then((resp) => {
            if (resp.ok) {
              const copy = resp.clone()
              caches.open(CACHE).then((c) => c.put(e.request, copy))
            }
            return resp
          }),
      ),
    )
  }
})

// ---------- Notifications (Web Push sent by the Bridge) ----------
// The payload only carries a short title/body and the screen to open; no sensitive content.
self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { title: e.data ? e.data.text() : 'Gandalf' }
  }
  const options = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    data: { url: d.url || '/', reminder_id: d.reminder_id || null },
  }
  // Action buttons show up on Android/desktop (iPhone ignores them; there a tap opens the app).
  if (d.reminder_id) {
    options.actions = [
      { action: 'snooze10', title: 'Snooze 10 min' },
      { action: 'snooze60', title: 'Snooze 1 h' },
    ]
  }
  e.waitUntil(self.registration.showNotification(d.title || 'Gandalf', options))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const { url, reminder_id } = e.notification.data || {}
  let target = url || '/'
  if (reminder_id && (e.action === 'snooze10' || e.action === 'snooze60')) {
    target = `/?reminder=${encodeURIComponent(reminder_id)}&action=${e.action}`
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === location.origin)
      if (open) return open.navigate(target).then((w) => (w || open).focus())
      return self.clients.openWindow(target)
    }),
  )
})
