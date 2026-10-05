import { useIsMutating } from '@tanstack/react-query'
import { cn } from '../lib/cn'
import { mascote, useMascote } from '../lib/mascote'
import { useHoje, useSessoes } from '../lib/queries'

export type EstadoMascote = 'normal' | 'pensando' | 'falando' | 'feliz' | 'confuso' | 'carinho' | 'dormindo' | 'cansado'

const FRASE: Record<EstadoMascote, string> = {
  normal: '',
  pensando: 'consultando os pergaminhos…',
  falando: 'falando…',
  feliz: 'feito!',
  confuso: 'hmm… isso não ficou claro',
  carinho: 'obrigado, amigo',
  dormindo: 'cochilando… toque para acordar',
  cansado: 'cansado; converse um pouco com ele',
}

function animo(concluidas: number, atrasadas: number): number {
  return Math.max(0, Math.min(100, 45 + concluidas * 15 - atrasadas * 12))
}

function Barra({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="flex items-center gap-2 text-[0.7rem] font-semibold text-tinta-suave">
      <span className="w-14">{rotulo}</span>
      <span
        className="h-2 flex-1 overflow-hidden rounded-pilula shadow-cavado-sm"
        role="meter"
        aria-label={rotulo}
        aria-valuenow={Math.round(valor)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={cn('block h-full rounded-pilula transition-[width] duration-700', cor)} style={{ width: `${valor}%` }} />
      </span>
    </div>
  )
}

/** O mago desenhado (SVG) com as animações do estado (CSS em index.css, classes mascote-*). */
function Desenho({ estado }: { estado: EstadoMascote }) {
  const dormindo = estado === 'dormindo'
  return (
    <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible" aria-hidden>
      <ellipse cx="60" cy="133" rx="30" ry="4" className="fill-tinta/15" />
      <g className="mascote-corpo">
        {/* cajado */}
        <line x1="92" y1="44" x2="90" y2="131" stroke="#7a5434" strokeWidth="4" strokeLinecap="round" />
        <circle cx="92" cy="40" r="9" className="mascote-halo" fill="#e0a42a" opacity="0.25" />
        <circle cx="92" cy="40" r="5" className="mascote-luz" fill="#e0a42a" />
        {/* manto */}
        <path d="M38 129 L47 80 Q60 75 73 80 L82 129 Z" fill="#8c8a80" />
        <path d="M47 80 Q60 75 73 80 L75 90 Q60 86 45 90 Z" fill="#6f6d65" />
        <circle cx="89" cy="84" r="4.2" fill="#e9c9a1" />
        <g className="mascote-cabeca">
          {/* chapéu */}
          <polygon points="46,56 62,18 70,16 66,23 74,56" fill="#8c8a80" />
          <ellipse cx="60" cy="56.5" rx="21" ry="4.6" fill="#6f6d65" />
          <polygon points="59,37 60.2,40 63.4,41.2 60.2,42.4 59,45.6 57.8,42.4 54.6,41.2 57.8,40" className="mascote-estrela" fill="#e0a42a" />
          {/* rosto */}
          <ellipse cx="60" cy="65" rx="14" ry="10" fill="#e9c9a1" />
          {dormindo ? (
            <g stroke="#2a2a22" strokeWidth="1.4" fill="none" strokeLinecap="round">
              <path d="M51.5 65 Q54 67 56.5 65" />
              <path d="M63.5 65 Q66 67 68.5 65" />
            </g>
          ) : (
            <g className={cn('mascote-olhos', estado === 'pensando' && 'mascote-olhos-cima')}>
              <circle cx="54" cy="65" r="1.9" fill="#2a2a22" />
              <circle cx="66" cy="65" r="1.9" fill="#2a2a22" />
            </g>
          )}
          <ellipse cx="54" cy="60.5" rx="4.2" ry="1.4" fill="#d8d4c8" className={cn(estado === 'confuso' && 'mascote-sobrancelha')} />
          <ellipse cx="66" cy="60.5" rx="4.2" ry="1.4" fill="#d8d4c8" />
          {/* barba e bigode */}
          <path className="mascote-barba" d="M46 69 Q60 75 74 69 L70 94 Q60 112 50 94 Z" fill="#f7f0e0" />
          <ellipse cx="60" cy="72" rx="12" ry="3.6" fill="#f7f0e0" />
          <ellipse cx="60" cy="69.5" rx="2.6" ry="2.2" fill="#dcb88e" />
        </g>
      </g>

      {/* efeitos por estado */}
      {estado === 'pensando' && (
        <g className="mascote-orbita" fill="#e0a42a">
          <circle cx="92" cy="26" r="1.8" />
          <circle cx="104" cy="44" r="1.4" />
          <circle cx="80" cy="46" r="1.2" />
        </g>
      )}
      {estado === 'feliz' && (
        <g className="mascote-estouro" fill="#e0a42a">
          <polygon points="22,30 24,35 29,36 24,38 22,43 20,38 15,36 20,35" />
          <polygon points="100,14 101.5,18 105.5,19 101.5,20.5 100,24 98.5,20.5 94.5,19 98.5,18" />
          <polygon points="30,88 31,91 34,92 31,93 30,96 29,93 26,92 29,91" />
        </g>
      )}
      {estado === 'confuso' && (
        <text x="88" y="24" className="mascote-ondas fill-tinta-suave font-titulo" fontSize="20" fontWeight="700">
          ?
        </text>
      )}
      {estado === 'carinho' && (
        <path className="mascote-flutua" d="M30 40 c-3-4-9-1-6 4 l6 6 6-6 c3-5-3-8-6-4z" fill="#c9776a" />
      )}
      {dormindo && (
        <g className="fill-tinta-suave font-titulo" fontWeight="700">
          <text x="80" y="30" fontSize="11" className="mascote-z">z</text>
          <text x="90" y="18" fontSize="14" className="mascote-z mascote-z-2">z</text>
        </g>
      )}
      {estado === 'falando' && (
        <g stroke="#e0a42a" strokeWidth="1.6" fill="none" strokeLinecap="round" className="mascote-ondas">
          <path d="M22 66 q-4 6 0 12" />
          <path d="M16 62 q-6 10 0 20" />
        </g>
      )}
    </svg>
  )
}

type Props = { tamanho?: 'sm' | 'md'; className?: string }

/** Tamagochi do Gandalf: reage ao que acontece no chat (pensando, falando, feito, confuso),
 * dorme à noite, se cansa sem conversa e fica de bom humor quando as tarefas andam. */
export function Mascote({ tamanho = 'md', className }: Props) {
  const m = useMascote()
  const pensandoChat = useIsMutating({ mutationKey: ['perguntar'] }) > 0
  const { data: sessoes } = useSessoes()
  const { data: hoje } = useHoje()
  const sessaoRodando = sessoes?.some((s) => s.status === 'rodando') ?? false
  const humor = hoje ? animo(hoje.tarefas.concluidas_hoje, hoje.tarefas.atrasadas) : 50

  const estado: EstadoMascote =
    m.momento ?? (pensandoChat || sessaoRodando ? 'pensando' : m.noite ? 'dormindo' : m.energia < 25 ? 'cansado' : 'normal')
  const frase =
    FRASE[estado] ||
    (humor >= 70 ? 'de ótimo humor: as tarefas estão andando' : humor < 35 ? 'preocupado com as tarefas atrasadas' : 'sereno, à sua disposição')

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => {
          mascote.alimentar(5)
          mascote.reagir('carinho', 1800)
        }}
        aria-label="Fazer carinho no Gandalf"
        title="Fazer carinho"
        data-estado={estado}
        className={cn('mascote cursor-pointer rounded-card', tamanho === 'sm' ? 'size-20' : 'size-48')}
      >
        <Desenho estado={estado} />
      </button>
      <p role="status" className="text-center text-xs font-semibold text-tinta-suave">
        Gandalf: {frase}
      </p>
      {tamanho === 'md' && (
        <div className="flex w-full max-w-56 flex-col gap-1.5">
          <Barra rotulo="Energia" valor={m.energia} cor="bg-ocre" />
          <Barra rotulo="Ânimo" valor={humor} cor="bg-musgo" />
        </div>
      )}
    </div>
  )
}
