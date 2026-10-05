import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import type { EventoSessao } from '../lib/api'
import { cn } from '../lib/cn'
import { formatarEvento } from '../lib/terminalFormat'

// Cores ANSI na paleta Cinzento (tela sempre escura, nos dois temas).
const TEMA = {
  background: '#16181d',
  foreground: '#eeece8',
  cursor: '#e0a42a',
  selectionBackground: '#3b537880',
  black: '#16181d',
  red: '#e07a5f',
  green: '#9cc27a',
  yellow: '#e0b163',
  blue: '#8aa2cc',
  magenta: '#b79ad9',
  cyan: '#8fbfd0',
  white: '#eeece8',
  brightBlack: '#7d828c',
}

type Props = { eventos: EventoSessao[]; className?: string; rotulo: string }

/** Terminal só de leitura que renderiza os eventos de uma sessão do Claude Code. */
export function XTerm({ eventos, className, rotulo }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const escritos = useRef(0)

  useEffect(() => {
    if (!host.current) return
    const t = new Terminal({
      theme: TEMA,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      lineHeight: 1.35,
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      cursorInactiveStyle: 'none',
      scrollback: 5000,
    })
    const fit = new FitAddon()
    t.loadAddon(fit)
    t.open(host.current)
    term.current = t
    escritos.current = 0
    const ajustar = () => {
      try {
        fit.fit()
      } catch {
        // container ainda sem tamanho
      }
    }
    ajustar()
    const obs = new ResizeObserver(ajustar)
    obs.observe(host.current)
    return () => {
      obs.disconnect()
      t.dispose()
      term.current = null
    }
  }, [])

  useEffect(() => {
    const t = term.current
    if (!t) return
    // Lista diminuiu (trocou de sessão): recomeça do zero.
    if (eventos.length < escritos.current) {
      t.reset()
      escritos.current = 0
    }
    for (const ev of eventos.slice(escritos.current)) {
      for (const linha of formatarEvento(ev)) t.writeln(linha)
    }
    escritos.current = eventos.length
  }, [eventos])

  return <div ref={host} role="log" aria-label={rotulo} className={cn('h-80 w-full', className)} />
}
