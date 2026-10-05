import { BookMarked, CalendarDays, GraduationCap, Library, LayoutGrid, Receipt, MessageCircle, MoreHorizontal, Palette, Repeat, Sparkles, TerminalSquare } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '../lib/cn'
import { PILULA, useIndicador } from './ui/indicador'
import { cavado, foco, relevo } from './ui/styles'

type Link = { to: string; label: string; icone: ReactNode }

const LINKS: Link[] = [
  { to: '/', label: 'Hoje', icone: <CalendarDays /> },
  { to: '/chat', label: 'Chat', icone: <MessageCircle /> },
  { to: '/terminais', label: 'Terminais', icone: <TerminalSquare /> },
  { to: '/skills', label: 'Skills', icone: <Sparkles /> },
  { to: '/rotinas', label: 'Rotinas', icone: <Repeat /> },
  { to: '/estudos', label: 'Estudos', icone: <GraduationCap /> },
  { to: '/biblioteca', label: 'Biblioteca', icone: <BookMarked /> },
  { to: '/vault', label: 'Vault', icone: <Library /> },
  { to: '/recibos', label: 'Recibos', icone: <Receipt /> },
  { to: '/ui', label: 'UI', icone: <Palette /> },
]

const PRINCIPAIS = LINKS.slice(0, 3)
const ativa = (to: string, pathname: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))
const MAIS = LINKS.slice(3)

/** Menu do topo (a partir do tablet). */
// O catálogo /ui fica só no menu "Mais" (é uma página de referência, não do dia a dia).
const TOPO = LINKS.filter((l) => l.to !== '/ui')

export function NavTopo() {
  const { pathname } = useLocation()
  const { container, itens, estilo } = useIndicador<HTMLAnchorElement>(TOPO.findIndex((l) => ativa(l.to, pathname)))
  return (
    <nav ref={container} aria-label="Principal" className={cn(cavado, 'relative hidden gap-1 rounded-pilula p-1.5 lg:flex')}>
      <span aria-hidden className={PILULA} style={estilo} />
      {TOPO.map((l, i) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          ref={(el) => {
            itens.current[i] = el
          }}
          className={({ isActive }) =>
            cn(
              'relative rounded-pilula px-3 py-1.5 text-sm font-semibold transition-colors duration-200',
              foco,
              isActive ? 'text-musgo-texto' : 'text-tinta-suave hover:text-tinta',
            )
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  )
}

const itemInferior = (ativo: boolean) =>
  cn(
    'flex flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-controle py-1.5 text-[0.7rem] font-semibold [&_svg]:size-5',
    foco,
    'transition-[box-shadow,color,transform] duration-200 active:scale-95',
    ativo ? 'text-musgo-texto shadow-cavado-sm [&_svg]:animate-[icone-ativo_400ms_ease-out]' : 'text-tinta-suave',
  )

/** Barra inferior no celular: Hoje, Chat, Terminais e "Mais". */
export function NavInferior() {
  const [maisAberto, setMaisAberto] = useState(false)
  const { pathname } = useLocation()
  const raiz = useRef<HTMLDivElement>(null)
  const emMais = MAIS.some((l) => ativa(l.to, pathname))

  useEffect(() => {
    if (!maisAberto) return
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setMaisAberto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMaisAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [maisAberto])

  return (
    <div ref={raiz} className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
      {maisAberto && (
        <div id="menu-mais" className={cn(relevo, 'animar-surgir mb-3 ml-auto flex w-48 origin-bottom-right flex-col gap-1 rounded-controle p-2 shadow-relevo-lg')}>
          {MAIS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setMaisAberto(false)}
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold [&_svg]:size-4', foco, isActive ? 'text-musgo-texto shadow-cavado-sm' : 'text-tinta')
              }
            >
              {l.icone}
              {l.label}
            </NavLink>
          ))}
        </div>
      )}
      <nav aria-label="Principal" className={cn(relevo, 'flex gap-1 rounded-card p-1.5 shadow-relevo-lg')}>
        {PRINCIPAIS.map((l) => (
          <NavLink key={l.to} to={l.to} end className={({ isActive }) => itemInferior(isActive)}>
            {l.icone}
            {l.label}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={maisAberto}
          aria-controls="menu-mais"
          onClick={() => setMaisAberto((a) => !a)}
          className={itemInferior(emMais || maisAberto)}
        >
          {emMais ? <LayoutGrid /> : <MoreHorizontal />}
          Mais
        </button>
      </nav>
    </div>
  )
}
