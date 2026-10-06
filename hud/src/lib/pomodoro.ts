import { useSyncExternalStore } from 'react'
import { del, post } from './api'
import { mascot } from './mascot'

// Gandalf's pomodoro: focus → short break (every 4 focus blocks, a long break). The state lives in localStorage
// (survives a page reload) and the end of each phase is also scheduled on the Bridge, which sends a push:
// on the phone the browser freezes the page's timer when the app goes to the background.

export type Phase = 'focus' | 'break' | 'long'
export type Preset = { focus: number; break: number; long: number }

export const PRESETS: Record<string, Preset> = {
  '25/5': { focus: 25, break: 5, long: 15 },
  '50/10': { focus: 50, break: 10, long: 20 },
}

export const PHASE_NAME: Record<Phase, string> = { focus: 'Focus', break: 'Break', long: 'Long break' }

export type PomodoroState = {
  phase: Phase
  running: boolean
  /** When the phase ends (ms since 1970), if running. */
  endsAt: number | null
  /** How much is left (ms) when paused or stopped. */
  remainingMs: number
  preset: string
  focusToday: number
  day: string
  label: string
  /** Shown when a phase ends (until the user starts the next one). */
  finished: Phase | null
}

const KEY = 'gandalf-pomodoro'
const todayISO = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD in the local time zone

function durationMs(phase: Phase, preset: string): number {
  return (PRESETS[preset] ?? PRESETS['25/5'])[phase] * 60_000
}

function initial(): PomodoroState {
  return { phase: 'focus', running: false, endsAt: null, remainingMs: durationMs('focus', '25/5'), preset: '25/5', focusToday: 0, day: todayISO(), label: '', finished: null }
}

function load(): PomodoroState {
  try {
    const s = { ...initial(), ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PomodoroState>) }
    return s.day === todayISO() ? s : { ...s, focusToday: 0, day: todayISO() }
  } catch {
    return initial()
  }
}

let state: PomodoroState = load()
const listeners = new Set<() => void>()
let clock: ReturnType<typeof setInterval> | null = null
let now = Date.now()

function save(next: Partial<PomodoroState>) {
  state = { ...state, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // no persistence: only valid in this tab
  }
  listeners.forEach((f) => f())
}

function serverAlert(endsAt: number, phase: Phase) {
  const title = phase === 'focus' ? '🍅 Focus done! Time for a break' : '⏰ Break is over: back to focus'
  const body = state.label ? `${state.label}` : 'Tap to open Gandalf.'
  post('/pomodoro', { end: new Date(endsAt).toISOString(), title, body }).catch(() => {})
}

function cancelServer() {
  del('/pomodoro').catch(() => {})
}

/** A short chime (WebAudio), no sound file. */
function chime() {
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
    // no audio: the visual alert and the push are enough
  }
}

function finishPhase() {
  const ended = state.phase
  const focus = ended === 'focus' ? state.focusToday + 1 : state.focusToday
  const next: Phase = ended === 'focus' ? (focus % 4 === 0 ? 'long' : 'break') : 'focus'
  save({ phase: next, running: false, endsAt: null, remainingMs: durationMs(next, state.preset), focusToday: focus, finished: ended })
  chime()
  mascot.react('happy', 3000)
}

function tick() {
  now = Date.now()
  if (state.running && state.endsAt && now >= state.endsAt) finishPhase()
  else listeners.forEach((f) => f())
}

function ensureClock() {
  if (state.running && !clock) clock = setInterval(tick, 1000)
  if (!state.running && clock) {
    clearInterval(clock)
    clock = null
  }
}

export const pomodoro = {
  start(label?: string) {
    const endsAt = Date.now() + state.remainingMs
    save({ running: true, endsAt, finished: null, ...(label !== undefined ? { label } : {}) })
    serverAlert(endsAt, state.phase)
    ensureClock()
    now = Date.now()
  },
  pause() {
    if (!state.running || !state.endsAt) return
    save({ running: false, remainingMs: Math.max(0, state.endsAt - Date.now()), endsAt: null })
    cancelServer()
    ensureClock()
  },
  restart() {
    save({ running: false, endsAt: null, remainingMs: durationMs(state.phase, state.preset), finished: null })
    cancelServer()
    ensureClock()
  },
  skip() {
    cancelServer()
    finishPhase()
    ensureClock()
  },
  focus(label: string) {
    // "Focus" on a topic: starts a new focus block named after what will be studied.
    cancelServer()
    save({ phase: 'focus', running: false, endsAt: null, remainingMs: durationMs('focus', state.preset), finished: null })
    pomodoro.start(label)
  },
  choosePreset(preset: string) {
    if (!PRESETS[preset] || state.running) return
    save({ preset, remainingMs: durationMs(state.phase, preset) })
  },
  setLabel(label: string) {
    save({ label: label.slice(0, 80) })
  },
  dismiss() {
    save({ finished: null })
  },
}

/** Time left (ms) in the current phase. */
export function remaining(s: PomodoroState, ms: number = now): number {
  return s.running && s.endsAt ? Math.max(0, s.endsAt - ms) : s.remainingMs
}

export function total(s: PomodoroState): number {
  return durationMs(s.phase, s.preset)
}

export function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function subscribe(f: () => void) {
  listeners.add(f)
  ensureClock()
  queueMicrotask(tick) // a phase that ended while the page was closed
  return () => {
    listeners.delete(f)
  }
}

let last = { state, now }
function snapshot() {
  if (last.state !== state || last.now !== now) last = { state, now }
  return last
}

/** State + the clock's "now" (updates every second while running). */
export function usePomodoro() {
  return useSyncExternalStore(subscribe, snapshot)
}
