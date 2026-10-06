import { createContext, useContext, type ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'info'
export type ShowToast = (kind: ToastKind, text: ReactNode) => void

export const ToastContext = createContext<ShowToast | null>(null)

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
