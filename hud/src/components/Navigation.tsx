import { BookMarked, CalendarDays, GraduationCap, Library, LayoutGrid, Receipt, MessageCircle, MoreHorizontal, Palette, Repeat, Sparkles, TerminalSquare } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '../lib/cn'
import { PILL, useIndicator } from './ui/indicator'
import { focusRing, raised, sunken } from './ui/styles'

type NavItem = { to: string; label: string; icon: ReactNode }

const LINKS: NavItem[] = [
  { to: '/', label: 'Today', icon: <CalendarDays /> },
  { to: '/chat', label: 'Chat', icon: <MessageCircle /> },
  { to: '/terminals', label: 'Terminals', icon: <TerminalSquare /> },
  { to: '/skills', label: 'Skills', icon: <Sparkles /> },
  { to: '/routines', label: 'Routines', icon: <Repeat /> },
  { to: '/studies', label: 'Studies', icon: <GraduationCap /> },
  { to: '/library', label: 'Library', icon: <BookMarked /> },
  { to: '/vault', label: 'Vault', icon: <Library /> },
  { to: '/receipts', label: 'Receipts', icon: <Receipt /> },
  { to: '/ui', label: 'UI', icon: <Palette /> },
]

const MAIN = LINKS.slice(0, 3)
const isActive = (to: string, pathname: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))
const MORE = LINKS.slice(3)

/** The top menu (from the tablet up). */
// The /ui catalog only lives in the "More" menu (it's a reference page, not an everyday one).
const TOP = LINKS.filter((l) => l.to !== '/ui')

export function TopNav() {
  const { pathname } = useLocation()
  const { container, items, style } = useIndicator<HTMLAnchorElement>(TOP.findIndex((l) => isActive(l.to, pathname)))
  return (
    <nav ref={container} aria-label="Main" className={cn(sunken, 'relative hidden gap-1 rounded-pill p-1.5 lg:flex')}>
      <span aria-hidden className={PILL} style={style} />
      {TOP.map((l, i) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          ref={(el) => {
            items.current[i] = el
          }}
          className={({ isActive }) =>
            cn(
              'relative rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors duration-200',
              focusRing,
              isActive ? 'text-primary-text' : 'text-ink-muted hover:text-ink',
            )
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  )
}

const bottomItem = (active: boolean) =>
  cn(
    'flex flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-control py-1.5 text-[0.7rem] font-semibold [&_svg]:size-5',
    focusRing,
    'transition-[box-shadow,color,transform] duration-200 active:scale-95',
    active ? 'text-primary-text shadow-sunken-sm [&_svg]:animate-[icon-active_400ms_ease-out]' : 'text-ink-muted',
  )

/** The bottom bar on the phone: Today, Chat, Terminals and "More". */
export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const root = useRef<HTMLDivElement>(null)
  const inMore = MORE.some((l) => isActive(l.to, pathname))

  useEffect(() => {
    if (!moreOpen) return
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false)
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', esc)
    }
  }, [moreOpen])

  return (
    <div ref={root} className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
      {moreOpen && (
        <div id="more-menu" className={cn(raised, 'anim-pop mb-3 ml-auto flex w-48 origin-bottom-right flex-col gap-1 rounded-control p-2 shadow-raised-lg')}>
          {MORE.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold [&_svg]:size-4', focusRing, isActive ? 'text-primary-text shadow-sunken-sm' : 'text-ink')
              }
            >
              {l.icon}
              {l.label}
            </NavLink>
          ))}
        </div>
      )}
      <nav aria-label="Main" className={cn(raised, 'flex gap-1 rounded-card p-1.5 shadow-raised-lg')}>
        {MAIN.map((l) => (
          <NavLink key={l.to} to={l.to} end className={({ isActive }) => bottomItem(isActive)}>
            {l.icon}
            {l.label}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          onClick={() => setMoreOpen((a) => !a)}
          className={bottomItem(inMore || moreOpen)}
        >
          {inMore ? <LayoutGrid /> : <MoreHorizontal />}
          More
        </button>
      </nav>
    </div>
  )
}
