import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { IconChip } from './IconChip'
import { focusRing, raised, type Color } from './styles'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  icon?: ReactNode
  color?: Color
  children: ReactNode
  footer?: ReactNode
}

/** A raised panel over a translucent midnight-blue veil (no blur). Esc/backdrop close it; traps focus. */
export function Modal({ open, onClose, title, icon, color = 'primary', children, footer }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('disabled'))

    const items = focusable()
    const field = items.find((el) => el.matches('input, select, textarea'))
    ;(field ?? items[0])?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const [first, last] = [items[0], items[items.length - 1]]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="anim-veil fixed inset-0 z-40 grid place-items-center bg-[#10131a]/40 p-4" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(raised, 'anim-pop w-full max-w-lg rounded-card p-6 shadow-raised-lg')}
      >
        <header className="mb-5 flex items-center gap-3">
          {icon && (
            <IconChip color={color} size="sm">
              {icon}
            </IconChip>
          )}
          <h2 id={titleId} className="flex-1 text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(
              'grid size-9 cursor-pointer place-items-center rounded-pill shadow-raised-sm active:shadow-sunken-sm',
              focusRing,
            )}
          >
            <X className="size-4" strokeWidth={2.5} />
          </button>
        </header>
        {children}
        {footer && <footer className="mt-6 flex justify-end gap-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
