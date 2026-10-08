import { Settings } from 'lucide-react'
import { Suspense } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { cn } from '../lib/cn'
import { useAgent, useSetup } from '../lib/queries'
import { BridgeStatus } from './BridgeStatus'
import { ErrorBoundary } from './ErrorBoundary'
import { GandalfDialog } from './GandalfDialog'
import { Logo } from './Logo'
import { BottomNav, TopNav } from './Navigation'
import { SystemEvents } from './SystemEvents'
import { ThemeSelector } from './ThemeSelector'
import { Button } from './ui'
import { focusRing } from './ui/styles'

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const agent = useAgent()
  const { data: setup, isPending } = useSetup()
  // First run: the setup comes before everything. (Without the Bridge, the screens show it themselves.)
  if (isPending) return null
  if (setup && !setup.done) return <Navigate to="/setup" replace />
  return (
    <div className="min-h-dvh">
      <SystemEvents />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-6 pb-2 sm:px-6">
        <NavLink to="/" aria-label={`${agent.name}: home`} className={cn('logo-wizard flex shrink-0 items-center gap-3 rounded-pill', focusRing)}>
          <Logo gender={agent.gender} avatar={agent.avatar} />
          <span className="hidden font-display text-2xl font-semibold tracking-tight whitespace-nowrap sm:inline">{agent.name}</span>
        </NavLink>
        <div className="flex items-center gap-2 sm:gap-3">
          <BridgeStatus />
          <TopNav />
          <ThemeSelector />
          <Button variant="icon" size="sm" aria-label="Settings: your assistant and you" title="Settings" onClick={() => navigate('/setup')}>
            <Settings className="size-4" aria-hidden />
          </Button>
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
