import type { EventoSessao } from './api'

// Converte eventos `stream-json` do Claude Code em linhas de terminal (com cores ANSI).
const cor = {
  reset: '\x1b[0m',
  fraco: '\x1b[2m',
  negrito: '\x1b[1m',
  musgo: '\x1b[32m',
  ocre: '\x1b[33m',
  terracota: '\x1b[31m',
  ardosia: '\x1b[36m',
}

type Bloco = { type?: string; text?: string; name?: string; input?: Record<string, unknown>; content?: unknown }

function resumoFerramenta(nome: string, input: Record<string, unknown> = {}): string {
  const alvo = input.file_path ?? input.path ?? input.pattern ?? input.command ?? input.url ?? ''
  const texto = String(alvo).replace(/\s+/g, ' ')
  return texto ? `${nome}(${texto.length > 80 ? texto.slice(0, 77) + '…' : texto})` : nome
}

function textoResultado(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : (c?.text ?? ''))).join('\n')
  return ''
}

/** Linhas de terminal para um evento (vazio = não mostra nada). Usa \r\n como o xterm espera. */
export function formatarEvento(ev: EventoSessao): string[] {
  switch (ev.type) {
    case 'system':
      if (ev.subtype === 'init')
        return [`${cor.fraco}● sessão iniciada${ev.model ? ` · ${ev.model}` : ''}${cor.reset}`]
      return []
    case 'assistant': {
      const blocos = ((ev.message as { content?: Bloco[] })?.content ?? []) as Bloco[]
      const linhas: string[] = []
      for (const b of blocos) {
        if (b.type === 'text' && b.text?.trim()) linhas.push(...b.text.trim().split('\n'))
        if (b.type === 'tool_use')
          linhas.push(`${cor.ocre}⏺ ${resumoFerramenta(b.name ?? 'ferramenta', b.input)}${cor.reset}`)
      }
      return linhas
    }
    case 'user': {
      const blocos = ((ev.message as { content?: Bloco[] })?.content ?? []) as Bloco[]
      const linhas: string[] = []
      for (const b of blocos) {
        if (b.type !== 'tool_result') continue
        const texto = textoResultado(b.content).trim()
        const partes = texto ? texto.split('\n') : ['(sem saída)']
        const mostrar = partes.slice(0, 3).map((l) => (l.length > 120 ? l.slice(0, 117) + '…' : l))
        linhas.push(`${cor.fraco}  ⎿ ${mostrar.join('\r\n    ')}${partes.length > 3 ? ` … (+${partes.length - 3} linhas)` : ''}${cor.reset}`)
      }
      return linhas
    }
    case 'result': {
      const segundos = ((Number(ev.duration_ms) || 0) / 1000).toFixed(1)
      const ok = !ev.is_error && (ev.subtype === 'success' || ev.subtype === undefined)
      return [
        '',
        ok
          ? `${cor.musgo}${cor.negrito}✓ concluído em ${segundos}s${cor.reset}`
          : `${cor.terracota}${cor.negrito}✗ terminou com erro (${String(ev.subtype ?? 'erro')})${cor.reset}`,
      ]
    }
    case 'lifeos_texto':
      return [`${cor.fraco}${String(ev.texto ?? '')}${cor.reset}`]
    case 'lifeos_fim': {
      const status = String(ev.status)
      if (status === 'ok') return []
      const msg: Record<string, string> = {
        cancelada: 'sessão cancelada',
        tempo_esgotado: 'tempo esgotado: sessão encerrada',
        erro: 'sessão terminou com erro',
      }
      const erro = (ev.resumo as { erro?: string } | undefined)?.erro
      return [`${cor.terracota}■ ${msg[status] ?? status}${erro ? `: ${erro}` : ''}${cor.reset}`]
    }
    default:
      return []
  }
}
