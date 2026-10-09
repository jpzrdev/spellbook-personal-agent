import { describe, expect, it } from 'vitest'
import type { Conversation, GandalfReply } from './api'
import { createChatStore } from './chatStore'

const reply = (over: Partial<GandalfReply> = {}): GandalfReply => ({
  id: 'r1',
  tier: 2,
  intent: 'answer',
  understood: true,
  reply: 'Hi',
  duration_ms: 10,
  data: {},
  session_id: null,
  needs_confirmation: false,
  conversation_id: 'c1',
  turn_id: 't1',
  ...over,
})

const conversation = (id: string, questions: string[]): Conversation => ({
  id,
  title: 'T',
  created: '2026-10-08T10:00:00',
  updated: '2026-10-08T10:00:00',
  deep: true,
  turn_count: questions.length,
  summary: '',
  last_question: '',
  split_from: null,
  summarized: 0,
  turns: questions.map((q, i) => ({
    id: `s${i}`,
    at: '2026-10-08T10:00:00',
    question: q,
    answer: `answer ${i}`,
    tier: 2,
    intent: 'answer',
    source: 'hud',
    receipt_id: null,
    session_id: null,
    ephemeral_id: null,
    reply: null,
  })),
})

describe('chat store', () => {
  it('a reply says which conversation the turn went into and gives the turn its id', () => {
    const store = createChatStore()
    const id = store.add('hello')
    expect(store.get().conversationId).toBeNull()
    store.settle(id, reply())
    expect(store.get().conversationId).toBe('c1')
    expect(store.get().turns.map((t) => t.id)).toEqual(['t1'])
  })

  it('opening a conversation shows its turns and keeps the ones still thinking', () => {
    const store = createChatStore()
    store.add('still thinking')
    store.load(conversation('c2', ['q1', 'q2']))
    const s = store.get()
    expect(s.conversationId).toBe('c2')
    expect(s.deep).toBe(true)
    expect(s.turns.map((t) => t.question)).toEqual(['q1', 'q2', 'still thinking'])
    expect(s.turns[0].reply?.reply).toBe('answer 0') // a turn without the HUD reply gets one from its answer
  })

  it('a new conversation clears the screen but keeps the deep mode', () => {
    const store = createChatStore()
    store.setDeep(true)
    store.settle(store.add('q'), reply())
    store.reset()
    expect(store.get()).toEqual({ conversationId: null, deep: true, turns: [] })
  })
})
