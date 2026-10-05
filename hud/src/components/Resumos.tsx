import { Archive, ListPlus, MailOpen, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Efemero } from '../lib/api'
import { cn } from '../lib/cn'
import { useDescartarEfemero, useEfemeros, useGuardarEfemero } from '../lib/queries'
import { quandoRelativo } from '../lib/tempo'
import { AcoesPesquisa } from './ResultadoPesquisa'
import { TextoGandalf } from './TextoGandalf'
import { Badge, Button, Card, useToast } from './ui'
import { cavado } from './ui/styles'

function ItemResumo({ e }: { e: Efemero }) {
  const guardar = useGuardarEfemero()
  const descartar = useDescartarEfemero()
  const toast = useToast()
  const [tarefa, setTarefa] = useState<string | null>(null)

  function criarTarefa(ev: FormEvent) {
    ev.preventDefault()
    if (!tarefa?.trim()) return
    guardar.mutate(
      { id: e.id, destino: 'tarefa', texto: tarefa.trim() },
      {
        onSuccess: () => {
          setTarefa(null)
          toast('sucesso', 'Tarefa criada em vida/tarefas.md')
        },
        onError: (err) => toast('erro', err.message),
      },
    )
  }

  return (
    <article className="flex flex-col gap-3 rounded-controle p-4 shadow-relevo-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{e.titulo}</h4>
        <span className="text-xs text-tinta-suave">
          {quandoRelativo(e.quando)} · some {quandoRelativo(e.expira)}
        </span>
      </header>
      <TextoGandalf texto={e.texto} />
      {tarefa !== null && (
        <form onSubmit={criarTarefa} className={cn(cavado, 'flex items-center gap-2 rounded-pilula py-1 pr-1 pl-4')}>
          <input
            autoFocus
            aria-label="Texto da nova tarefa"
            value={tarefa}
            onChange={(ev) => setTarefa(ev.target.value)}
            placeholder="O que fazer…"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-tinta-suave/70 focus-visible:outline-none"
          />
          <Button type="submit" tamanho="sm" disabled={!tarefa.trim() || guardar.isPending}>
            Criar
          </Button>
        </form>
      )}
      {e.pesquisa ? (
        <AcoesPesquisa e={e} />
      ) : (
      <div className="flex flex-wrap gap-2">
        <Button variante="secundario" tamanho="sm" onClick={() => setTarefa((t) => (t === null ? '' : null))}>
          <ListPlus className="size-3.5" aria-hidden /> Virar tarefa
        </Button>
        <Button
          variante="secundario"
          tamanho="sm"
          disabled={guardar.isPending}
          onClick={() =>
            guardar.mutate(
              { id: e.id, destino: 'raw' },
              { onSuccess: (r) => toast('sucesso', `Guardado em ${r.arquivo}`), onError: (err) => toast('erro', err.message) },
            )
          }
        >
          <Archive className="size-3.5" aria-hidden /> Guardar no vault
        </Button>
        <Button
          variante="fantasma"
          tamanho="sm"
          disabled={descartar.isPending}
          onClick={() => descartar.mutate(e.id, { onError: (err) => toast('erro', err.message) })}
        >
          <Trash2 className="size-3.5" aria-hidden /> Descartar
        </Button>
      </div>
      )}
    </article>
  )
}

/** Card "Resumos de hoje": saídas efêmeras (não ficam no vault). Some quando não há nada. */
export function Resumos() {
  const { data: itens = [] } = useEfemeros()
  if (itens.length === 0) return null
  return (
    <Card
      titulo="Resumos de hoje"
      subtitulo="ficam só aqui (resumos 48 h, pesquisas 7 dias); guarde o que importar"
      icone={<MailOpen />}
      cor="ardosia"
      acoes={<Badge cor="ardosia">{itens.length}</Badge>}
    >
      <div className="flex flex-col gap-4">
        {itens.map((e) => (
          <ItemResumo key={e.id} e={e} />
        ))}
      </div>
    </Card>
  )
}
