import { Check } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  rotulo: ReactNode
  /** Risca o rótulo quando marcado (útil para tarefas). */
  riscar?: boolean
}

/** Caixa cavada; marcada, enche de musgo. */
export function Checkbox({ rotulo, riscar, className, disabled, ...props }: Props) {
  return (
    <label className={cn('inline-flex items-center gap-3', disabled ? 'opacity-45' : 'cursor-pointer', className)}>
      <input type="checkbox" className="peer sr-only" disabled={disabled} {...props} />
      <span
        aria-hidden
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-lg bg-pergaminho shadow-cavado-sm transition-[background-color,box-shadow] duration-150',
          'peer-checked:bg-musgo peer-checked:text-sobre-musgo peer-checked:shadow-relevo-sm peer-checked:animate-[marcar_350ms_ease-out]',
          // faísca dourada ao marcar (o ::after reinicia a animação toda vez que o seletor passa a valer)
          'relative after:pointer-events-none after:absolute after:inset-[-6px] after:rounded-full after:opacity-0 peer-checked:after:animate-[faisca_600ms_ease-out]',
          '[&>svg]:invisible peer-checked:[&>svg]:visible',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-musgo',
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </span>
      <span className={cn('font-medium', riscar && 'peer-checked:text-tinta-suave peer-checked:line-through')}>
        {rotulo}
      </span>
    </label>
  )
}
