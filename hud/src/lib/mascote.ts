import { useSyncExternalStore } from 'react'

// Estado do mascote (o "tamagochi" do Gandalf), compartilhado entre o Chat, o diálogo e a voz.
// - momento: reação curta (feliz, confuso, falando, carinho) disparada pelo resto do HUD;
// - energia: cai com o tempo sem conversa (~10 pontos por hora) e sobe ao conversar ou fazer carinho;
// - noite: entre 23h e 6h ele dorme.
// A energia fica no localStorage deste navegador (conveniência; não é dado do vault).

export type Momento = 'feliz' | 'confuso' | 'falando' | 'carinho'

type Estado = { momento: Momento | null; energia: number; noite: boolean; acordadoAte: number }

const CHAVE = 'gandalf-energia'
const QUEDA_POR_MS = 10 / 3_600_000 // 10 pontos por hora

function lerEnergia(agora: number): number {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { valor: number; em: number } | null
    if (!salvo) return 80
    return Math.max(0, Math.min(100, salvo.valor - (agora - salvo.em) * QUEDA_POR_MS))
  } catch {
    return 80
  }
}

function gravarEnergia(valor: number, agora: number) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ valor, em: agora }))
  } catch {
    // sem persistência: a energia vale só nesta aba
  }
}

const ehNoite = (d: Date) => d.getHours() >= 23 || d.getHours() < 6

let estado: Estado = { momento: null, energia: 80, noite: false, acordadoAte: 0 }
const ouvintes = new Set<() => void>()
let relogio: ReturnType<typeof setInterval> | null = null
let limparMomento: ReturnType<typeof setTimeout> | null = null

function mudar(parcial: Partial<Estado>) {
  estado = { ...estado, ...parcial }
  ouvintes.forEach((f) => f())
}

function atualizarRelogio() {
  const agora = Date.now()
  const energia = Math.round(lerEnergia(agora) * 10) / 10
  const noite = ehNoite(new Date(agora)) && agora > estado.acordadoAte
  if (energia !== estado.energia || noite !== estado.noite) mudar({ energia, noite })
}

export const mascote = {
  /** Reação curta; `falando` fica até ser desligado. */
  reagir(momento: Momento, ms = 2500) {
    if (limparMomento) clearTimeout(limparMomento)
    mudar({ momento })
    if (momento !== 'falando') limparMomento = setTimeout(() => mudar({ momento: null }), ms)
  },
  calar() {
    if (estado.momento === 'falando') mudar({ momento: null })
  },
  /** Conversar (+15) ou fazer carinho (+5). Também o acorda por 10 min se estiver de noite. */
  alimentar(pontos: number) {
    const agora = Date.now()
    const energia = Math.min(100, lerEnergia(agora) + pontos)
    gravarEnergia(energia, agora)
    mudar({ energia, acordadoAte: agora + 10 * 60_000, noite: false })
  },
}

const INTENTS_FEITOS = new Set(['capturar', 'lembrete', 'adicionar_tarefa', 'anotar'])

/** Reação do mascote a uma resposta do Gandalf (chat ou voz). */
export function reagirAResposta(r: { tier: number; entendeu: boolean; intent: string | null }) {
  if (r.tier === 1 && !r.entendeu) mascote.reagir('confuso', 3000)
  else if (r.intent && INTENTS_FEITOS.has(r.intent)) mascote.reagir('feliz')
}

// Fora do hook: uma função nova a cada render faria o React reinscrever (e reiniciar o relógio) sem parar.
function inscrever(f: () => void) {
  ouvintes.add(f)
  if (!relogio) {
    relogio = setInterval(atualizarRelogio, 30_000)
    queueMicrotask(atualizarRelogio)
  }
  return () => {
    ouvintes.delete(f)
    if (ouvintes.size === 0 && relogio) {
      clearInterval(relogio)
      relogio = null
    }
  }
}

export function useMascote(): Estado {
  return useSyncExternalStore(inscrever, () => estado)
}
