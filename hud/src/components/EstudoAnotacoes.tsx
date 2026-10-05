import { FileText, Paperclip, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import type { Anotacao } from '../lib/api'
import { cn } from '../lib/cn'
import { useEnviarMaterial, useRemoverAnotacao, useSalvarAnotacao } from '../lib/queries'
import { quandoRelativo } from '../lib/tempo'
import { Markdown } from './Markdown'
import { Badge, Button, Input, Modal, Textarea, Toggle, useToast } from './ui'
import { cavado, foco } from './ui/styles'

// ---------- anotações do usuário ----------

function ItemAnotacao({ materia, a }: { materia: string; a: Anotacao }) {
  const salvar = useSalvarAnotacao(materia)
  const remover = useRemoverAnotacao(materia)
  const toast = useToast()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(a.texto)
  const [titulo, setTitulo] = useState(a.titulo ?? '')
  const [confirmar, setConfirmar] = useState(false)

  function gravar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    salvar.mutate(
      { arquivo: a.arquivo, texto, titulo: a.topico && a.origem !== 'quiz' ? null : titulo },
      { onSuccess: () => setEditando(false), onError: (err) => toast('erro', err.message) },
    )
  }

  if (editando)
    return (
      <form onSubmit={gravar} className="animar-surgir flex flex-col gap-2 rounded-controle p-3 shadow-relevo-sm">
        {(!a.topico || a.origem === 'quiz') && <Input aria-label="Título" placeholder="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />}
        <Textarea rotulo="Anotação" value={texto} onChange={(e) => setTexto(e.target.value)} className="[&_label]:sr-only" />
        <div className="flex justify-end gap-2">
          <Button variante="fantasma" tamanho="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
          <Button type="submit" tamanho="sm" disabled={!texto.trim() || salvar.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    )

  return (
    <article className="group flex flex-col gap-2 rounded-controle p-3 shadow-relevo-sm">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {a.titulo && <h4 className="font-semibold">{a.titulo}</h4>}
          <span className="flex items-center gap-2 text-xs text-tinta-suave">
            {a.origem === 'quiz' && <Badge cor="sakura">do quiz</Badge>}
            {quandoRelativo(a.atualizado || a.criado)}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label="Editar anotação" onClick={() => setEditando(true)} className={cn('rounded-pilula p-1.5 text-tinta-suave hover:text-tinta hover:shadow-relevo-sm', foco)}>
            <Pencil className="size-3.5" />
          </button>
          {confirmar ? (
            <Button variante="fantasma" tamanho="sm" className="h-7 px-2 text-erro" onClick={() => remover.mutate(a.arquivo, { onError: (err) => toast('erro', err.message) })}>
              Excluir?
            </Button>
          ) : (
            <button type="button" aria-label="Excluir anotação" onClick={() => setConfirmar(true)} onBlur={() => setTimeout(() => setConfirmar(false), 200)} className={cn('rounded-pilula p-1.5 text-tinta-suave hover:text-erro hover:shadow-relevo-sm', foco)}>
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      </header>
      <Markdown texto={a.texto} className="text-sm" />
    </article>
  )
}

/** Anotações do usuário: de um tópico (`topico`) ou gerais da matéria. Markdown simples. */
export function Anotacoes({ materia, itens, topico }: { materia: string; itens: Anotacao[]; topico?: string }) {
  const salvar = useSalvarAnotacao(materia)
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [titulo, setTitulo] = useState('')
  const [aberto, setAberto] = useState(false)

  function adicionar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    salvar.mutate(
      { texto, titulo: topico ? null : titulo || null, topico: topico ?? null },
      {
        onSuccess: () => {
          setTexto('')
          setTitulo('')
          setAberto(false)
        },
        onError: (err) => toast('erro', err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {aberto ? (
        <form onSubmit={adicionar} className="animar-surgir flex flex-col gap-2">
          {!topico && <Input aria-label="Título" placeholder="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />}
          <textarea
            autoFocus
            aria-label="Nova anotação"
            placeholder={topico ? 'O que você quer lembrar sobre este tópico? (Markdown)' : 'Anotação livre sobre a matéria (Markdown)'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={cn(cavado, 'min-h-28 w-full resize-y rounded-controle px-4 py-3 text-sm placeholder:text-tinta-suave/70', foco)}
          />
          <div className="flex justify-end gap-2">
            <Button variante="fantasma" tamanho="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" tamanho="sm" disabled={!texto.trim() || salvar.isPending}>
              Salvar anotação
            </Button>
          </div>
        </form>
      ) : (
        <Button variante="secundario" tamanho="sm" className="self-start" onClick={() => setAberto(true)}>
          <Plus className="size-3.5" aria-hidden /> Nova anotação
        </Button>
      )}
      {itens.length === 0 && !aberto && <p className="text-sm text-tinta-suave">Nenhuma anotação ainda.</p>}
      <div className="flex flex-col gap-2">
        {itens.map((a) => (
          <ItemAnotacao key={a.arquivo} materia={materia} a={a} />
        ))}
      </div>
    </div>
  )
}

// ---------- envio de material ----------

const ACEITOS = '.pdf,.md,.txt,.docx,.png,.jpg,.jpeg,.webp,.csv,.html'

/** Modal para mandar documentos e/ou texto: guarda em _fontes/ e o Gandalf estrutura em tópicos. */
export function EnviarMaterial({
  materia,
  topico,
  tituloTopico,
  aberto,
  onClose,
}: {
  materia: string
  topico?: string
  tituloTopico?: string
  aberto: boolean
  onClose: () => void
}) {
  const enviar = useEnviarMaterial(materia)
  const toast = useToast()
  const navigate = useNavigate()
  const entrada = useRef<HTMLInputElement>(null)
  const [arquivos, setArquivos] = useState<File[]>([])
  const [texto, setTexto] = useState('')
  const [estruturar, setEstruturar] = useState(true)
  const vazio = arquivos.length === 0 && !texto.trim()

  function mandar() {
    if (vazio) return
    enviar.mutate(
      { arquivos, texto, topico, estruturar },
      {
        onSuccess: (r) => {
          setArquivos([])
          setTexto('')
          onClose()
          if (r.sessao) {
            toast('sucesso', 'Material recebido. O Gandalf está estruturando (acompanhe em Terminais).')
            navigate(`/terminais?sessao=${r.sessao.id}`)
          } else toast('sucesso', `Material guardado (${r.fontes.length} arquivo[s])`)
        },
        onError: (err) => toast('erro', err.message),
      },
    )
  }

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo={tituloTopico ? `Material para: ${tituloTopico}` : 'Enviar material'}
      icone={<Upload />}
      cor="sakura"
      rodape={
        <>
          <Button variante="fantasma" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={mandar} disabled={vazio || enviar.isPending}>
            <Upload className="size-4" aria-hidden /> {estruturar ? 'Enviar e estruturar' : 'Só guardar'}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto p-1">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Documentos</span>
          <input
            ref={entrada}
            type="file"
            multiple
            accept={ACEITOS}
            className="sr-only"
            onChange={(e) => {
              setArquivos((atual) => [...atual, ...Array.from(e.target.files ?? [])].slice(0, 10))
              e.target.value = ''
            }}
          />
          <Button variante="secundario" tamanho="sm" className="self-start" onClick={() => entrada.current?.click()}>
            <Paperclip className="size-3.5" aria-hidden /> Escolher arquivos
          </Button>
          <p className="text-xs text-tinta-suave">PDF, Word, texto, Markdown ou imagem (até 10 arquivos, 25 MB cada).</p>
          {arquivos.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {arquivos.map((a, i) => (
                <li key={`${a.name}-${i}`} className="flex items-center gap-2 rounded-controle px-3 py-1.5 text-sm shadow-cavado-sm">
                  <FileText className="size-4 shrink-0 text-tinta-suave" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-tinta-suave">{Math.max(1, Math.round(a.size / 1024))} KB</span>
                  <button type="button" aria-label={`Remover ${a.name}`} onClick={() => setArquivos((x) => x.filter((_, j) => j !== i))} className={cn('rounded-pilula p-1 text-tinta-suave hover:text-erro', foco)}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Textarea rotulo="Ou cole um texto" placeholder="Anotações de aula, trecho de livro, transcrição…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Toggle ligado={estruturar} onChange={setEstruturar} mostrarRotulo rotulo="Estruturar com o Gandalf" />
        <p className="text-xs text-tinta-suave">
          {estruturar
            ? `O Gandalf lê o material e ${topico ? 'acrescenta ao tópico (ou cria tópicos novos se for outro assunto)' : 'acrescenta aos tópicos que já existem ou cria tópicos novos'}, explicando o conteúdo novo. Usa a sua cota do Claude.`
            : 'O material só fica guardado na matéria (pasta _fontes/), sem IA.'}
        </p>
      </div>
    </Modal>
  )
}
