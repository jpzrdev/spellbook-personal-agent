import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  titulo: ReactNode
  /** Linhas de texto simples. Na fase 3 o corpo passa a ser um xterm.js via `children`. */
  linhas?: string[]
  children?: ReactNode
  acoes?: ReactNode
  className?: string
}

const ponto = 'size-3 rounded-pilula shadow-[inset_0_-1px_2px_rgb(0_0_0/0.35)]'

/** Terminal: moldura em relevo (cor do fundo) e tela escura cavada. */
export function TerminalPane({ titulo, linhas, children, acoes, className }: Props) {
  return (
    <section className={cn('overflow-hidden rounded-card bg-pergaminho shadow-relevo', className)}>
      <header className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-1">
        <div className="flex gap-1.5" aria-hidden>
          <span className={cn(ponto, 'bg-terracota')} />
          <span className={cn(ponto, 'bg-ocre')} />
          <span className={cn(ponto, 'bg-musgo-claro')} />
        </div>
        <h3 className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-tinta-suave">{titulo}</h3>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </header>
      <div className="p-3">
        <div className="max-h-96 min-h-40 overflow-auto rounded-controle bg-terminal p-4 font-mono text-sm leading-relaxed text-marfim shadow-[inset_3px_3px_8px_rgb(0_0_0/0.6)]">
          {children ??
            linhas?.map((linha, i) => (
              <div key={i} className="break-words whitespace-pre-wrap">
                {linha || ' '}
              </div>
            ))}
        </div>
      </div>
    </section>
  )
}
