import { useSyncExternalStore } from 'react'
import type { GandalfReply } from './api'

// The conversation with Gandalf, shared by the Chat screen and the Orb. It lives in this browser's localStorage
// (a per-person convenience; the official record of each request is the receipts in the memory).
export type Turn = { id: string; question: string; reply?: GandalfReply; error?: string; at: string }

const KEY = 'gandalf-chat'
const MAX = 50

function load(): Turn[] {
  try {
    const raw = localStorage.getItem(KEY)
    const items = raw ? (JSON.parse(raw) as Turn[]) : []
    // Requests that were "thinking" when the page closed won't come back.
    return items.map((t) => (t.reply || t.error ? t : { ...t, error: 'interrupted (the page was reloaded)' }))
  } catch {
    return []
  }
}

let turns: Turn[] = load()
const listeners = new Set<() => void>()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(turns.slice(-MAX)))
  } catch {
    // no persistence
  }
  listeners.forEach((f) => f())
}

export const chat = {
  add(question: string): string {
    const id = crypto.randomUUID()
    turns = [...turns, { id, question, at: new Date().toISOString() }].slice(-MAX)
    save()
    return id
  },
  update(id: string, data: Partial<Turn>) {
    turns = turns.map((t) => (t.id === id ? { ...t, ...data } : t))
    save()
  },
  /** The last answered turns of the last 10 min: they go along with /ask so Tier 2 understands
   * follow-ups ("tomorrow at 9" after Gandalf asked "when?"). */
  previous(): Array<{ question: string; answer: string }> {
    const limit = Date.now() - 10 * 60_000
    return turns
      .filter((t) => t.reply && t.reply.tier > 0 && new Date(t.at).getTime() >= limit)
      .slice(-2)
      .map((t) => ({ question: t.question.slice(0, 1000), answer: t.reply!.reply.slice(0, 1500) }))
  },
  clear() {
    turns = []
    save()
  },
}

export function useChat(): Turn[] {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => turns,
  )
}
