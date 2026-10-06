import { useSyncExternalStore } from 'react'

// The mascot's state (Gandalf's "tamagotchi"), shared by the Chat, the dialog and the voice.
// - moment: a short reaction (happy, confused, talking, petted) triggered by the rest of the HUD;
// - energy: drops over time without conversation (~10 points per hour) and goes up when chatting or petting;
// - night: between 23:00 and 6:00 it sleeps.
// The energy lives in this browser's localStorage (a convenience; not vault data).

export type Moment = 'happy' | 'confused' | 'talking' | 'petted'

type State = { moment: Moment | null; energy: number; night: boolean; awakeUntil: number }

const KEY = 'gandalf-energy'
const DROP_PER_MS = 10 / 3_600_000 // 10 points per hour

function readEnergy(now: number): number {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { value: number; at: number } | null
    if (!saved) return 80
    return Math.max(0, Math.min(100, saved.value - (now - saved.at) * DROP_PER_MS))
  } catch {
    return 80
  }
}

function writeEnergy(value: number, now: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ value, at: now }))
  } catch {
    // no persistence: the energy only applies to this tab
  }
}

const isNight = (d: Date) => d.getHours() >= 23 || d.getHours() < 6

let state: State = { moment: null, energy: 80, night: false, awakeUntil: 0 }
const listeners = new Set<() => void>()
let clock: ReturnType<typeof setInterval> | null = null
let clearMoment: ReturnType<typeof setTimeout> | null = null

function change(partial: Partial<State>) {
  state = { ...state, ...partial }
  listeners.forEach((f) => f())
}

function tick() {
  const now = Date.now()
  const energy = Math.round(readEnergy(now) * 10) / 10
  const night = isNight(new Date(now)) && now > state.awakeUntil
  if (energy !== state.energy || night !== state.night) change({ energy, night })
}

export const mascot = {
  /** A short reaction; `talking` stays until it's turned off. */
  react(moment: Moment, ms = 2500) {
    if (clearMoment) clearTimeout(clearMoment)
    change({ moment })
    if (moment !== 'talking') clearMoment = setTimeout(() => change({ moment: null }), ms)
  },
  hush() {
    if (state.moment === 'talking') change({ moment: null })
  },
  /** Chatting (+15) or petting (+5). Also wakes it up for 10 min if it's night. */
  feed(points: number) {
    const now = Date.now()
    const energy = Math.min(100, readEnergy(now) + points)
    writeEnergy(energy, now)
    change({ energy, awakeUntil: now + 10 * 60_000, night: false })
  },
}

const DONE_INTENTS = new Set(['capture', 'reminder', 'add_task', 'note'])

/** The mascot's reaction to one of Gandalf's replies (chat or voice). */
export function reactToReply(r: { tier: number; understood: boolean; intent: string | null }) {
  if (r.tier === 1 && !r.understood) mascot.react('confused', 3000)
  else if (r.intent && DONE_INTENTS.has(r.intent)) mascot.react('happy')
}

// Outside the hook: a new function on every render would make React resubscribe (and restart the clock) forever.
function subscribe(f: () => void) {
  listeners.add(f)
  if (!clock) {
    clock = setInterval(tick, 30_000)
    queueMicrotask(tick)
  }
  return () => {
    listeners.delete(f)
    if (listeners.size === 0 && clock) {
      clearInterval(clock)
      clock = null
    }
  }
}

export function useMascot(): State {
  return useSyncExternalStore(subscribe, () => state)
}
