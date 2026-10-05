import { CornerDownRight, FileText, Square } from 'lucide-react'
import { lazy, Suspense, useState, type FormEvent } from 'react'
import { sessaoAtiva, type Sessao } from '../lib/api'
import { cn } from '../lib/cn'
import { useCancelarSessao, useContinuarSessao } from '../lib/queries'
import { STATUS_SESSAO } from '../lib/sessoes'
import { useSessaoStream } from '../lib/ws'
import { TextoGandalf } from './TextoGandalf'
import { Badge, Button, TerminalPane, useToast } from './ui'
import { cavado } from './ui/styles'

type Props = {
  sessaoId: string
  /** Resumo inicial (da lista); o stream atualiza. */
  inicial?: Sessao
  altura?: string
  onContinuada?: (nova: Sessao) => void
  compacto?: boolean
}

/** Terminal ao vivo de uma sessão do Claude Code, com cancelar/continuar e o resultado final. */
// xterm.js é grande: carrega só quando um terminal aparece na tela.
const XTerm = lazy(() => import('./XTerm').then((m) => ({ default: m.XTerm })))

export function SessaoTerminal({ sessaoId, inicial, altura = 'h-80', onContinuada, compacto }: Props) {
  const { eventos, resumo, conectado, indisponivel } = useSessaoStream(sessaoId)
  const s = resumo ?? inicial
  const cancelar = useCancelarSessao()
  const continuar = useContinuarSessao()
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const ativa = indisponivel ? false : s ? sessaoAtiva(s) : true
  const status = s ? STATUS_SESSAO[s.status] : STATUS_SESSAO.fila

  function enviarContinuacao(e: FormEvent) {
    e.preventDefault()
    const t = texto.trim()
    if (!t) return
    continuar.mutate(
      { id: sessaoId, texto: t },
      {
        onSuccess: (nova) => {
          setTexto('')
          onContinuada?.(nova)
        },
        onError: (err) => toast('erro', err.message),
      },
    )
  }

  if (indisponivel)
    return (
      <p className="rounded-controle p-3 text-sm text-tinta-suave shadow-cavado-sm">
        Esta sessão não está mais disponível (o Bridge foi reiniciado). O resultado fica no recibo em <code className="font-mono">recibos/</code>.
      </p>
    )

  return (
    <div className="flex flex-col gap-4">
      <TerminalPane
        titulo={
          <span className="flex items-center gap-2">
            <span className="truncate">{s?.skill ? `/${s.skill} · ` : ''}{s?.tarefa ?? 'sessão'}</span>
          </span>
        }
        acoes={
          <>
            <Badge cor={status.cor}>{status.texto}</Badge>
            {!conectado && ativa && <span className="text-xs text-tinta-suave">reconectando…</span>}
            {ativa && (
              <Button
                variante="secundario"
                tamanho="sm"
                onClick={() => cancelar.mutate(sessaoId, { onError: (err) => toast('erro', err.message) })}
                disabled={cancelar.isPending}
              >
                <Square className="size-3.5" aria-hidden /> Cancelar
              </Button>
            )}
          </>
        }
      >
        <Suspense fallback={<div className={altura} />}>
          <XTerm eventos={eventos} className={altura} rotulo={`Saída da sessão ${s?.tarefa ?? sessaoId}`} />
        </Suspense>
      </TerminalPane>

      {s && !ativa && !compacto && (
        <div className="flex flex-col gap-3">
          {s.resultado && (
            <div className="rounded-controle p-4 shadow-relevo-sm">
              <TextoGandalf texto={s.resultado} />
            </div>
          )}
          {s.erro && s.status !== 'cancelada' && (
            <p role="alert" className="text-sm font-semibold text-erro">
              {s.erro}
            </p>
          )}
          {s.arquivos.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Arquivos alterados">
              {s.arquivos.map((a) => (
                <li key={a} className="flex items-center gap-1.5 rounded-pilula px-3 py-1 font-mono text-xs shadow-relevo-sm">
                  <FileText className="size-3.5 text-musgo-texto" aria-hidden /> {a}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-tinta-suave tabular-nums">
            {s.modelo ?? 'modelo padrão'} · {(s.tokens_entrada + s.tokens_saida).toLocaleString('pt-BR')} tokens
            {s.custo_usd > 0 && ` · ≈ US$ ${s.custo_usd.toFixed(3)} em API (referência; você usa a assinatura)`}
          </p>
          {s.claude_session_id && (
            <form onSubmit={enviarContinuacao} className={cn(cavado, 'flex items-center gap-2 rounded-pilula py-1 pr-1 pl-4')}>
              <CornerDownRight className="size-4 text-tinta-suave" aria-hidden />
              <input
                aria-label="Continuar esta sessão"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Continuar a conversa nesta sessão…"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-tinta-suave/70 focus-visible:outline-none"
              />
              <Button type="submit" tamanho="sm" disabled={!texto.trim() || continuar.isPending}>
                Continuar
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
