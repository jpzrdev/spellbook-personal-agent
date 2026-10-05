import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button, type ButtonVariante } from './Button'
import { foco, relevo } from './styles'

export type MenuItem = {
  id: string
  label: ReactNode
  icone?: ReactNode
  perigo?: boolean
  onSelect: () => void
}

type Props = {
  rotulo: ReactNode
  itens: MenuItem[]
  variante?: ButtonVariante
  alinhar?: 'esquerda' | 'direita'
}

/** Menu suspenso em relevo. Fecha com Esc, clique fora ou ao escolher um item. */
export function Dropdown({ rotulo, itens, variante = 'secundario', alinhar = 'esquerda' }: Props) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const itensRef = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  useEffect(() => {
    if (!aberto) return
    itensRef.current[0]?.focus()
    function fora(e: MouseEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      setAberto(false)
      raiz.current?.querySelector<HTMLButtonElement>('button')?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const atual = itensRef.current.indexOf(document.activeElement as HTMLButtonElement)
    const passo = e.key === 'ArrowDown' ? 1 : -1
    itensRef.current[(atual + passo + itens.length) % itens.length]?.focus()
  }

  return (
    <div ref={raiz} className="relative inline-block" onKeyDown={onKeyDown}>
      <Button
        variante={variante}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? menuId : undefined}
        onClick={() => setAberto((a) => !a)}
      >
        {rotulo}
        <ChevronDown aria-hidden className={cn('size-4 transition-transform', aberto && 'rotate-180')} />
      </Button>
      {aberto && (
        <div
          id={menuId}
          role="menu"
          className={cn(
            relevo,
            'absolute z-30 mt-3 flex min-w-52 flex-col gap-1 rounded-controle p-2 shadow-relevo-lg',
            alinhar === 'direita' ? 'right-0' : 'left-0',
          )}
        >
          {itens.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                itensRef.current[i] = el
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onSelect()
                setAberto(false)
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold',
                'transition-shadow duration-150 hover:shadow-cavado-sm focus:shadow-cavado-sm',
                item.perigo ? 'text-erro' : 'text-tinta',
                foco,
              )}
            >
              {item.icone}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
