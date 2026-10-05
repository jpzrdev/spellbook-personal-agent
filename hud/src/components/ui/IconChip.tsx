import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { texto, type Cor } from './styles'

type Props = {
  children: ReactNode
  cor?: Cor
  tamanho?: 'sm' | 'md' | 'lg'
  /** Cavado em vez de relevo (ex.: item selecionado). */
  cavado?: boolean
  className?: string
}

const tamanhos = { sm: 'size-8 [&>svg]:size-4', md: 'size-11 [&>svg]:size-5', lg: 'size-14 [&>svg]:size-6' }

/** Ícone dentro de um círculo em relevo, como nos cards da referência. Decorativo. */
export function IconChip({ children, cor, tamanho = 'md', cavado, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-pilula bg-pergaminho',
        cavado ? 'shadow-cavado-sm' : 'shadow-relevo-sm',
        cor ? texto[cor] : 'text-tinta-suave',
        tamanhos[tamanho],
        className,
      )}
    >
      {children}
    </span>
  )
}
