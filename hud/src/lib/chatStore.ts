import { useSyncExternalStore } from 'react'
import { api, type Conversation, type GandalfReply } from './api'

// The conversation on screen. The Bridge keeps every conversation (the source of truth, shared by the PC, the phone
// and the voice); this store is the view of the current one: its id, its turns and the ones still thinking.
// The main chat (Chat screen, Orb, voice) keeps it in localStorage to come back to it; a chat about a study note
// has its own store, in memory only.
export type Turn = { id: string; question: string; reply?: GandalfReply; error?: string; at: string }
export type ChatState = { conversationId: string | null; deep: boolean; turns: Turn[] }

export type ChatStore = {
  get(): ChatState
  subscribe(listener: () => void): () => void
  /** A question sent: a turn "thinking" until `settle` or an error. */
  add(question: string): string
  update(id: string, data: Partial<Turn>): void
  /** The reply arrived: it says which conversation the turn went into. */
  settle(id: string, reply: GandalfReply): void
  /** Shows a conversation from the Bridge (opened from the list, or after a split/merge). */
  load(c: Conversation): void
  /** "New conversation": the next question starts one. */
  reset(): void
  setDeep(deep: boolean): void
}

const KEY = 'gandalf-conversation'
const OLD_KEY = 'gandalf-chat' // before conversations: the last 50 turns, only in this browser
const MAX = 100
const EMPTY: ChatState = { conversationId: null, deep: false, turns: [] }

function restore(key: string): ChatState {
  try {
    localStorage.removeItem(OLD_KEY)
    const raw = localStorage.getItem(key)
    const s = raw ? ({ ...EMPTY, ...JSON.parse(raw) } as ChatState) : EMPTY
    // Requests that were "thinking" when the page closed won't come back.
    return { ...s, turns: s.turns.map((t) => (t.reply || t.error ? t : { ...t, error: 'interrupted (the page was reloaded)' })) }
  } catch {
    return EMPTY
  }
}

/** The turns of a conversation as the chat shows them (the reply the HUD got at the time). */
export function turnsOf(c: Conversation): Turn[] {
  return c.turns.map((t) => ({
    id: t.id,
    question: t.question,
    at: t.at,
    reply: t.reply ?? {
      id: t.receipt_id,
      tier: t.tier as GandalfReply['tier'],
      intent: t.intent,
      understood: true,
      reply: t.answer,
      duration_ms: 0,
      data: {},
      session_id: t.session_id,
      needs_confirmation: false,
      conversation_id: c.id,
    },
  }))
}

export function createChatStore(key?: string): ChatStore {
  let state: ChatState = key ? restore(key) : EMPTY
  const listeners = new Set<() => void>()

  function set(next: ChatState) {
    state = { ...next, turns: next.turns.slice(-MAX) }
    if (key)
      try {
        localStorage.setItem(key, JSON.stringify(state))
      } catch {
        // no persistence
      }
    listeners.forEach((f) => f())
  }

  const store: ChatStore = {
    get: () => state,
    subscribe(f) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    add(question) {
      const id = crypto.randomUUID()
      set({ ...state, turns: [...state.turns, { id, question, at: new Date().toISOString() }] })
      return id
    },
    update(id, data) {
      set({ ...state, turns: state.turns.map((t) => (t.id === id ? { ...t, ...data } : t)) })
    },
    settle(id, reply) {
      // From here on the turn has the Bridge's id (needed to split the conversation from it).
      const turns = state.turns.map((t) => (t.id === id ? { ...t, id: reply.turn_id ?? t.id, reply } : t))
      const conversationId = reply.conversation_id ?? state.conversationId
      set({ ...state, conversationId, turns })
      if (reply.thread?.decision === 'new' && conversationId) {
        // A new subject after a pause: the screen shows only the new conversation (the turns since the pause).
        void api<Conversation>(`/conversations/${conversationId}`)
          .then((c) => state.conversationId === c.id && store.load(c))
          .catch(() => undefined)
      }
    },
    load(c) {
      // Turns still thinking stay on screen (their reply will say where they went).
      const pending = state.turns.filter((t) => !t.reply && !t.error)
      set({ conversationId: c.id, deep: c.deep, turns: [...turnsOf(c), ...pending] })
    },
    reset() {
      set({ ...EMPTY, deep: state.deep })
    },
    setDeep(deep) {
      set({ ...state, deep })
    },
  }
  return store
}

/** The main chat (Chat screen, the Orb's dialog and the voice). */
export const chat = createChatStore(KEY)

export function useChat(store: ChatStore = chat): ChatState {
  return useSyncExternalStore(store.subscribe, store.get)
}
