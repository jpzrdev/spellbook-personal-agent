import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import type { SessionEvent } from '../lib/api'
import { cn } from '../lib/cn'
import { formatEvent } from '../lib/terminalFormat'

// ANSI colors in the Grey palette (the screen is always dark, in both themes).
const THEME = {
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

type Props = { events: SessionEvent[]; className?: string; label: string }

/** A read-only terminal that renders the events of a Claude Code session. */
export function XTerm({ events, className, label }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const written = useRef(0)

  useEffect(() => {
    if (!host.current) return
    const t = new Terminal({
      theme: THEME,
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
    written.current = 0
    const resize = () => {
      try {
        fit.fit()
      } catch {
        // the container has no size yet
      }
    }
    resize()
    const obs = new ResizeObserver(resize)
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
    // The list shrank (switched sessions): start over.
    if (events.length < written.current) {
      t.reset()
      written.current = 0
    }
    for (const ev of events.slice(written.current)) {
      for (const line of formatEvent(ev)) t.writeln(line)
    }
    written.current = events.length
  }, [events])

  return <div ref={host} role="log" aria-label={label} className={cn('h-80 w-full', className)} />
}
