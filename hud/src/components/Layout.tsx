import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { cn } from '../lib/cn'
import { BridgeStatus } from './BridgeStatus'
import { ErrorBoundary } from './ErrorBoundary'
import { GandalfDialog } from './GandalfDialog'
import { Logo } from './Logo'
import { BottomNav, TopNav } from './Navigation'
import { SystemEvents } from './SystemEvents'
import { ThemeSelector } from './ThemeSelector'
import { focusRing } from './ui/styles'

export function Layout() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-dvh">
      <SystemEvents />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-6 pb-2 sm:px-6">
        <NavLink to="/" aria-label="Gandalf: home" className={cn('logo-wizard flex shrink-0 items-center gap-3 rounded-pill', focusRing)}>
          <Logo />
          <span className="hidden font-display text-2xl font-semibold tracking-tight whitespace-nowrap sm:inline">Gandalf</span>
        </NavLink>
        <div className="flex items-center gap-2 sm:gap-3">
          <BridgeStatus />
          <TopNav />
          <ThemeSelector />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-8 pb-32 sm:px-6 lg:pb-12">
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<p className="text-ink-muted">loading…</p>}>
            {/* key: every screen change restarts the enter animation */}
            <div key={pathname} className="anim-enter">
              <Outlet />
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <GandalfDialog />
      <BottomNav />
    </div>
  )
}
