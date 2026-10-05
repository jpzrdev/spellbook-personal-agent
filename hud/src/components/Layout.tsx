import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { cn } from '../lib/cn'
import { ErroTela } from './ErroTela'
import { EventosGerais } from './EventosGerais'
import { GandalfDialog } from './GandalfDialog'
import { Logo } from './Logo'
import { SeletorTema } from './SeletorTema'
import { StatusBridge } from './StatusBridge'
import { NavInferior, NavTopo } from './Navegacao'
import { foco } from './ui/styles'

export function Layout() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-dvh">
      <EventosGerais />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-6 pb-2 sm:px-6">
        <NavLink to="/" aria-label="Gandalf: início" className={cn('logo-mago flex shrink-0 items-center gap-3 rounded-pilula', foco)}>
          <Logo />
          <span className="hidden font-titulo text-2xl font-semibold tracking-tight whitespace-nowrap sm:inline">Gandalf</span>
        </NavLink>
        <div className="flex items-center gap-2 sm:gap-3">
          <StatusBridge />
          <NavTopo />
          <SeletorTema />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-8 pb-32 sm:px-6 lg:pb-12">
        <ErroTela key={pathname}>
          <Suspense fallback={<p className="text-tinta-suave">carregando…</p>}>
            {/* key: cada troca de tela reinicia a animação de entrada */}
            <div key={pathname} className="animar-entrada">
              <Outlet />
            </div>
          </Suspense>
        </ErroTela>
      </main>
      <GandalfDialog />
      <NavInferior />
    </div>
  )
}
