import { BookMarked, CalendarDays, ChevronDown, GraduationCap, Library, MessageCircle, Palette, Receipt, Repeat, Sparkles, SlidersHorizontal, TerminalSquare, WandSparkles } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '../lib/cn'
import { useAgent } from '../lib/queries'
import { PILL, useIndicator } from './ui/indicator'
import { focusRing, raised, sunken } from './ui/styles'

type NavItem = { to: string; label: string; icon: ReactNode; hint?: string }

/** The everyday screens: always on the menu. */
const MAIN: NavItem[] = [
  { to: '/', label: 'Today', icon: <CalendarDays /> },
  { to: '/chat', label: 'Chat', icon: <MessageCircle /> },
  { to: '/studies', label: 'Studies', icon: <GraduationCap /> },
  { to: '/library', label: 'Library', icon: <BookMarked /> },
]

/** The assistant's own machinery, grouped under its name (opened now and then, not every day). */
const AGENT: NavItem[] = [
  { to: '/terminals', label: 'Terminals', icon: <TerminalSquare />, hint: 'Claude Code sessions' },
  { to: '/skills', label: 'Skills', icon: <Sparkles />, hint: 'What it knows how to do' },
  { to: '/routines', label: 'Routines', icon: <Repeat />, hint: 'What it runs on a schedule' },
  { to: '/memory', label: 'Memory', icon: <Library />, hint: 'What it remembers' },
  { to: '/receipts', label: 'Receipts', icon: <Receipt />, hint: 'What it did and what it cost' },
]

/** At the bottom of the agent menu: personalization and the UI reference. */
const AGENT_FOOTER: NavItem[] = [
  { to: '/setup', label: 'Personalize', icon: <SlidersHorizontal />, hint: 'Name, look and what it knows about you' },
  { to: '/ui', label: 'UI catalog', icon: <Palette /> },
]

const isActive = (to: string, pathname: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))
const inAgent = (pathname: string) => [...AGENT, ...AGENT_FOOTER].some((l) => isActive(l.to, pathname))

/** Open/close state of the agent menu: closes with Esc, a click outside or a route change. */
function useAgentMenu() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'Escape') {
      setOpen(false)
      root.current?.querySelector<HTMLButtonElement>('button[aria-expanded]')?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>('[data-agent-menu] a') ?? [])]
    const current = links.indexOf(document.activeElement as HTMLAnchorElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    links[(current + step + links.length) % links.length]?.focus()
  }

  return { open, setOpen, root, onKeyDown }
}

function AgentMenuLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2 [&_svg]:size-4 [&_svg]:shrink-0',
          'transition-shadow duration-150 hover:shadow-sunken-sm focus:shadow-sunken-sm',
          focusRing,
          isActive ? 'text-primary-text shadow-sunken-sm' : 'text-ink',
        )
      }
    >
      {item.icon}
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{item.label}</span>
        {item.hint && <span className="truncate text-xs text-ink-muted">{item.hint}</span>}
      </span>
    </NavLink>
  )
}

/** The panel with the agent's screens (shared by the top menu and the phone's bottom bar). */
function AgentMenuPanel({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <div id={id} data-agent-menu className={cn(raised, 'anim-pop z-40 flex w-72 flex-col gap-1 rounded-control p-2 shadow-raised-lg', className)}>
      <p className="px-3 pt-1 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{name}</p>
      {AGENT.map((l) => (
        <AgentMenuLink key={l.to} item={l} />
      ))}
      <hr className="mx-3 my-1 border-0 border-t border-t-shade shadow-[0_1px_0_var(--color-highlight)]" />
      {AGENT_FOOTER.map((l) => (
        <AgentMenuLink key={l.to} item={l} />
      ))}
    </div>
  )
}

/** The top menu (from the tablet up): the everyday screens and a menu named after the assistant. */
export function TopNav() {
  const { pathname } = useLocation()
  const agent = useAgent()
  const menu = useAgentMenu()
  const menuId = useId()
  const agentActive = inAgent(pathname)
  const active = agentActive ? MAIN.length : MAIN.findIndex((l) => isActive(l.to, pathname))
  const { container, items, style } = useIndicator<HTMLElement>(active)
  const item = (on: boolean) =>
    cn(
      'relative rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors duration-200',
      focusRing,
      on ? 'text-primary-text' : 'text-ink-muted hover:text-ink',
    )

  return (
    <div ref={menu.root} className="relative hidden lg:block" onKeyDown={menu.onKeyDown}>
      <nav ref={container} aria-label="Main" className={cn(sunken, 'relative flex gap-1 rounded-pill p-1.5')}>
        <span aria-hidden className={PILL} style={style} />
        {MAIN.map((l, i) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            ref={(el) => {
              items.current[i] = el
            }}
            className={({ isActive }) => item(isActive)}
          >
            {l.label}
          </NavLink>
        ))}
        <button
          type="button"
          ref={(el) => {
            items.current[MAIN.length] = el
          }}
          aria-expanded={menu.open}
          aria-controls={menu.open ? menuId : undefined}
          onClick={() => menu.setOpen((o) => !o)}
          className={cn(item(agentActive || menu.open), 'flex cursor-pointer items-center gap-1.5')}
        >
          <WandSparkles aria-hidden className="size-4" />
          <span className="max-w-32 truncate">{agent.name}</span>
          <ChevronDown aria-hidden className={cn('size-4 transition-transform', menu.open && 'rotate-180')} />
        </button>
      </nav>
      {menu.open && <AgentMenuPanel id={menuId} name={agent.name} className="absolute top-full right-0 mt-3 origin-top-right" />}
    </div>
  )
}

const bottomItem = (active: boolean) =>
  cn(
    'flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-control py-1.5 text-[0.7rem] font-semibold [&_svg]:size-5',
    focusRing,
    'transition-[box-shadow,color,transform] duration-200 active:scale-95',
    active ? 'text-primary-text shadow-sunken-sm [&_svg]:animate-[icon-active_400ms_ease-out]' : 'text-ink-muted',
  )

/** The bottom bar on the phone: the everyday screens and the assistant's menu. */
export function BottomNav() {
  const { pathname } = useLocation()
  const agent = useAgent()
  const menu = useAgentMenu()
  const menuId = useId()

  return (
    <div ref={menu.root} className="fixed inset-x-3 bottom-3 z-40 lg:hidden" onKeyDown={menu.onKeyDown}>
      {menu.open && <AgentMenuPanel id={menuId} name={agent.name} className="mb-3 ml-auto max-h-[calc(100dvh-7rem)] max-w-full origin-bottom-right overflow-y-auto" />}
      <nav aria-label="Main" className={cn(raised, 'flex gap-1 rounded-card p-1.5 shadow-raised-lg')}>
        {MAIN.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => bottomItem(isActive)}>
            {l.icon}
            {l.label}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={menu.open}
          aria-controls={menu.open ? menuId : undefined}
          onClick={() => menu.setOpen((o) => !o)}
          className={bottomItem(inAgent(pathname) || menu.open)}
        >
          <WandSparkles />
          <span className="max-w-full truncate px-1">{agent.name}</span>
        </button>
      </nav>
    </div>
  )
}
