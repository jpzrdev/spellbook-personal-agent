import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/** Grade bento: 1 coluna no celular, 2 no tablet, 4 no desktop. */
export function BentoGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animar-cascata grid auto-rows-[minmax(8rem,auto)] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6', className)}
      {...props}
    />
  )
}

type Span = 1 | 2 | 3 | 4

// Spans só valem a partir do tablet; no celular tudo ocupa a linha inteira.
const cols: Record<Span, string> = {
  1: '',
  2: 'sm:col-span-2',
  3: 'sm:col-span-2 lg:col-span-3',
  4: 'sm:col-span-2 lg:col-span-4',
}
const rows: Record<Span, string> = {
  1: '',
  2: 'sm:row-span-2',
  3: 'sm:row-span-3',
  4: 'sm:row-span-4',
}

type ItemProps = HTMLAttributes<HTMLDivElement> & { col?: Span; row?: Span }

/** Bloco da grade bento. O conteúdo normalmente é um <Card className="h-full">. */
export function BentoItem({ col = 1, row = 1, className, ...props }: ItemProps) {
  return <div className={cn('min-w-0', cols[col], rows[row], className)} {...props} />
}
