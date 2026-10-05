import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { foco, interativo } from './styles'

export type ButtonVariante = 'primario' | 'secundario' | 'acento' | 'fantasma' | 'icone'
export type ButtonTamanho = 'sm' | 'md' | 'lg'

// Sem preenchimento: todos os botões são relevo no pergaminho; a variante muda só a cor do texto.
const variantes: Record<ButtonVariante, string> = {
  primario: cn(interativo, 'bg-pergaminho font-bold text-musgo-texto'),
  secundario: cn(interativo, 'bg-pergaminho font-semibold text-tinta'),
  acento: cn(interativo, 'bg-pergaminho font-bold text-madeira-texto'),
  fantasma: cn(
    'bg-transparent font-semibold text-tinta-suave transition-[box-shadow,color] duration-150 hover:text-tinta hover:shadow-relevo-sm active:shadow-cavado-sm',
    'disabled:pointer-events-none disabled:opacity-45',
    foco,
  ),
  icone: cn(interativo, 'bg-pergaminho font-semibold text-tinta'),
}

const tamanhos: Record<ButtonTamanho, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[0.95rem]',
  lg: 'h-14 px-7 text-lg',
}

const tamanhosIcone: Record<ButtonTamanho, string> = {
  sm: 'size-9',
  md: 'size-11',
  lg: 'size-14',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: ButtonVariante
  tamanho?: ButtonTamanho
}

/** Botão neumórfico. A variante `icone` é redonda e exige `aria-label`. */
export function Button({ variante = 'primario', tamanho = 'md', className, type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap',
        variantes[variante],
        variante === 'icone' ? cn('rounded-pilula', tamanhosIcone[tamanho]) : cn('rounded-controle', tamanhos[tamanho]),
        className,
      )}
      {...props}
    />
  )
}
