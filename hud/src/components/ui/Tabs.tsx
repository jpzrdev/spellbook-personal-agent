import { type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { PILULA, useIndicador } from './indicador'
import { cavado, foco } from './styles'

export type TabItem = { id: string; label: ReactNode }

type Props = {
  itens: TabItem[]
  valor: string
  onChange: (id: string) => void
  rotulo: string
  className?: string
}

/** Controle segmentado: trilha cavada e uma pílula em relevo que desliza até a aba ativa. Navegável com as setas. */
export function Tabs({ itens, valor, onChange, rotulo, className }: Props) {
  const { container, itens: refs, estilo } = useIndicador<HTMLButtonElement>(itens.findIndex((i) => i.id === valor))

  function onKeyDown(e: KeyboardEvent, indice: number) {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const proximo = (indice + passo + itens.length) % itens.length
    onChange(itens[proximo].id)
    refs.current[proximo]?.focus()
  }

  return (
    <div
      ref={container}
      role="tablist"
      aria-label={rotulo}
      className={cn(cavado, 'relative inline-flex flex-wrap gap-1 rounded-pilula p-1.5', className)}
    >
      <span aria-hidden className={PILULA} style={estilo} />
      {itens.map((item, i) => {
        const ativo = item.id === valor
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={ativo}
            tabIndex={ativo ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative cursor-pointer rounded-pilula px-4 py-1.5 text-sm font-semibold transition-colors duration-200',
              foco,
              ativo ? 'text-musgo-texto' : 'text-tinta-suave hover:text-tinta',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
