import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconChip } from './IconChip'
import { cavado, type Cor } from './styles'

type Props = {
  icone: ReactNode
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
  cor?: Cor
  className?: string
}

/** Área cavada com chip de ícone em relevo. */
export function EmptyState({ icone, titulo, descricao, acao, cor = 'musgo', className }: Props) {
  return (
    <div className={cn(cavado, 'flex flex-col items-center gap-3 rounded-card px-6 py-10 text-center', className)}>
      <IconChip cor={cor} tamanho="lg">
        {icone}
      </IconChip>
      <h3 className="mt-1 text-xl font-semibold">{titulo}</h3>
      {descricao && <p className="max-w-sm text-tinta-suave">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}
