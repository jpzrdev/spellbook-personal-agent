import { useSyncExternalStore } from 'react'
import { del, post } from './api'
import { mascote } from './mascote'

// Pomodoro do Gandalf: foco → pausa curta (a cada 4 focos, pausa longa). O estado fica no localStorage
// (sobrevive a recarregar a página) e o fim de cada fase também é agendado no Bridge, que manda um push:
// no celular o navegador congela o timer da página quando o app vai para o fundo.

export type Fase = 'foco' | 'pausa' | 'longa'
export type Preset = { foco: number; pausa: number; longa: number }

export const PRESETS: Record<string, Preset> = {
  '25/5': { foco: 25, pausa: 5, longa: 15 },
  '50/10': { foco: 50, pausa: 10, longa: 20 },
}

export const NOME_FASE: Record<Fase, string> = { foco: 'Foco', pausa: 'Pausa', longa: 'Pausa longa' }

export type EstadoPomodoro = {
  fase: Fase
  rodando: boolean
  /** Quando a fase acaba (ms desde 1970), se rodando. */
  fimEm: number | null
  /** Quanto falta (ms) quando pausado ou parado. */
  restanteMs: number
  preset: string
  focosHoje: number
  dia: string
  rotulo: string
  /** Mostrado quando uma fase acaba (até o usuário começar a próxima). */
  acabou: Fase | null
}

const CHAVE = 'gandalf-pomodoro'
const hojeISO = () => new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD no fuso local

function duracaoMs(fase: Fase, preset: string): number {
  return (PRESETS[preset] ?? PRESETS['25/5'])[fase] * 60_000
}

function inicial(): EstadoPomodoro {
  return { fase: 'foco', rodando: false, fimEm: null, restanteMs: duracaoMs('foco', '25/5'), preset: '25/5', focosHoje: 0, dia: hojeISO(), rotulo: '', acabou: null }
}

function carregar(): EstadoPomodoro {
  try {
    const e = { ...inicial(), ...(JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<EstadoPomodoro>) }
    return e.dia === hojeISO() ? e : { ...e, focosHoje: 0, dia: hojeISO() }
  } catch {
    return inicial()
  }
}

let estado: EstadoPomodoro = carregar()
const ouvintes = new Set<() => void>()
let relogio: ReturnType<typeof setInterval> | null = null
let agora = Date.now()

function salvar(novo: Partial<EstadoPomodoro>) {
  estado = { ...estado, ...novo }
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado))
  } catch {
    // sem persistência: vale só nesta aba
  }
  ouvintes.forEach((f) => f())
}

function avisoServidor(fimEm: number, fase: Fase) {
  const titulo = fase === 'foco' ? '🍅 Foco concluído! Hora de uma pausa' : '⏰ Pausa acabou: de volta ao foco'
  const corpo = estado.rotulo ? `${estado.rotulo}` : 'Toque para abrir o Gandalf.'
  post('/pomodoro', { fim: new Date(fimEm).toISOString(), titulo, corpo }).catch(() => {})
}

function cancelarServidor() {
  del('/pomodoro').catch(() => {})
}

/** Toque curto (WebAudio), sem arquivo de som. */
function tocar() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.18, 0.36].forEach((t, i) => {
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.frequency.value = [660, 880, 990][i]
      vol.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      vol.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02)
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3)
      osc.connect(vol).connect(ctx.destination)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.32)
    })
  } catch {
    // sem áudio: o aviso visual e o push bastam
  }
}

function concluirFase() {
  const terminou = estado.fase
  const focos = terminou === 'foco' ? estado.focosHoje + 1 : estado.focosHoje
  const proxima: Fase = terminou === 'foco' ? (focos % 4 === 0 ? 'longa' : 'pausa') : 'foco'
  salvar({ fase: proxima, rodando: false, fimEm: null, restanteMs: duracaoMs(proxima, estado.preset), focosHoje: focos, acabou: terminou })
  tocar()
  mascote.reagir('feliz', 3000)
}

function tick() {
  agora = Date.now()
  if (estado.rodando && estado.fimEm && agora >= estado.fimEm) concluirFase()
  else ouvintes.forEach((f) => f())
}

function garantirRelogio() {
  if (estado.rodando && !relogio) relogio = setInterval(tick, 1000)
  if (!estado.rodando && relogio) {
    clearInterval(relogio)
    relogio = null
  }
}

export const pomodoro = {
  iniciar(rotulo?: string) {
    const fimEm = Date.now() + estado.restanteMs
    salvar({ rodando: true, fimEm, acabou: null, ...(rotulo !== undefined ? { rotulo } : {}) })
    avisoServidor(fimEm, estado.fase)
    garantirRelogio()
    agora = Date.now()
  },
  pausar() {
    if (!estado.rodando || !estado.fimEm) return
    salvar({ rodando: false, restanteMs: Math.max(0, estado.fimEm - Date.now()), fimEm: null })
    cancelarServidor()
    garantirRelogio()
  },
  reiniciar() {
    salvar({ rodando: false, fimEm: null, restanteMs: duracaoMs(estado.fase, estado.preset), acabou: null })
    cancelarServidor()
    garantirRelogio()
  },
  pular() {
    cancelarServidor()
    concluirFase()
    garantirRelogio()
  },
  focar(rotulo: string) {
    // "Estudar agora": começa um foco novo com o nome do que vai estudar.
    cancelarServidor()
    salvar({ fase: 'foco', rodando: false, fimEm: null, restanteMs: duracaoMs('foco', estado.preset), acabou: null })
    pomodoro.iniciar(rotulo)
  },
  escolherPreset(preset: string) {
    if (!PRESETS[preset] || estado.rodando) return
    salvar({ preset, restanteMs: duracaoMs(estado.fase, preset) })
  },
  rotular(rotulo: string) {
    salvar({ rotulo: rotulo.slice(0, 80) })
  },
  fecharAviso() {
    salvar({ acabou: null })
  },
}

/** Tempo restante (ms) da fase atual. */
export function restante(e: EstadoPomodoro, ms: number = agora): number {
  return e.rodando && e.fimEm ? Math.max(0, e.fimEm - ms) : e.restanteMs
}

export function total(e: EstadoPomodoro): number {
  return duracaoMs(e.fase, e.preset)
}

export function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function inscrever(f: () => void) {
  ouvintes.add(f)
  garantirRelogio()
  queueMicrotask(tick) // fase que acabou enquanto a página estava fechada
  return () => {
    ouvintes.delete(f)
  }
}

let ultimo = { estado, agora }
function instantaneo() {
  if (ultimo.estado !== estado || ultimo.agora !== agora) ultimo = { estado, agora }
  return ultimo
}

/** Estado + "agora" do relógio (atualiza a cada segundo enquanto roda). */
export function usePomodoro() {
  return useSyncExternalStore(inscrever, instantaneo)
}
