import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconChip } from './IconChip'
import { foco, relevo, type Cor } from './styles'
import { ToastContext, type MostrarToast, type ToastTipo } from './useToast'

type ToastMsg = { id: number; tipo: ToastTipo; texto: ReactNode }

const estilo: Record<ToastTipo, { cor: Cor; Icone: typeof Info }> = {
  sucesso: { cor: 'musgo', Icone: CircleCheck },
  erro: { cor: 'terracota', Icone: CircleAlert },
  info: { cor: 'ardosia', Icone: Info },
}

/** Visual de um toast; exportado separado para o catálogo /ui. */
export function ToastView({ tipo, children, onClose }: { tipo: ToastTipo; children: ReactNode; onClose?: () => void }) {
  const { cor, Icone } = estilo[tipo]
  return (
    <div
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={cn(relevo, 'animar-toast flex w-80 max-w-full items-center gap-3 rounded-controle p-3 shadow-relevo-lg')}
    >
      <IconChip cor={cor} tamanho="sm">
        <Icone strokeWidth={2.5} />
      </IconChip>
      <div className="flex-1 text-sm font-semibold">{children}</div>
      {onClose && (
        <button
          type="button"
          aria-label="Fechar aviso"
          onClick={onClose}
          className={cn('cursor-pointer rounded-pilula p-1.5 text-tinta-suave hover:shadow-cavado-sm', foco)}
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

export function ToastProvider({ children, duracaoMs = 4000 }: { children: ReactNode; duracaoMs?: number }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const proximoId = useRef(0)

  const fechar = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const mostrar = useCallback<MostrarToast>(
    (tipo, texto) => {
      const id = ++proximoId.current
      setToasts((t) => [...t, { id, tipo, texto }])
      window.setTimeout(() => fechar(id), duracaoMs)
    },
    [duracaoMs, fechar],
  )

  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex flex-col gap-4 [&>*]:pointer-events-auto">
        {toasts.map((t) => (
          <ToastView key={t.id} tipo={t.tipo} onClose={() => fechar(t.id)}>
            {t.texto}
          </ToastView>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
