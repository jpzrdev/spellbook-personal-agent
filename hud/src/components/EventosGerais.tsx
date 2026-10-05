import { useQueryClient } from '@tanstack/react-query'
import type { Sessao } from '../lib/api'
import { useWebSocket } from '../lib/ws'
import { useToast } from './ui'

const FIM: Record<string, { tipo: 'sucesso' | 'erro' | 'info'; texto: string }> = {
  ok: { tipo: 'sucesso', texto: 'Sessão concluída' },
  erro: { tipo: 'erro', texto: 'Sessão terminou com erro' },
  tempo_esgotado: { tipo: 'erro', texto: 'Sessão encerrada por tempo' },
  cancelada: { tipo: 'info', texto: 'Sessão cancelada' },
}

/** Ouve /ws/events: atualiza listas e avisa quando uma sessão do Claude Code termina. */
export function EventosGerais() {
  const qc = useQueryClient()
  const toast = useToast()

  useWebSocket('/ws/events', (ev) => {
    if (ev.tipo === 'efemero') {
      qc.invalidateQueries({ queryKey: ['efemeros'] })
      toast('info', `Novo resumo: ${String(ev.titulo ?? '')}`)
    }
    if (ev.tipo === 'lembretes') qc.invalidateQueries({ queryKey: ['lembretes'] })
    if (ev.tipo === 'lembrete') {
      qc.invalidateQueries({ queryKey: ['lembretes'] })
      toast('info', `⏰ ${String(ev.texto ?? '')}`)
    }
    if (ev.tipo === 'rotina' || ev.tipo === 'recibo' || ev.tipo === 'rotinas_recarregadas') {
      qc.invalidateQueries({ queryKey: ['rotinas'] })
      qc.invalidateQueries({ queryKey: ['hoje'] })
    }
    if (ev.tipo === 'sessao') {
      const s = ev.sessao as Sessao
      qc.setQueryData<Sessao[]>(['sessoes'], (lista) => {
        if (!lista) return lista
        return lista.some((x) => x.id === s.id) ? lista.map((x) => (x.id === s.id ? s : x)) : [s, ...lista]
      })
      const fim = FIM[s.status]
      if (fim) {
        toast(fim.tipo, `${fim.texto}: ${s.tarefa.slice(0, 60)}`)
        // Uma sessão pode ter mexido em tarefas, agenda etc.
        qc.invalidateQueries({ queryKey: ['hoje'] })
        qc.invalidateQueries({ queryKey: ['tarefas'] })
      }
    }
  })
  return null
}
