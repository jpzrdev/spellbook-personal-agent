import { Eraser, Sparkles } from 'lucide-react'
import { ChatThread } from '../components/ChatThread'
import { Mascote } from '../components/Mascote'
import { Button, Card } from '../components/ui'
import { chat } from '../lib/chatStore'

export function Chat() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Chat</h1>
          <p className="mt-1 text-tinta-suave">Converse com o Gandalf. Cada pedido gera um recibo no vault.</p>
        </div>
        <Button variante="fantasma" tamanho="sm" onClick={() => chat.limpar()}>
          <Eraser className="size-4" aria-hidden /> Limpar conversa
        </Button>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="items-center lg:sticky lg:top-6">
          <Mascote />
        </Card>
        <Card titulo="Gandalf" subtitulo="T1 regras · T2 Claude Code rápido · T3 Claude Code no vault" icone={<Sparkles />} cor="musgo">
          <ChatThread altura="max-h-[calc(100dvh-22rem)] min-h-64" />
        </Card>
      </div>
    </div>
  )
}
