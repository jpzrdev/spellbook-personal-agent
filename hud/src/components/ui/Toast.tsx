import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconChip } from './IconChip'
import { focusRing, raised, type Color } from './styles'
import { ToastContext, type ShowToast, type ToastKind } from './useToast'

type ToastMessage = { id: number; kind: ToastKind; text: ReactNode }

const look: Record<ToastKind, { color: Color; Icon: typeof Info }> = {
  success: { color: 'primary', Icon: CircleCheck },
  error: { color: 'ember', Icon: CircleAlert },
  info: { color: 'silver', Icon: Info },
}

/** What a toast looks like; exported separately for the /ui catalog. */
export function ToastView({ kind, children, onClose }: { kind: ToastKind; children: ReactNode; onClose?: () => void }) {
  const { color, Icon } = look[kind]
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(raised, 'anim-toast flex w-80 max-w-full items-center gap-3 rounded-control p-3 shadow-raised-lg')}
    >
      <IconChip color={color} size="sm">
        <Icon strokeWidth={2.5} />
      </IconChip>
      <div className="flex-1 text-sm font-semibold">{children}</div>
      {onClose && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className={cn('cursor-pointer rounded-pill p-1.5 text-ink-muted hover:shadow-sunken-sm', focusRing)}
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

export function ToastProvider({ children, durationMs = 4000 }: { children: ReactNode; durationMs?: number }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nextId = useRef(0)

  const close = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const show = useCallback<ShowToast>(
    (kind, text) => {
      const id = ++nextId.current
      setToasts((t) => [...t, { id, kind, text }])
      window.setTimeout(() => close(id), durationMs)
    },
    [durationMs, close],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex flex-col gap-4 [&>*]:pointer-events-auto">
        {toasts.map((t) => (
          <ToastView key={t.id} kind={t.kind} onClose={() => close(t.id)}>
            {t.text}
          </ToastView>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
