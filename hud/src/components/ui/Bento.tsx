import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/** Bento grid: 1 column on the phone, 2 on the tablet, 4 on the desktop. */
export function BentoGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('anim-stagger grid auto-rows-[minmax(8rem,auto)] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6', className)}
      {...props}
    />
  )
}

type Span = 1 | 2 | 3 | 4

// Spans only apply from the tablet up; on the phone everything takes the full row.
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

/** A bento grid block. Its content is usually a <Card className="h-full">. */
export function BentoItem({ col = 1, row = 1, className, ...props }: ItemProps) {
  return <div className={cn('min-w-0', cols[col], rows[row], className)} {...props} />
}
