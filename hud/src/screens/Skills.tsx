import {
  BookOpen,
  CalendarRange,
  CalendarSync,
  Inbox,
  MessageSquareText,
  Play,
  Sparkles,
  Sun,
  Wand2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Badge, BentoGrid, BentoItem, Button, Card, EmptyState, Modal, Textarea, useToast, type Cor } from '../components/ui'
import type { Skill } from '../lib/api'
import { useExecutarSkill, useSkills } from '../lib/queries'
import { quandoRelativo } from '../lib/tempo'

const VISUAL: Record<string, { icone: ReactNode; cor: Cor }> = {
  'compilar-raw': { icone: <Inbox />, cor: 'musgo' },
  'resumo-do-dia': { icone: <Sun />, cor: 'ocre' },
  'sincronizar-agenda': { icone: <CalendarSync />, cor: 'ardosia' },
  'planejar-semana': { icone: <CalendarRange />, cor: 'madeira' },
  'revisar-estudos': { icone: <BookOpen />, cor: 'sakura' },
  'responder-com-vault': { icone: <MessageSquareText />, cor: 'musgo-claro' },
}
const PADRAO = { icone: <Wand2 />, cor: 'musgo' as Cor }

const STATUS_COR: Record<string, Cor> = { ok: 'musgo', erro: 'terracota', cancelada: 'madeira', tempo_esgotado: 'terracota' }

function CartaoSkill({ skill, onExecutar }: { skill: Skill; onExecutar: () => void }) {
  const v = VISUAL[skill.nome] ?? PADRAO
  const ultima = skill.ultima_execucao
  return (
    <Card className="h-full justify-between" titulo={skill.nome} icone={v.icone} cor={v.cor}>
      <p className="line-clamp-4 text-sm text-tinta-suave">{skill.descricao || 'Sem descrição.'}</p>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-tinta-suave">
          {ultima?.quando ? (
            <span className="flex items-center gap-2">
              <Badge cor={STATUS_COR[ultima.status] ?? 'ardosia'}>{ultima.status}</Badge>
              {quandoRelativo(ultima.quando)}
            </span>
          ) : (
            'nunca executada'
          )}
        </div>
        <Button tamanho="sm" onClick={onExecutar}>
          <Play className="size-3.5" aria-hidden /> Executar
        </Button>
      </div>
    </Card>
  )
}

export function Skills() {
  const { data: skills = [], isPending, error } = useSkills()
  const executar = useExecutarSkill()
  const toast = useToast()
  const navigate = useNavigate()
  const [escolhida, setEscolhida] = useState<Skill | null>(null)
  const [instrucao, setInstrucao] = useState('')

  function confirmar() {
    if (!escolhida) return
    executar.mutate(
      { nome: escolhida.nome, instrucao },
      {
        onSuccess: (sessao) => {
          setEscolhida(null)
          setInstrucao('')
          toast('sucesso', `/${escolhida.nome} iniciada`)
          navigate(`/terminais?sessao=${sessao.id}`)
        },
        onError: (err) => toast('erro', err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Skills</h1>
        <p className="mt-1 text-tinta-suave">
          Receitas do Claude Code em <code className="font-mono text-sm">vault/.claude/skills/</code>. Cada execução abre uma sessão em Terminais.
        </p>
      </header>
      {isPending ? (
        <p className="text-tinta-suave">carregando…</p>
      ) : error ? (
        <p role="alert" className="font-semibold text-erro">{error.message}</p>
      ) : skills.length === 0 ? (
        <EmptyState icone={<Sparkles />} titulo="Nenhuma skill no vault" descricao="Rode o setup do vault para copiar as skills iniciais." />
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {skills.map((s) => (
            <BentoItem key={s.nome}>
              <CartaoSkill skill={s} onExecutar={() => setEscolhida(s)} />
            </BentoItem>
          ))}
        </BentoGrid>
      )}

      <Modal
        aberto={escolhida !== null}
        onClose={() => setEscolhida(null)}
        titulo={`Executar /${escolhida?.nome ?? ''}`}
        icone={escolhida ? (VISUAL[escolhida.nome] ?? PADRAO).icone : undefined}
        cor={escolhida ? (VISUAL[escolhida.nome] ?? PADRAO).cor : undefined}
        rodape={
          <>
            <Button variante="fantasma" onClick={() => setEscolhida(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={executar.isPending}>
              <Play className="size-3.5" aria-hidden /> Executar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tinta-suave">{escolhida?.descricao}</p>
          <Textarea
            rotulo="Instruções extras (opcional)"
            placeholder="Ex.: foque em Cálculo II"
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            dica="Usa o limite do seu plano Claude Pro."
          />
        </div>
      </Modal>
    </div>
  )
}
