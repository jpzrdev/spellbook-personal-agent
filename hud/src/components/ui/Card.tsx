import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconChip } from './IconChip'
import { relevo, type Cor } from './styles'

type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  titulo?: ReactNode
  subtitulo?: ReactNode
  icone?: ReactNode
  /** Cor do chip de ícone. */
  cor?: Cor
  acoes?: ReactNode
}

/** Card em relevo: chip de ícone, título, subtítulo e ações no canto. */
export function Card({ titulo, subtitulo, icone, cor, acoes, className, children, ...props }: Props) {
  return (
    <section className={cn(relevo, 'flex flex-col gap-4 rounded-card p-5', className)} {...props}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-start gap-3">
          {icone && (
            <IconChip cor={cor} tamanho="sm">
              {icone}
            </IconChip>
          )}
          <div className="min-w-[8rem] flex-1">
            <h3 className="text-lg leading-tight font-semibold">{titulo}</h3>
            {subtitulo && <p className="mt-0.5 text-sm text-tinta-suave">{subtitulo}</p>}
          </div>
          {acoes && <div className="ml-auto flex items-center gap-2">{acoes}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
