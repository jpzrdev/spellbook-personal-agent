import type { SessionEvent } from './api'

// Turns Claude Code `stream-json` events into terminal lines (with ANSI colors).
const color = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  primary: '\x1b[32m',
  gold: '\x1b[33m',
  ember: '\x1b[31m',
  silver: '\x1b[36m',
}

type Block = { type?: string; text?: string; name?: string; input?: Record<string, unknown>; content?: unknown }

function toolSummary(name: string, input: Record<string, unknown> = {}): string {
  const target = input.file_path ?? input.path ?? input.pattern ?? input.command ?? input.url ?? ''
  const text = String(target).replace(/\s+/g, ' ')
  return text ? `${name}(${text.length > 80 ? text.slice(0, 77) + '…' : text})` : name
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : (c?.text ?? ''))).join('\n')
  return ''
}

/** Terminal lines for an event (empty = shows nothing). Uses \r\n as xterm expects. */
export function formatEvent(ev: SessionEvent): string[] {
  switch (ev.type) {
    case 'system':
      if (ev.subtype === 'init')
        return [`${color.dim}● session started${ev.model ? ` · ${ev.model}` : ''}${color.reset}`]
      return []
    case 'assistant': {
      const blocks = ((ev.message as { content?: Block[] })?.content ?? []) as Block[]
      const lines: string[] = []
      for (const b of blocks) {
        if (b.type === 'text' && b.text?.trim()) lines.push(...b.text.trim().split('\n'))
        if (b.type === 'tool_use')
          lines.push(`${color.gold}⏺ ${toolSummary(b.name ?? 'tool', b.input)}${color.reset}`)
      }
      return lines
    }
    case 'user': {
      const blocks = ((ev.message as { content?: Block[] })?.content ?? []) as Block[]
      const lines: string[] = []
      for (const b of blocks) {
        if (b.type !== 'tool_result') continue
        const text = resultText(b.content).trim()
        const parts = text ? text.split('\n') : ['(no output)']
        const shown = parts.slice(0, 3).map((l) => (l.length > 120 ? l.slice(0, 117) + '…' : l))
        lines.push(`${color.dim}  ⎿ ${shown.join('\r\n    ')}${parts.length > 3 ? ` … (+${parts.length - 3} lines)` : ''}${color.reset}`)
      }
      return lines
    }
    case 'result': {
      const seconds = ((Number(ev.duration_ms) || 0) / 1000).toFixed(1)
      const ok = !ev.is_error && (ev.subtype === 'success' || ev.subtype === undefined)
      return [
        '',
        ok
          ? `${color.primary}${color.bold}✓ done in ${seconds}s${color.reset}`
          : `${color.ember}${color.bold}✗ finished with an error (${String(ev.subtype ?? 'error')})${color.reset}`,
      ]
    }
    case 'gandalf_text':
      return [`${color.dim}${String(ev.text ?? '')}${color.reset}`]
    case 'gandalf_end': {
      const status = String(ev.status)
      if (status === 'ok') return []
      const msg: Record<string, string> = {
        cancelled: 'session cancelled',
        timed_out: 'timed out: session ended',
        error: 'session finished with an error',
      }
      const error = (ev.summary as { error?: string } | undefined)?.error
      return [`${color.ember}■ ${msg[status] ?? status}${error ? `: ${error}` : ''}${color.reset}`]
    }
    default:
      return []
  }
}
