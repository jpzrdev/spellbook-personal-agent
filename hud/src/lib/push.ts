import { useCallback, useEffect, useState } from 'react'
import { api, post } from './api'

// Web Push notifications: the service worker (public/sw.js) receives and shows them; the Bridge sends them.
// Only works in the production build (the SW isn't registered in dev) and, on iPhone, only with the app
// added to the home screen.

export type PushState = 'loading' | 'dev' | 'unsupported' | 'install' | 'blocked' | 'off' | 'on'

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function installed(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function deviceName(): string {
  const ua = navigator.userAgent
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return [os, browser, installed() ? '(app)' : ''].filter(Boolean).join(' ')
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

async function currentState(): Promise<PushState> {
  if (!import.meta.env.PROD) return 'dev'
  if (isIOS() && !installed()) return 'install'
  if (!('PushManager' in window) || !('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return 'off'
  // Resends the subscription (idempotent): if the Bridge lost bridge/data/, it works again.
  post('/push/subscribe', { subscription: sub.toJSON(), device: deviceName() }).catch(() => {})
  return 'on'
}

export function usePush() {
  const [state, setState] = useState<PushState>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    currentState().then((s) => alive && setState(s)).catch(() => alive && setState('unsupported'))
    return () => {
      alive = false
    }
  }, [])

  // Must be called from a user tap (iOS requires it to ask for permission).
  const enable = useCallback(async () => {
    setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const { key } = await api<{ key: string }>('/push/key')
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }))
      await post('/push/subscribe', { subscription: sub.toJSON(), device: deviceName() })
      setState('on')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const disable = useCallback(async () => {
    setError(null)
    try {
      const sub = await (await registration())?.pushManager.getSubscription()
      if (sub) {
        await post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
        await sub.unsubscribe()
      }
      setState('off')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  return { state, error, enable, disable }
}
