import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  title: ReactNode
  /** Plain text lines. For a live session the body is an xterm.js via `children`. */
  lines?: string[]
  children?: ReactNode
  actions?: ReactNode
  className?: string
}

const dot = 'size-3 rounded-pill shadow-[inset_0_-1px_2px_rgb(0_0_0/0.35)]'

/** Terminal: a raised frame (background color) and a dark sunken screen. */
export function TerminalPane({ title, lines, children, actions, className }: Props) {
  return (
    <section className={cn('overflow-hidden rounded-card bg-surface shadow-raised', className)}>
      <header className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-1">
        <div className="flex gap-1.5" aria-hidden>
          <span className={cn(dot, 'bg-ember')} />
          <span className={cn(dot, 'bg-gold')} />
          <span className={cn(dot, 'bg-primary-light')} />
        </div>
        <h3 className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-ink-muted">{title}</h3>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-3">
        <div className="max-h-96 min-h-40 overflow-auto rounded-control bg-terminal p-4 font-mono text-sm leading-relaxed text-ivory shadow-[inset_3px_3px_8px_rgb(0_0_0/0.6)]">
          {children ??
            lines?.map((line, i) => (
              <div key={i} className="break-words whitespace-pre-wrap">
                {line || ' '}
              </div>
            ))}
        </div>
      </div>
    </section>
  )
}
