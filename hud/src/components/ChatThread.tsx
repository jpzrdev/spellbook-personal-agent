import { ChevronDown, Send, Terminal } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { PropostaResumo } from '../lib/api'
import { chat, useChat, type Troca } from '../lib/chatStore'
import { mascote, reagirAResposta } from '../lib/mascote'
import { cn } from '../lib/cn'
import { usePerguntar, useSessoes } from '../lib/queries'
import { STATUS_SESSAO } from '../lib/sessoes'
import { PropostaEvento } from './PropostaEvento'
import { ResultadoPesquisa } from './ResultadoPesquisa'
import { SessaoTerminal } from './SessaoTerminal'
import { TextoGandalf } from './TextoGandalf'
import { Badge, Button, TierBadge } from './ui'
import { foco } from './ui/styles'

const SUGESTOES = ['o que tenho hoje?', 'minhas prioridades', 'me lembra de … em 30 min', 'adiciona tarefa …', 'organize meu raw/']

function useEnviar(nota?: string) {
  const perguntar = usePerguntar()
  function enviar(pergunta: string, confirmar = false) {
    const id = chat.adicionar(pergunta)
    mascote.alimentar(15)
    perguntar.mutate(
      { texto: pergunta, confirmar, nota },
      {
        onSuccess: (resposta) => {
          chat.atualizar(id, { resposta })
          reagirAResposta(resposta)
        },
        onError: (err) => {
          chat.atualizar(id, { erro: err.message })
          mascote.reagir('confuso', 3000)
        },
      },
    )
  }
  return { enviar, pendente: perguntar.isPending }
}

function Resposta({ t, ultima, enviar }: { t: Troca; ultima: boolean; enviar: (p: string, c?: boolean) => void }) {
  const r = t.resposta!
  const [aberto, setAberto] = useState(ultima)
  const { data: sessoes } = useSessoes()
  const sessao = r.sessao_id ? sessoes?.find((s) => s.id === r.sessao_id) : undefined
  const propostas = (r.dados?.propostas as PropostaResumo[] | undefined) ?? []

  if (r.precisa_confirmar)
    return (
      <div className="flex flex-col items-start gap-3 rounded-controle p-3 shadow-relevo-sm">
        <Badge cor="ocre">limite diário</Badge>
        <TextoGandalf texto={r.resposta} />
        <Button tamanho="sm" onClick={() => enviar(t.pergunta, true)}>
          Usar mesmo assim
        </Button>
      </div>
    )

  return (
    <div className="flex flex-col gap-2 rounded-controle p-3 shadow-relevo-sm">
      <div className="flex flex-wrap items-center gap-2">
        {r.tier > 0 && <TierBadge tier={r.tier as 1 | 2 | 3} />}
        {r.tier !== 3 && <span className="text-xs text-tinta-suave tabular-nums">{(r.duracao_ms / 1000).toFixed(r.duracao_ms < 1000 ? 2 : 1)} s</span>}
        {sessao && <Badge cor={STATUS_SESSAO[sessao.status].cor}>{STATUS_SESSAO[sessao.status].texto}</Badge>}
        {r.tier === 1 && !r.entendeu && <Badge cor="ocre">não reconhecido</Badge>}
      </div>
      <TextoGandalf texto={r.resposta} />
      {propostas.map((p) => (
        <PropostaEvento
          key={p.id}
          proposta={p}
          onMudou={(nova) =>
            chat.atualizar(t.id, { resposta: { ...r, dados: { ...r.dados, propostas: propostas.map((x) => (x.id === nova.id ? nova : x)) } } })
          }
        />
      ))}
      {r.sessao_id && r.intent === 'pesquisar' && <ResultadoPesquisa sessaoId={r.sessao_id} />}
      {r.sessao_id && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={aberto}
              onClick={() => setAberto((a) => !a)}
              className={cn('flex cursor-pointer items-center gap-1.5 rounded-pilula px-3 py-1 text-xs font-semibold shadow-relevo-sm active:shadow-cavado-sm', foco)}
            >
              <Terminal className="size-3.5" aria-hidden /> {aberto ? 'Esconder terminal' : 'Ver terminal'}
              <ChevronDown className={cn('size-3.5 transition-transform', aberto && 'rotate-180')} aria-hidden />
            </button>
            <Link to={`/terminais?sessao=${r.sessao_id}`} className={cn('rounded-pilula px-2 py-1 text-xs font-semibold text-musgo-texto', foco)}>
              abrir em Terminais
            </Link>
          </div>
          {aberto && <SessaoTerminal sessaoId={r.sessao_id} inicial={sessao} altura="h-56" />}
        </div>
      )}
    </div>
  )
}

type Props = {
  className?: string
  altura?: string
  /** Conversa sobre uma nota de estudo: as perguntas vão com ela como contexto. */
  nota?: string
  placeholder?: string
  /** Mostra só as trocas feitas aqui (não o histórico inteiro do chat). */
  soNovas?: boolean
}

/** Conversa com o Gandalf: badge de tier em cada resposta e mini-terminal nas respostas do Tier 3. */
export function ChatThread({ className, altura = 'max-h-[60vh]', nota, placeholder = 'Pergunte ou peça algo…', soNovas = false }: Props) {
  const todas = useChat()
  const [desde] = useState(() => (soNovas ? todas.length : 0))
  const trocas = soNovas ? todas.slice(desde) : todas
  const { enviar, pendente } = useEnviar(nota)
  const [texto, setTexto] = useState('')
  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Corpo em bloco: scrollIntoView pode devolver uma Promise, que não pode virar o "cleanup".
    fim.current?.scrollIntoView?.({ block: 'end' })
  }, [trocas.length])

  function submeter(e: FormEvent) {
    e.preventDefault()
    const p = texto.trim()
    if (!p || pendente) return
    setTexto('')
    enviar(p)
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className={cn('flex flex-col gap-5 overflow-y-auto p-1', altura)}>
        {trocas.length === 0 && !soNovas && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-tinta-suave">
              Pergunte qualquer coisa. Regras simples respondem na hora (T1); o resto vai para o Claude Code (T2 rápido ou
              T3 com acesso ao vault).
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setTexto(s.replace(' …', ' '))
                    campo.current?.focus()
                  }}
                  className={cn('cursor-pointer rounded-pilula px-3 py-1 text-sm text-tinta-suave shadow-relevo-sm hover:text-tinta active:shadow-cavado-sm', foco)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {trocas.map((t, i) => (
          <div key={t.id} className="animar-mensagem flex flex-col gap-2">
            <p className="max-w-[85%] self-end rounded-controle px-3 py-2 text-sm font-semibold shadow-cavado-sm">{t.pergunta}</p>
            {t.resposta && <Resposta t={t} ultima={i === trocas.length - 1} enviar={enviar} />}
            {t.erro && (
              <p role="alert" className="text-sm font-semibold text-erro">
                {t.erro}
              </p>
            )}
            {!t.resposta && !t.erro && <p className="text-sm text-tinta-suave">pensando… (o Tier 2 leva alguns segundos)</p>}
          </div>
        ))}
        <div ref={fim} />
      </div>
      <form onSubmit={submeter} className="flex items-center gap-3">
        <input
          ref={campo}
          aria-label="Pergunta para o Gandalf"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
          className="h-11 min-w-0 flex-1 rounded-pilula bg-pergaminho px-4 shadow-cavado placeholder:text-tinta-suave/70 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-musgo"
        />
        <Button type="submit" variante="icone" aria-label="Enviar" disabled={!texto.trim() || pendente}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}
