import { createContext, useContext, type ReactNode } from 'react'

export type ToastTipo = 'sucesso' | 'erro' | 'info'
export type MostrarToast = (tipo: ToastTipo, texto: ReactNode) => void

export const ToastContext = createContext<MostrarToast | null>(null)

export function useToast(): MostrarToast {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}
