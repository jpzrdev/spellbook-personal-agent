import { Brain, MessagesSquare, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Markdown } from '../components/Markdown'
import { Badge, Button, Card, EmptyState, Input, Modal, SearchInput, useToast } from '../components/ui'
import type { ConversationPreview } from '../lib/api'
import { chat, useChat } from '../lib/chatStore'
import { useConversationAction, useConversations, useDeleteConversation, useUpdateConversation } from '../lib/queries'
import { relativeTime } from '../lib/time'

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

function Rename({ c, onClose }: { c: ConversationPreview | null; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const update = useUpdateConversation()
  const toast = useToast()
  useEffect(() => setTitle(c?.title ?? ''), [c])
  return (
    <Modal
      open={c !== null}
      onClose={onClose}
      title="Rename conversation"
      icon={<Pencil />}
      footer={
        <Button
          disabled={!title.trim() || update.isPending}
          onClick={() => c && update.mutate({ id: c.id, title: title.trim() }, { onSuccess: onClose, onError: (e) => toast('error', e.message) })}
        >
          Save
        </Button>
      }
    >
      <Input label="Title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} autoFocus />
    </Modal>
  )
}

/** Every conversation with the assistant, to search and pick up again in the chat. */
export function Conversations() {
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const { data = [], isPending, error } = useConversations(200, q)
  const { conversationId } = useChat()
  const open = useConversationAction()
  const remove = useDeleteConversation()
  const toast = useToast()
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState<ConversationPreview | null>(null)

  function continueIt(id: string) {
    open.mutate(
      { id, action: 'open' },
      {
        onSuccess: (c) => {
          chat.load(c)
          navigate('/chat')
        },
        onError: (e) => toast('error', e.message),
      },
    )
  }

  function deleteIt(c: ConversationPreview) {
    if (!window.confirm(`Delete “${c.title || 'Untitled'}”? The receipts stay in the memory.`)) return
    remove.mutate(c.id, {
      onSuccess: () => c.id === conversationId && chat.reset(),
      onError: (e) => toast('error', e.message),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Conversations</h1>
          <p className="mt-1 text-ink-muted">Every chat, kept in the memory. Open one to pick it up where you left it.</p>
        </div>
        <SearchInput label="Search conversations" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full sm:w-72" />
      </header>

      {error ? (
        <p role="alert" className="font-semibold text-danger">{error.message}</p>
      ) : isPending ? (
        <p className="text-ink-muted">loading…</p>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title={q ? `Nothing about “${q}”` : 'No conversations yet'}
          description={q ? 'Try other words: the search looks at titles, summaries and messages.' : 'Talk to the assistant in the Chat and the conversations show up here.'}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <Card
              key={c.id}
              title={c.title || 'Untitled'}
              subtitle={`${relativeTime(c.updated)} · ${c.turn_count} ${c.turn_count === 1 ? 'message' : 'messages'}`}
              icon={c.deep ? <Brain /> : <MessagesSquare />}
              color={c.id === conversationId ? 'primary' : 'silver'}
              actions={
                <>
                  {c.id === conversationId && <Badge color="primary">in the chat</Badge>}
                  <Button variant="icon" size="sm" aria-label="Rename" onClick={() => setRenaming(c)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="icon" size="sm" aria-label="Delete" onClick={() => deleteIt(c)}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              }
            >
              {c.summary ? (
                <div className="line-clamp-6 text-sm">
                  <Markdown text={c.summary} />
                </div>
              ) : (
                <p className="line-clamp-3 text-sm text-ink-muted">“{c.last_question}”</p>
              )}
              <Button size="sm" className="w-fit" disabled={open.isPending} onClick={() => continueIt(c.id)}>
                Continue in the chat
              </Button>
            </Card>
          ))}
        </div>
      )}
      <Rename c={renaming} onClose={() => setRenaming(null)} />
    </div>
  )
}
