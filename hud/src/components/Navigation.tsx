import { Blocks, BookMarked, CalendarDays, ChevronDown, GraduationCap, Library, MessageCircle, MessagesSquare, Palette, Receipt, Repeat, Search, Settings2, Sparkles, SlidersHorizontal, TerminalSquare, WandSparkles } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '../lib/cn'
import { useAgent, useModules, useSpaces } from '../lib/queries'
import { SpaceIcon } from './spaces/icons'
import { PILL, useIndicator } from './ui/indicator'
import { focusRing, raised, sunken } from './ui/styles'

type NavItem = { to: string; label: string; icon: ReactNode; hint?: string }

/** The everyday screens: always on the menu. */
const MAIN: NavItem[] = [
  { to: '/', label: 'Today', icon: <CalendarDays /> },
  { to: '/chat', label: 'Chat', icon: <MessageCircle /> },
]

/** The screens that are modules (the page modules link to /p/<id>). */
const SCREEN_ICONS: Record<string, ReactNode> = { studies: <GraduationCap />, library: <BookMarked /> }

/** The assistant's own machinery, grouped under its name (opened now and then, not every day). */
const AGENT: NavItem[] = [
  { to: '/conversations', label: 'Conversations', icon: <MessagesSquare />, hint: 'Past chats, to pick up again' },
  { to: '/terminals', label: 'Terminals', icon: <TerminalSquare />, hint: 'Claude Code sessions' },
  { to: '/skills', label: 'Skills', icon: <Sparkles />, hint: 'What it knows how to do' },
  { to: '/routines', label: 'Routines', icon: <Repeat />, hint: 'What it runs on a schedule' },
  { to: '/memory', label: 'Memory', icon: <Library />, hint: 'What it remembers' },
  { to: '/receipts', label: 'Receipts', icon: <Receipt />, hint: 'What it did and what it cost' },
]

/** At the bottom of the agent menu: settings and the UI reference. */
const AGENT_FOOTER: NavItem[] = [
  { to: '/setup', label: 'Personalize', icon: <SlidersHorizontal />, hint: 'Name, look and what it knows about you' },
  { to: '/ui', label: 'UI catalog', icon: <Palette /> },
]

const SEARCH_FROM = 8 // modules on the menu before it gets a search field

const isActive = (to: string, pathname: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))
const inAgent = (pathname: string) => [...AGENT, ...AGENT_FOOTER].some((l) => isActive(l.to, pathname))

/** The modules that are on, in the catalog's order. Until the list loads, the screens that are on by default. */
function useModuleLinks(): NavItem[] {
  const { data: modules } = useModules()
  const { data: spaces = [] } = useSpaces()
  if (!modules)
    return [
      { to: '/studies', label: 'Studies', icon: SCREEN_ICONS.studies },
      { to: '/library', label: 'Library', icon: SCREEN_ICONS.library },
    ]
  const pages = new Map(spaces.map((s) => [s.slug, s])) // a page renamed in its settings keeps the new name
  return modules
    .filter((m) => m.active)
    .map((m) => ({
      to: m.route,
      label: pages.get(m.id)?.name ?? m.name,
      icon: SCREEN_ICONS[m.id] ?? <SpaceIcon name={pages.get(m.id)?.icon ?? m.icon} />,
    }))
}

type Menu = 'modules' | 'agent'

/** Which menu is open (one at a time): closes with Esc, a click outside or a route change; arrows move between links. */
function useMenus() {
  const [open, setOpen] = useState<Menu | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  useEffect(() => setOpen(null), [pathname])

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'Escape') {
      root.current?.querySelector<HTMLButtonElement>(`button[data-opens="${open}"]`)?.focus()
      setOpen(null)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const links = [...(root.current?.querySelectorAll<HTMLElement>('[data-menu] a, [data-menu] input') ?? [])]
    const current = links.indexOf(document.activeElement as HTMLElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    links[(current + step + links.length) % links.length]?.focus()
  }

  const toggle = (menu: Menu) => setOpen((o) => (o === menu ? null : menu))
  return { open, toggle, root, onKeyDown }
}

function MenuLink({ item }: { item: NavItem }) {
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
        <span className="truncate text-sm font-semibold">{item.label}</span>
        {item.hint && <span className="truncate text-xs text-ink-muted">{item.hint}</span>}
      </span>
    </NavLink>
  )
}

const divider = <hr className="mx-3 my-1 border-0 border-t border-t-shade shadow-[0_1px_0_var(--color-highlight)]" />

/** The modules that are on (two columns and a search when there are many), and the way to manage them. */
function ModulesPanel({ id, links, className }: { id: string; links: NavItem[]; className?: string }) {
  const [query, setQuery] = useState('')
  const many = links.length >= SEARCH_FROM
  const shown = links.filter((l) => l.label.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <div id={id} data-menu className={cn(raised, 'anim-pop z-40 flex flex-col gap-1 overflow-x-hidden rounded-control p-2 shadow-raised-lg', many ? 'w-[32rem]' : 'w-56', className)}>
      <p className="px-3 pt-1 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">Modules</p>
      {many && (
        <label className={cn(sunken, 'mx-1 mb-1 flex h-9 items-center gap-2 rounded-pill px-3')}>
          <Search className="size-4 text-ink-muted" aria-hidden />
          <span className="sr-only">Find a module</span>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a module…" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted/70" />
        </label>
      )}
      {links.length === 0 ? (
        <p className="px-3 py-2 text-sm text-ink-muted">No modules on.</p>
      ) : shown.length === 0 ? (
        <p className="px-3 py-2 text-sm text-ink-muted">No module called “{query}”.</p>
      ) : (
        <div className={cn('grid gap-1', many && 'sm:grid-cols-2')}>
          {shown.map((l) => (
            <MenuLink key={l.to} item={l} />
          ))}
        </div>
      )}
      {divider}
      <MenuLink item={{ to: '/modules', label: 'Manage', icon: <Settings2 /> }} />
    </div>
  )
}

/** The panel with the agent's screens (shared by the top menu and the phone's bottom bar). */
function AgentMenuPanel({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <div id={id} data-menu className={cn(raised, 'anim-pop z-40 flex w-72 flex-col gap-1 rounded-control p-2 shadow-raised-lg', className)}>
      <p className="px-3 pt-1 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{name}</p>
      {AGENT.map((l) => (
        <MenuLink key={l.to} item={l} />
      ))}
      {divider}
      {AGENT_FOOTER.map((l) => (
        <MenuLink key={l.to} item={l} />
      ))}
    </div>
  )
}

/** The top menu (from the tablet up): Today, Chat, the modules that are on, and a menu named after the assistant. */
export function TopNav() {
  const { pathname } = useLocation()
  const agent = useAgent()
  const menus = useMenus()
  const modulesId = useId()
  const agentId = useId()
  const links = useModuleLinks()
  const inModules = isActive('/modules', pathname) || links.some((l) => isActive(l.to, pathname))
  const agentActive = inAgent(pathname)
  // The pill sits on Today/Chat, on "Modules" (index 2) or on the assistant (index 3).
  const active = agentActive ? MAIN.length + 1 : inModules ? MAIN.length : MAIN.findIndex((l) => isActive(l.to, pathname))
  const { container, items, style } = useIndicator<HTMLElement>(active)
  const item = (on: boolean) =>
    cn(
      'relative rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors duration-200',
      focusRing,
      on ? 'text-primary-text' : 'text-ink-muted hover:text-ink',
    )
  const opener = (menu: Menu, index: number, id: string, on: boolean, children: ReactNode) => (
    <button
      type="button"
      data-opens={menu}
      ref={(el) => {
        items.current[index] = el
      }}
      aria-expanded={menus.open === menu}
      aria-controls={menus.open === menu ? id : undefined}
      onClick={() => menus.toggle(menu)}
      className={cn(item(on || menus.open === menu), 'flex cursor-pointer items-center gap-1.5')}
    >
      {children}
      <ChevronDown aria-hidden className={cn('size-4 transition-transform', menus.open === menu && 'rotate-180')} />
    </button>
  )

  return (
    <div ref={menus.root} className="relative hidden lg:block" onKeyDown={menus.onKeyDown}>
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
        {opener('modules', MAIN.length, modulesId, inModules, 'Modules')}
        {opener(
          'agent',
          MAIN.length + 1,
          agentId,
          agentActive,
          <>
            <WandSparkles aria-hidden className="size-4" />
            <span className="max-w-32 truncate">{agent.name}</span>
          </>,
        )}
      </nav>
      {menus.open === 'modules' && <ModulesPanel id={modulesId} links={links} className="absolute top-full right-0 mt-3 max-h-[calc(100dvh-7rem)] origin-top-right overflow-y-auto" />}
      {menus.open === 'agent' && <AgentMenuPanel id={agentId} name={agent.name} className="absolute top-full right-0 mt-3 origin-top-right" />}
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

/** The bottom bar on the phone: always four buttons (Today, Chat, Modules and the assistant's menu). */
export function BottomNav() {
  const { pathname } = useLocation()
  const agent = useAgent()
  const menus = useMenus()
  const modulesId = useId()
  const agentId = useId()
  const links = useModuleLinks()
  const panel = 'mb-3 max-h-[calc(100dvh-7rem)] max-w-full overflow-y-auto'

  return (
    <div ref={menus.root} className="fixed inset-x-3 bottom-3 z-40 lg:hidden" onKeyDown={menus.onKeyDown}>
      {menus.open === 'modules' && <ModulesPanel id={modulesId} links={links} className={cn(panel, 'mx-auto origin-bottom')} />}
      {menus.open === 'agent' && <AgentMenuPanel id={agentId} name={agent.name} className={cn(panel, 'ml-auto origin-bottom-right')} />}
      <nav aria-label="Main" className={cn(raised, 'flex gap-1 rounded-card p-1.5 shadow-raised-lg')}>
        {MAIN.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => bottomItem(isActive)}>
            {l.icon}
            {l.label}
          </NavLink>
        ))}
        <button
          type="button"
          data-opens="modules"
          aria-expanded={menus.open === 'modules'}
          aria-controls={menus.open === 'modules' ? modulesId : undefined}
          onClick={() => menus.toggle('modules')}
          className={bottomItem(isActive('/modules', pathname) || links.some((l) => isActive(l.to, pathname)) || menus.open === 'modules')}
        >
          <Blocks />
          Modules
        </button>
        <button
          type="button"
          data-opens="agent"
          aria-expanded={menus.open === 'agent'}
          aria-controls={menus.open === 'agent' ? agentId : undefined}
          onClick={() => menus.toggle('agent')}
          className={bottomItem(inAgent(pathname) || menus.open === 'agent')}
        >
          <WandSparkles />
          <span className="max-w-full truncate px-1">{agent.name}</span>
        </button>
      </nav>
    </div>
  )
}
