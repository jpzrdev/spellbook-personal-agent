import { Eraser, Sparkles } from 'lucide-react'
import { ChatThread } from '../components/ChatThread'
import { Mascot } from '../components/Mascot'
import { Button, Card } from '../components/ui'
import { chat } from '../lib/chatStore'

export function Chat() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Chat</h1>
          <p className="mt-1 text-ink-muted">Talk to Gandalf. Every request writes a receipt in the memory.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => chat.clear()}>
          <Eraser className="size-4" aria-hidden /> Clear conversation
        </Button>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="items-center lg:sticky lg:top-6">
          <Mascot />
        </Card>
        <Card title="Gandalf" subtitle="T1 rules · T2 fast Claude Code · T3 Claude Code in the memory" icon={<Sparkles />} color="primary">
          <ChatThread height="max-h-[calc(100dvh-22rem)] min-h-64" />
        </Card>
      </div>
    </div>
  )
}
