import { Brain, History, MessageSquarePlus, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { ChatThread } from '../components/ChatThread'
import { Mascot } from '../components/Mascot'
import { Button, Card, Toggle, useToast } from '../components/ui'
import { focusRing } from '../components/ui/styles'
import { chat, useChat } from '../lib/chatStore'
import { cn } from '../lib/cn'
import { useAgent, useConversationAction, useConversations, useUpdateConversation } from '../lib/queries'
import { relativeTime } from '../lib/time'

/** The last conversations under the wizard: one tap brings one back to the chat. */
function RecentConversations() {
  const { data = [], isPending } = useConversations(5)
  const { conversationId } = useChat()
  const open = useConversationAction()
  const toast = useToast()
  return (
    <Card title="Recent" icon={<History />} color="silver" className="w-full">
      {isPending ? (
        <p className="text-sm text-ink-muted">loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-ink-muted">Your conversations show up here.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-current={c.id === conversationId || undefined}
                disabled={open.isPending}
                onClick={() =>
                  c.id !== conversationId &&
                  open.mutate({ id: c.id, action: 'open' }, { onSuccess: (full) => chat.load(full), onError: (e) => toast('error', e.message) })
                }
                className={cn(
                  'flex w-full cursor-pointer flex-col rounded-xl px-3 py-2 text-left transition-shadow hover:shadow-sunken-sm',
                  focusRing,
                  c.id === conversationId && 'text-primary-text shadow-sunken-sm',
                )}
              >
                <span className="truncate text-sm font-semibold">{c.title || 'Untitled'}</span>
                <span className="text-xs text-ink-muted">
                  {relativeTime(c.updated)} · {c.turn_count} {c.turn_count === 1 ? 'message' : 'messages'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link to="/conversations" className={cn('w-fit rounded-pill px-2 py-1 text-xs font-semibold text-primary-text', focusRing)}>
        All conversations →
      </Link>
    </Card>
  )
}

export function Chat() {
  const agentName = useAgent().name
  const { conversationId, deep, turns } = useChat()
  const { data: recent = [] } = useConversations(5)
  const update = useUpdateConversation()
  const title = recent.find((c) => c.id === conversationId)?.title

  function setDeep(on: boolean) {
    chat.setDeep(on)
    if (conversationId) update.mutate({ id: conversationId, deep: on })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Chat</h1>
          <p className="mt-1 text-ink-muted">Talk to {agentName}. It remembers the conversation; every request writes a receipt in the memory.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => chat.reset()} disabled={turns.length === 0}>
          <MessageSquarePlus className="size-4" aria-hidden /> New conversation
        </Button>
      </header>
      {/* Phone: wizard, chat, then the recent list. From the tablet up the list sits under the wizard. */}
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <Card className="items-center">
          <Mascot />
        </Card>
        <Card
          className="lg:row-span-2"
          title={title || agentName}
          subtitle={deep ? 'Deep mode: a smarter model thinks each answer through (slower)' : 'T1 rules · T2 fast Claude Code · T3 Claude Code in the memory'}
          icon={deep ? <Brain /> : <Sparkles />}
          color="primary"
          actions={<Toggle on={deep} onChange={setDeep} label="Deep mode" showLabel />}
        >
          <ChatThread height="max-h-[calc(100dvh-22rem)] min-h-64" />
        </Card>
        <RecentConversations />
      </div>
    </div>
  )
}
