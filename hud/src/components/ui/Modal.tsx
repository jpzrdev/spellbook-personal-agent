import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { IconChip } from './IconChip'
import { foco, relevo, type Cor } from './styles'

type Props = {
  aberto: boolean
  onClose: () => void
  titulo: ReactNode
  icone?: ReactNode
  cor?: Cor
  children: ReactNode
  rodape?: ReactNode
}

/** Painel em relevo sobre véu azul-noite translúcido (sem desfoque). Esc/fundo fecham; prende o foco. */
export function Modal({ aberto, onClose, titulo, icone, cor = 'musgo', children, rodape }: Props) {
  const painel = useRef<HTMLDivElement>(null)
  const tituloId = useId()

  useEffect(() => {
    if (!aberto) return
    const anterior = document.activeElement as HTMLElement | null
    const focaveis = () =>
      Array.from(
        painel.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('disabled'))

    const lista = focaveis()
    const campo = lista.find((el) => el.matches('input, select, textarea'))
    ;(campo ?? lista[0])?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      const lista = focaveis()
      if (!lista.length) return
      const [primeiro, ultimo] = [lista[0], lista[lista.length - 1]]
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      anterior?.focus()
    }
  }, [aberto, onClose])

  if (!aberto) return null

  return createPortal(
    <div className="animar-veu fixed inset-0 z-40 grid place-items-center bg-[#10131a]/40 p-4" onMouseDown={onClose}>
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(relevo, 'animar-surgir w-full max-w-lg rounded-card p-6 shadow-relevo-lg')}
      >
        <header className="mb-5 flex items-center gap-3">
          {icone && (
            <IconChip cor={cor} tamanho="sm">
              {icone}
            </IconChip>
          )}
          <h2 id={tituloId} className="flex-1 text-xl font-semibold">
            {titulo}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className={cn(
              'grid size-9 cursor-pointer place-items-center rounded-pilula shadow-relevo-sm active:shadow-cavado-sm',
              foco,
            )}
          >
            <X className="size-4" strokeWidth={2.5} />
          </button>
        </header>
        {children}
        {rodape && <footer className="mt-6 flex justify-end gap-3">{rodape}</footer>}
      </div>
    </div>,
    document.body,
  )
}
