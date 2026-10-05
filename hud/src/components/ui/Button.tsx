import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { focusRing, interactive } from './styles'

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'icon'
export type ButtonSize = 'sm' | 'md' | 'lg'

// No fill: every button is a relief on the surface; the variant only changes the text color.
const variants: Record<ButtonVariant, string> = {
  primary: cn(interactive, 'bg-surface font-bold text-primary-text'),
  secondary: cn(interactive, 'bg-surface font-semibold text-ink'),
  accent: cn(interactive, 'bg-surface font-bold text-wood-text'),
  ghost: cn(
    'bg-transparent font-semibold text-ink-muted transition-[box-shadow,color] duration-150 hover:text-ink hover:shadow-raised-sm active:shadow-sunken-sm',
    'disabled:pointer-events-none disabled:opacity-45',
    focusRing,
  ),
  icon: cn(interactive, 'bg-surface font-semibold text-ink'),
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[0.95rem]',
  lg: 'h-14 px-7 text-lg',
}

const iconSizes: Record<ButtonSize, string> = {
  sm: 'size-9',
  md: 'size-11',
  lg: 'size-14',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

/** Neumorphic button. The `icon` variant is round and requires an `aria-label`. */
export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap',
        variants[variant],
        variant === 'icon' ? cn('rounded-pill', iconSizes[size]) : cn('rounded-control', sizes[size]),
        className,
      )}
      {...props}
    />
  )
}
