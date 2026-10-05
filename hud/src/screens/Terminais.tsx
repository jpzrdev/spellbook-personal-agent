import { Play, TerminalSquare } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { SessaoTerminal } from '../components/SessaoTerminal'
import { Button, EmptyState, useToast } from '../components/ui'
import { cavado, foco, solido } from '../components/ui/styles'
import { cn } from '../lib/cn'
import { usePerguntar, useSessoes } from '../lib/queries'
import { STATUS_SESSAO } from '../lib/sessoes'

function NovaSessao({ onCriada }: { onCriada: (id: string) => void }) {
  const perguntar = usePerguntar()
  const toast = useToast()
  const [texto, setTexto] = useState('')

  function criar(e: FormEvent) {
    e.preventDefault()
    const t = texto.trim()
    if (!t) return
    perguntar.mutate(
      { texto: t, forcarTier: 3 },
      {
        onSuccess: (r) => {
          if (r.precisa_confirmar) return toast('info', r.resposta)
          setTexto('')
          if (r.sessao_id) onCriada(r.sessao_id)
        },
        onError: (err) => toast('erro', err.message),
      },
    )
  }

  return (
    <form onSubmit={criar} className={cn(cavado, 'flex items-center gap-2 rounded-pilula py-1 pr-1 pl-4')}>
      <TerminalSquare className="size-4 text-tinta-suave" aria-hidden />
      <input
        aria-label="Tarefa para uma nova sessão do Claude Code"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Nova sessão: descreva a tarefa para o Claude Code no vault…"
        className="h-10 min-w-0 flex-1 bg-transparent text-sm placeholder:text-tinta-suave/70 focus-visible:outline-none"
      />
      <Button type="submit" tamanho="sm" disabled={!texto.trim() || perguntar.isPending}>
        <Play className="size-3.5" aria-hidden /> Iniciar
      </Button>
    </form>
  )
}

export function Terminais() {
  const { data: sessoes = [], isPending } = useSessoes()
  const [params, setParams] = useSearchParams()
  const escolhida = params.get('sessao')
  const ativa = sessoes.find((s) => s.id === escolhida) ?? sessoes[0]
  const selecionar = (id: string) => setParams({ sessao: id }, { replace: true })

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Terminais</h1>
        <p className="mt-1 text-tinta-suave">Sessões do Claude Code rodando no vault, ao vivo. Até 2 ao mesmo tempo; o resto espera na fila.</p>
      </header>
      <NovaSessao onCriada={selecionar} />

      {isPending ? (
        <p className="text-tinta-suave">carregando…</p>
      ) : sessoes.length === 0 ? (
        <EmptyState
          icone={<TerminalSquare />}
          cor="madeira"
          titulo="Nenhuma sessão ainda"
          descricao="Peça algo que exija trabalho no vault (no Chat ou aqui em cima) e a sessão aparece nesta tela."
        />
      ) : (
        <>
          <div role="tablist" aria-label="Sessões" className={cn(cavado, 'flex gap-1 overflow-x-auto rounded-pilula p-1.5')}>
            {sessoes.map((s) => {
              const selecionada = s.id === ativa?.id
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={selecionada}
                  onClick={() => selecionar(s.id)}
                  className={cn(
                    'flex max-w-56 shrink-0 cursor-pointer items-center gap-2 rounded-pilula px-4 py-1.5 text-sm font-semibold transition-[box-shadow,color] duration-150',
                    foco,
                    selecionada ? 'bg-pergaminho text-musgo-texto shadow-relevo-sm' : 'text-tinta-suave hover:text-tinta',
                  )}
                  title={`${s.tarefa} (${STATUS_SESSAO[s.status].texto})`}
                >
                  <span aria-hidden className={cn('size-2 shrink-0 rounded-pilula', solido[STATUS_SESSAO[s.status].cor])} />
                  <span className="truncate">{s.tarefa}</span>
                  <span className="sr-only">({STATUS_SESSAO[s.status].texto})</span>
                </button>
              )
            })}
          </div>
          {ativa && <SessaoTerminal key={ativa.id} sessaoId={ativa.id} inicial={ativa} altura="h-[28rem]" onContinuada={(nova) => selecionar(nova.id)} />}
        </>
      )}
    </div>
  )
}
