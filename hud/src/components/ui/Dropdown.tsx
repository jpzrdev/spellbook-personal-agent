import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button, type ButtonVariant } from './Button'
import { focusRing, raised } from './styles'

export type MenuItem = {
  id: string
  label: ReactNode
  icon?: ReactNode
  danger?: boolean
  onSelect: () => void
}

type Props = {
  label: ReactNode
  items: MenuItem[]
  variant?: ButtonVariant
  align?: 'left' | 'right'
}

/** A raised dropdown menu. Closes with Esc, a click outside or when an item is chosen. */
export function Dropdown({ label, items, variant = 'secondary', align = 'left' }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    itemRefs.current[0]?.focus()
    function outside(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      root.current?.querySelector<HTMLButtonElement>('button')?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const current = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    itemRefs.current[(current + step + items.length) % items.length]?.focus()
  }

  return (
    <div ref={root} className="relative inline-block" onKeyDown={onKeyDown}>
      <Button
        variant={variant}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((a) => !a)}
      >
        {label}
        <ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={cn(
            raised,
            'absolute z-30 mt-3 flex min-w-52 flex-col gap-1 rounded-control p-2 shadow-raised-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onSelect()
                setOpen(false)
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold',
                'transition-shadow duration-150 hover:shadow-sunken-sm focus:shadow-sunken-sm',
                item.danger ? 'text-danger' : 'text-ink',
                focusRing,
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
