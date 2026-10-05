import { useEffect, useRef, useState } from 'react'
import { TOKEN, type EventoSessao, type Sessao } from './api'

/** URL de WebSocket via o proxy /api do Vite (o token vai na query: o navegador não manda header em WS). */
export function wsUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/api${path}?token=${encodeURIComponent(TOKEN ?? '')}`
}

/** Conecta com reconexão simples (backoff até 10 s) e entrega cada mensagem JSON. */
export function useWebSocket(path: string | null, onMensagem: (dado: EventoSessao) => void) {
  const callback = useRef(onMensagem)
  useEffect(() => {
    callback.current = onMensagem
  })
  const [conectado, setConectado] = useState(false)
  // Recusado pelo servidor (1008: token inválido ou sessão inexistente), por caminho.
  const [recusado, setRecusado] = useState<string | null>(null)

  useEffect(() => {
    if (!path) return
    let ws: WebSocket | null = null
    let tentativa = 0
    let timer: number | undefined
    let ativo = true

    const conectar = () => {
      ws = new WebSocket(wsUrl(path))
      ws.onopen = () => {
        tentativa = 0
        setConectado(true)
      }
      ws.onmessage = (e) => {
        try {
          callback.current(JSON.parse(e.data))
        } catch {
          // mensagem não-JSON: ignora
        }
      }
      ws.onclose = (e) => {
        setConectado(false)
        // 1008 = token inválido / sessão inexistente: não adianta tentar de novo.
        if (e.code === 1008) setRecusado(path)
        if (!ativo || e.code === 1008) return
        timer = window.setTimeout(conectar, Math.min(10_000, 500 * 2 ** tentativa++))
      }
    }
    conectar()
    return () => {
      ativo = false
      window.clearTimeout(timer)
      ws?.close()
    }
  }, [path])

  return { conectado, recusado: recusado !== null && recusado === path }
}

type EstadoStream = { id: string | null; eventos: EventoSessao[]; resumo: Sessao | null }

/** Stream de uma sessão do Tier 3: eventos acumulados + último resumo. */
export function useSessaoStream(sessaoId: string | null) {
  const [estado, setEstado] = useState<EstadoStream>({ id: sessaoId, eventos: [], resumo: null })
  const vistos = useRef<{ id: string | null; seqs: Set<number> }>({ id: sessaoId, seqs: new Set() })

  const { conectado, recusado } = useWebSocket(sessaoId ? `/ws/stream/${sessaoId}` : null, (ev) => {
    if (vistos.current.id !== sessaoId) vistos.current = { id: sessaoId, seqs: new Set() }
    // Ao reconectar o servidor reenvia o buffer: descarta o que já veio (pelo _seq).
    const seq = ev._seq
    if (typeof seq === 'number') {
      if (vistos.current.seqs.has(seq)) return
      vistos.current.seqs.add(seq)
    }
    setEstado((prev) => {
      const base = prev.id === sessaoId ? prev : { id: sessaoId, eventos: [], resumo: null }
      const resumo = ev.type === 'lifeos_status' || ev.type === 'lifeos_fim' ? (ev.resumo as Sessao) : base.resumo
      const eventos = ev.type === 'lifeos_status' ? base.eventos : [...base.eventos, ev]
      return { id: sessaoId, eventos, resumo }
    })
  })

  // Trocou de sessão e ainda não chegou nada da nova: mostra vazio (derivado, sem efeito).
  const atual = estado.id === sessaoId ? estado : { eventos: [], resumo: null }
  return { eventos: atual.eventos, resumo: atual.resumo, conectado, indisponivel: recusado && !atual.resumo }
}
