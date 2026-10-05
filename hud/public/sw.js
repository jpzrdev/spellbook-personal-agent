// Service worker do Gandalf: deixa o app instalável e abre a "casca" mesmo com a rede instável.
// Nunca guarda nada da API (/api): dados do vault e respostas do Gandalf sempre vêm do Bridge.
const CACHE = 'lifeos-v2'
const CASCA = ['/', '/index.html', '/manifest.webmanifest', '/icone-192.png', '/icone.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return

  // Navegação (abrir uma tela): rede primeiro; sem rede, a casca guardada.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')))
    return
  }

  // Arquivos do build têm hash no nome: podem vir do cache.
  if (url.pathname.startsWith('/assets/') || CASCA.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(
        (guardado) =>
          guardado ||
          fetch(e.request).then((resp) => {
            if (resp.ok) {
              const copia = resp.clone()
              caches.open(CACHE).then((c) => c.put(e.request, copia))
            }
            return resp
          }),
      ),
    )
  }
})

// ---------- Notificações (Web Push enviado pelo Bridge) ----------
// O payload traz só título/corpo curtos e a tela a abrir; nada de conteúdo sensível.
self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { titulo: e.data ? e.data.text() : 'Gandalf' }
  }
  const opcoes = {
    body: d.corpo || '',
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    data: { url: d.url || '/', lembrete_id: d.lembrete_id || null },
  }
  // Botões de ação aparecem no Android/desktop (o iPhone ignora; lá o toque abre o app).
  if (d.lembrete_id) {
    opcoes.actions = [
      { action: 'adiar10', title: 'Adiar 10 min' },
      { action: 'adiar60', title: 'Adiar 1 h' },
    ]
  }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Gandalf', opcoes))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const { url, lembrete_id } = e.notification.data || {}
  let destino = url || '/'
  if (lembrete_id && (e.action === 'adiar10' || e.action === 'adiar60')) {
    destino = `/?lembrete=${encodeURIComponent(lembrete_id)}&acao=${e.action}`
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      const aberta = janelas.find((j) => new URL(j.url).origin === location.origin)
      if (aberta) return aberta.navigate(destino).then((j) => (j || aberta).focus())
      return self.clients.openWindow(destino)
    }),
  )
})
