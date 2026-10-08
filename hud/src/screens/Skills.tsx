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
import { Badge, BentoGrid, BentoItem, Button, Card, EmptyState, Modal, Textarea, useToast, type Color } from '../components/ui'
import type { Skill } from '../lib/api'
import { useRunSkill, useSkills, useAgent } from '../lib/queries'
import { relativeTime } from '../lib/time'

const LOOK: Record<string, { icon: ReactNode; color: Color }> = {
  'compile-raw': { icon: <Inbox />, color: 'primary' },
  'daily-summary': { icon: <Sun />, color: 'gold' },
  'sync-calendar': { icon: <CalendarSync />, color: 'silver' },
  'plan-week': { icon: <CalendarRange />, color: 'wood' },
  'prepare-studies': { icon: <BookOpen />, color: 'violet' },
  'answer-from-memory': { icon: <MessageSquareText />, color: 'primary-light' },
}
const DEFAULT = { icon: <Wand2 />, color: 'primary' as Color }

const STATUS_COLOR: Record<string, Color> = { ok: 'primary', error: 'ember', cancelled: 'wood', timed_out: 'ember' }

function SkillCard({ skill, onRun }: { skill: Skill; onRun: () => void }) {
  const look = LOOK[skill.name] ?? DEFAULT
  const last = skill.last_run
  return (
    <Card className="h-full justify-between" title={skill.name} icon={look.icon} color={look.color}>
      <p className="line-clamp-4 text-sm text-ink-muted">{skill.description || 'No description.'}</p>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-ink-muted">
          {last?.at ? (
            <span className="flex items-center gap-2">
              <Badge color={STATUS_COLOR[last.status] ?? 'silver'}>{last.status}</Badge>
              {relativeTime(last.at)}
            </span>
          ) : (
            'never run'
          )}
        </div>
        <Button size="sm" onClick={onRun}>
          <Play className="size-3.5" aria-hidden /> Run
        </Button>
      </div>
    </Card>
  )
}

export function Skills() {
  const agentName = useAgent().name
  const { data: skills = [], isPending, error } = useSkills()
  const run = useRunSkill()
  const toast = useToast()
  const navigate = useNavigate()
  const [chosen, setChosen] = useState<Skill | null>(null)
  const [instruction, setInstruction] = useState('')

  function confirm() {
    if (!chosen) return
    run.mutate(
      { name: chosen.name, instruction },
      {
        onSuccess: (session) => {
          setChosen(null)
          setInstruction('')
          toast('success', `${chosen.name} started`)
          navigate(`/terminals?session=${session.id}`)
        },
        onError: (err) => toast('error', err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Skills</h1>
        <p className="mt-1 text-ink-muted">
          Claude Code recipes in the project's <code className="font-mono text-sm">skills/</code> folder. {agentName} picks them by itself
          and can create or edit them (just ask). Each run opens a session in Terminals.
        </p>
      </header>
      {isPending ? (
        <p className="text-ink-muted">loading…</p>
      ) : error ? (
        <p role="alert" className="font-semibold text-danger">{error.message}</p>
      ) : skills.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="No skills found" description="The skills/ folder at the project root is missing or empty." />
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {skills.map((s) => (
            <BentoItem key={s.name}>
              <SkillCard skill={s} onRun={() => setChosen(s)} />
            </BentoItem>
          ))}
        </BentoGrid>
      )}

      <Modal
        open={chosen !== null}
        onClose={() => setChosen(null)}
        title={`Run ${chosen?.name ?? ''}`}
        icon={chosen ? (LOOK[chosen.name] ?? DEFAULT).icon : undefined}
        color={chosen ? (LOOK[chosen.name] ?? DEFAULT).color : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setChosen(null)}>
              Cancel
            </Button>
            <Button onClick={confirm} disabled={run.isPending}>
              <Play className="size-3.5" aria-hidden /> Run
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">{chosen?.description}</p>
          <Textarea
            label="Extra instructions (optional)"
            placeholder="E.g.: focus on Calculus II"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            hint="Uses your Claude plan's quota."
          />
        </div>
      </Modal>
    </div>
  )
}
