import { useCallback, useEffect, useState } from 'react'
import { api, post } from './api'

// Notificações Web Push: o service worker (public/sw.js) recebe e mostra; o Bridge envia.
// Só funciona no build de produção (o SW não é registrado no dev) e, no iPhone, só com o app
// adicionado à tela de início.

export type EstadoPush = 'carregando' | 'dev' | 'sem-suporte' | 'instalar' | 'bloqueado' | 'desligado' | 'ligado'

function ehIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function instalado(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function nomeAparelho(): string {
  const ua = navigator.userAgent
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Aparelho'
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return [so, nav, instalado() ? '(app)' : ''].filter(Boolean).join(' ')
}

function chaveParaBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const bruto = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length))
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

async function estadoAtual(): Promise<EstadoPush> {
  if (!import.meta.env.PROD) return 'dev'
  if (ehIOS() && !instalado()) return 'instalar'
  if (!('PushManager' in window) || !('Notification' in window) || !('serviceWorker' in navigator)) return 'sem-suporte'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await registro()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return 'desligado'
  // Reenvia a inscrição (idempotente): se o Bridge perdeu bridge/dados/, volta a funcionar.
  post('/push/inscrever', { inscricao: sub.toJSON(), aparelho: nomeAparelho() }).catch(() => {})
  return 'ligado'
}

export function usePush() {
  const [estado, setEstado] = useState<EstadoPush>('carregando')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    estadoAtual().then((e) => vivo && setEstado(e)).catch(() => vivo && setEstado('sem-suporte'))
    return () => {
      vivo = false
    }
  }, [])

  // Precisa ser chamado num toque do usuário (exigência do iOS para pedir permissão).
  const ativar = useCallback(async () => {
    setErro(null)
    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') {
        setEstado(permissao === 'denied' ? 'bloqueado' : 'desligado')
        return
      }
      const { chave } = await api<{ chave: string }>('/push/chave')
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) }))
      await post('/push/inscrever', { inscricao: sub.toJSON(), aparelho: nomeAparelho() })
      setEstado('ligado')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const desativar = useCallback(async () => {
    setErro(null)
    try {
      const sub = await (await registro())?.pushManager.getSubscription()
      if (sub) {
        await post('/push/cancelar', { endpoint: sub.endpoint }).catch(() => {})
        await sub.unsubscribe()
      }
      setEstado('desligado')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [])

  return { estado, erro, ativar, desativar }
}
