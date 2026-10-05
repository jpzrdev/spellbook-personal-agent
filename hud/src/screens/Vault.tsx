import { ChevronRight, FileText, Folder, FolderOpen, Library } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Markdown } from '../components/Markdown'
import { Card, EmptyState, Pill, SearchInput } from '../components/ui'
import { foco } from '../components/ui/styles'
import type { NoArvore } from '../lib/api'
import { cn } from '../lib/cn'
import { useArvore, useNota } from '../lib/queries'

function filtrar(nos: NoArvore[], termo: string): NoArvore[] {
  if (!termo) return nos
  const t = termo.toLowerCase()
  return nos.flatMap((n) => {
    if (n.tipo === 'arquivo') return n.caminho.toLowerCase().includes(t) ? [n] : []
    const filhos = filtrar(n.filhos ?? [], termo)
    return filhos.length ? [{ ...n, filhos }] : []
  })
}

function Ramo({ nos, aberta, onAbrir, nivel, expandir }: { nos: NoArvore[]; aberta: string | null; onAbrir: (c: string) => void; nivel: number; expandir: boolean }) {
  return (
    <ul className={cn('flex flex-col', nivel > 0 && 'ml-3 border-l border-sombra/40 pl-2')}>
      {nos.map((n) => (n.tipo === 'pasta' ? <Pasta key={n.caminho} no={n} aberta={aberta} onAbrir={onAbrir} nivel={nivel} expandir={expandir} /> : (
        <li key={n.caminho}>
          <button
            type="button"
            onClick={() => onAbrir(n.caminho)}
            aria-current={aberta === n.caminho ? 'page' : undefined}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-sm',
              foco,
              aberta === n.caminho ? 'font-semibold text-musgo-texto shadow-cavado-sm' : 'text-tinta hover:bg-tinta/5',
            )}
          >
            <FileText className="size-3.5 shrink-0 text-tinta-suave" aria-hidden />
            <span className="truncate">{n.nome.replace(/\.md$/, '')}</span>
          </button>
        </li>
      )))}
    </ul>
  )
}

function Pasta({ no, aberta, onAbrir, nivel, expandir }: { no: NoArvore; aberta: string | null; onAbrir: (c: string) => void; nivel: number; expandir: boolean }) {
  const contemAberta = aberta?.startsWith(no.caminho + '/') ?? false
  const [aberto, setAberto] = useState(contemAberta || nivel === 0 && ['vida', 'wiki'].includes(no.nome))
  const mostrar = expandir || aberto || contemAberta
  return (
    <li>
      <button
        type="button"
        aria-expanded={mostrar}
        onClick={() => setAberto(!mostrar)}
        className={cn('flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm font-semibold hover:bg-tinta/5', foco)}
      >
        <ChevronRight className={cn('size-3.5 shrink-0 text-tinta-suave transition-transform', mostrar && 'rotate-90')} aria-hidden />
        {mostrar ? <FolderOpen className="size-4 text-ocre" aria-hidden /> : <Folder className="size-4 text-ocre" aria-hidden />}
        <span className="truncate">{no.nome}</span>
      </button>
      {mostrar && no.filhos && <Ramo nos={no.filhos} aberta={aberta} onAbrir={onAbrir} nivel={nivel + 1} expandir={expandir} />}
    </li>
  )
}

function Leitor({ caminho }: { caminho: string }) {
  const { data, isPending, error } = useNota(caminho)
  if (isPending) return <p className="text-tinta-suave">carregando…</p>
  if (error) return <p role="alert" className="font-semibold text-erro">{error.message}</p>
  if (data.binario) return <p className="text-tinta-suave">Arquivo binário ({Math.round(data.tamanho / 1024)} KB): abra no Obsidian.</p>
  const meta = Object.entries(data.metadados)
  return (
    <article className="flex flex-col gap-4">
      {meta.length > 0 && (
        <dl className="flex flex-wrap gap-2" aria-label="Propriedades">
          {meta.map(([k, v]) => (
            <Pill key={k}>
              <dt className="font-semibold">{k}:</dt>
              <dd className="max-w-64 truncate">{Array.isArray(v) ? v.join(', ') : String(v ?? '—')}</dd>
            </Pill>
          ))}
        </dl>
      )}
      <Markdown texto={data.texto ?? ''} />
    </article>
  )
}

export function Vault() {
  const { data: arvore = [], isPending } = useArvore()
  const [params, setParams] = useSearchParams()
  const [termo, setTermo] = useState('')
  const nota = params.get('nota')
  const abrir = (caminho: string) => setParams({ nota: caminho })
  const visiveis = filtrar(arvore, termo.trim())

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Vault</h1>
        <p className="mt-1 text-tinta-suave">Suas notas, só para leitura. Para editar, use o Obsidian.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:self-start" titulo="Pastas" icone={<Library />} cor="ocre">
          <SearchInput rotulo="Filtrar arquivos" placeholder="Filtrar…" value={termo} onChange={(e) => setTermo(e.target.value)} />
          <nav aria-label="Arquivos do vault" className="max-h-72 overflow-y-auto lg:max-h-none">
            {isPending ? <p className="text-sm text-tinta-suave">carregando…</p> : <Ramo nos={visiveis} aberta={nota} onAbrir={abrir} nivel={0} expandir={termo.trim() !== ''} />}
          </nav>
        </Card>
        <Card titulo={nota ? nota.split('/').pop()?.replace(/\.md$/, '') : 'Nenhuma nota aberta'} subtitulo={nota ?? undefined} icone={<FileText />} cor="musgo">
          {nota ? <Leitor caminho={nota} /> : <EmptyState icone={<FileText />} titulo="Escolha uma nota" descricao="Abra um arquivo na árvore ao lado." className="py-8" />}
        </Card>
      </div>
    </div>
  )
}
