import { useIsMutating, useQuery } from '@tanstack/react-query'
import { MessageCircle, Sparkles } from 'lucide-react'
import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { api, type VozStatus } from '../lib/api'
import { cn } from '../lib/cn'
import { useVoz } from '../lib/useVoz'
import { ChatThread } from './ChatThread'
import { Mascote } from './Mascote'
import { Pomodoro } from './Pomodoro'
import { Modal, Orb, useToast } from './ui'
import { foco } from './ui/styles'

const DICA = {
  parado: 'Segure para falar',
  ouvindo: 'Ouvindo… solte para enviar (Esc cancela)',
  pensando: 'Pensando…',
  falando: 'Falando… (clique ou Esc para parar)',
}

// Pressão mais curta que isso é "clique": liga/desliga a gravação (útil no teclado e no celular).
const CLIQUE_MS = 300

/** Pilha lateral fixa (em todas as telas): pomodoro, conversa escrita e o Orb (segure para falar). */
export function GandalfDialog() {
  const [aberto, setAberto] = useState(false)
  const toast = useToast()
  const { data: vozStatus } = useQuery({ queryKey: ['voz'], queryFn: () => api<VozStatus>('/voz/status'), staleTime: 60_000 })
  const vozPronta = Boolean(vozStatus?.stt)
  const escrevendo = useIsMutating({ mutationKey: ['perguntar'] }) > 0
  const { estado, iniciar, terminar } = useVoz({
    aoResponder: () => setAberto(true),
    aoErro: (m) => toast('erro', m),
  })
  const apertouEm = useRef(0)
  const modoClique = useRef(false)

  function aoApertar(e: PointerEvent) {
    if (!vozPronta) return
    try {
      // Continua recebendo o "soltar" mesmo se o dedo/mouse sair do botão.
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // alguns navegadores recusam a captura; o soltar sobre o botão ainda funciona
    }
    apertouEm.current = performance.now()
    if (estado === 'ouvindo' && modoClique.current) return // o soltar vai encerrar
    modoClique.current = false
    void iniciar()
  }

  function aoSoltar() {
    if (!vozPronta || estado === 'falando') return
    const duracao = performance.now() - apertouEm.current
    if (estado === 'ouvindo' && modoClique.current) {
      modoClique.current = false
      return terminar()
    }
    // Toque rápido: continua gravando até o próximo clique.
    if (duracao < CLIQUE_MS) {
      modoClique.current = true
      return
    }
    terminar()
  }

  function aoClicarTeclado(e: MouseEvent) {
    // detail === 0: veio do teclado (Enter/Espaço). Liga/desliga a gravação.
    if (e.detail !== 0) return
    if (!vozPronta) return setAberto(true)
    if (estado === 'ouvindo') return terminar()
    void iniciar()
  }

  const estadoOrb = estado === 'parado' && escrevendo ? 'pensando' : estado

  return (
    <>
      <div className="fixed right-5 bottom-28 z-30 flex flex-col items-center gap-3 lg:right-8 lg:bottom-8">
        <Pomodoro />
        <button
          type="button"
          aria-label="Abrir conversa com o Gandalf"
          onClick={() => setAberto(true)}
          className={cn(
            'grid size-11 cursor-pointer place-items-center rounded-pilula bg-pergaminho text-tinta-suave shadow-relevo-sm hover:text-tinta active:shadow-cavado-sm',
            foco,
          )}
        >
          <MessageCircle className="size-5" aria-hidden />
        </button>
        <div className="relative">
          {estado !== 'parado' && (
            <p
              role="status"
              className="absolute right-full bottom-3 mr-3 w-max max-w-56 rounded-controle bg-pergaminho px-3 py-2 text-xs font-semibold shadow-relevo"
            >
              {DICA[estado]}
            </p>
          )}
          <Orb
            modo={vozPronta ? 'voz' : 'chat'}
            estado={estadoOrb}
            title={vozPronta ? DICA.parado : 'Voz indisponível: modelos não baixados'}
            onPointerDown={aoApertar}
            onPointerUp={aoSoltar}
            onPointerCancel={aoSoltar}
            onClick={(e) => {
              if (!vozPronta && e.detail !== 0) return setAberto(true)
              aoClicarTeclado(e)
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="touch-none select-none"
          />
        </div>
      </div>
      <Modal aberto={aberto} onClose={() => setAberto(false)} titulo="Falar com o Gandalf" icone={<Sparkles />}>
        <Mascote tamanho="sm" className="mb-2" />
        <ChatThread altura="max-h-[45vh]" />
        <Link to="/chat" onClick={() => setAberto(false)} className="mt-3 inline-block text-xs font-semibold text-musgo-texto">
          abrir o Chat em tela cheia
        </Link>
      </Modal>
    </>
  )
}
