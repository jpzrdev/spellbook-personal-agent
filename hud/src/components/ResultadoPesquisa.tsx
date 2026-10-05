import { BookMarked, ChevronDown, Globe, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Efemero } from '../lib/api'
import { cn } from '../lib/cn'
import { useDescartarEfemero, useEfemero, useGuardarPesquisa, useSessoes } from '../lib/queries'
import { STATUS_SESSAO } from '../lib/sessoes'
import { Markdown } from './Markdown'
import { Badge, Button, useToast } from './ui'
import { foco } from './ui/styles'

/** Botões do resultado de uma pesquisa: guardar organizado na Biblioteca (outra sessão, sem web) ou descartar. */
export function AcoesPesquisa({ e, onDescartado }: { e: Efemero; onDescartado?: () => void }) {
  const guardar = useGuardarPesquisa()
  const descartar = useDescartarEfemero()
  const { data: sessoes } = useSessoes()
  const toast = useToast()
  const [sessaoId, setSessaoId] = useState<string | null>(null)
  const sessao = sessaoId ? sessoes?.find((s) => s.id === sessaoId) : undefined

  if (sessaoId)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <BookMarked className="size-4 text-musgo" aria-hidden />
        {sessao?.status === 'ok' ? (
          <>
            <span className="font-semibold">Guardado na Biblioteca.</span>
            <Link to="/biblioteca" className={cn('font-semibold text-musgo-texto underline underline-offset-2', foco)}>
              abrir
            </Link>
          </>
        ) : sessao && sessao.status !== 'fila' && sessao.status !== 'rodando' ? (
          <Badge cor={STATUS_SESSAO[sessao.status].cor}>{STATUS_SESSAO[sessao.status].texto}</Badge>
        ) : (
          <span className="text-tinta-suave">organizando no vault…</span>
        )}
        <Link to={`/terminais?sessao=${sessaoId}`} className={cn('text-xs font-semibold text-tinta-suave', foco)}>
          ver sessão
        </Link>
      </div>
    )

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        tamanho="sm"
        disabled={guardar.isPending}
        onClick={() =>
          guardar.mutate(e.id, {
            onSuccess: (s) => {
              setSessaoId(s.id)
              toast('info', `Organizando "${e.pesquisa?.tema}" na Biblioteca…`)
            },
            onError: (err) => toast('erro', err.message),
          })
        }
      >
        <Save className="size-3.5" aria-hidden /> {e.pesquisa?.slug ? 'Atualizar na Biblioteca' : 'Guardar no vault'}
      </Button>
      <Button
        variante="fantasma"
        tamanho="sm"
        disabled={descartar.isPending}
        onClick={() => descartar.mutate(e.id, { onSuccess: onDescartado, onError: (err) => toast('erro', err.message) })}
      >
        <Trash2 className="size-3.5" aria-hidden /> Descartar
      </Button>
    </div>
  )
}

/** Resultado de pesquisa dentro do chat: aparece quando a sessão termina; dá para guardar ou descartar. */
export function ResultadoPesquisa({ sessaoId }: { sessaoId: string }) {
  const { data: sessoes } = useSessoes()
  const sessao = sessoes?.find((s) => s.id === sessaoId)
  const { data: e, isError } = useEfemero(sessao?.efemero_id)
  const [aberto, setAberto] = useState(true)
  const [descartado, setDescartado] = useState(false)

  if (!sessao || sessao.status === 'fila' || sessao.status === 'rodando')
    return (
      <p className="flex items-center gap-2 text-sm text-tinta-suave">
        <Globe className="size-4 animate-pulse" aria-hidden /> pesquisando na web… (pode levar um ou dois minutos)
      </p>
    )
  if (descartado) return <p className="text-sm text-tinta-suave">Pesquisa descartada.</p>
  if (sessao.status !== 'ok' || isError || !e)
    return <p className="text-sm text-tinta-suave">{sessao.status === 'ok' ? 'O resultado já foi guardado ou expirou.' : `A pesquisa não terminou (${STATUS_SESSAO[sessao.status].texto}).`}</p>

  return (
    <div className="flex flex-col gap-3 rounded-controle p-3 shadow-cavado-sm">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={cn('flex cursor-pointer items-center gap-2 text-left text-sm font-semibold text-musgo-texto', foco)}
      >
        <Globe className="size-4" aria-hidden /> {e.pesquisa?.tema ?? e.titulo}
        <ChevronDown className={cn('size-4 transition-transform', aberto && 'rotate-180')} aria-hidden />
      </button>
      {aberto && <Markdown texto={e.texto} className="max-h-[50vh] overflow-y-auto pr-1 text-sm" />}
      <AcoesPesquisa e={e} onDescartado={() => setDescartado(true)} />
    </div>
  )
}
