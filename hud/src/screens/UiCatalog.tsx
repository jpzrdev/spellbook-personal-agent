import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  Inbox,
  ListChecks,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Repeat,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  Badge,
  BentoGrid,
  BentoItem,
  Button,
  Card,
  Checkbox,
  Dropdown,
  EmptyState,
  IconChip,
  Input,
  Modal,
  Orb,
  Pill,
  ProgressBar,
  SearchInput,
  Tabs,
  TerminalPane,
  TierBadge,
  Toggle,
  ToastView,
  useToast,
  type ButtonVariant,
  type Color,
} from '../components/ui'
import { solid, sunken } from '../components/ui/styles'
import { cn } from '../lib/cn'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{label}</span>
      <div className="flex flex-wrap items-center gap-5">{children}</div>
    </div>
  )
}

const variants: ButtonVariant[] = ['primary', 'secondary', 'accent', 'ghost']
const colors: Array<{ color: Color; use: string }> = [
  { color: 'primary', use: 'action · success · Gandalf' },
  { color: 'primary-light', use: 'Tier 1' },
  { color: 'wood', use: 'accent · Tier 3' },
  { color: 'gold', use: 'attention · today · Tier 2' },
  { color: 'ember', use: 'danger · error' },
  { color: 'violet', use: 'studies' },
  { color: 'silver', use: 'information' },
]

/** A sample composition in a bento grid (a sketch of the Today screen). */
function BentoExample() {
  const [routines, setRoutines] = useState({ morning: true, night: false })
  const agenda = [
    { start: '09:00', end: '10:30', title: 'Calculus II lecture', location: 'Room 204', color: 'violet' as Color },
    { start: '14:00', end: '', title: 'Dentist', location: '', color: 'silver' as Color },
    { start: '19:30', end: '20:30', title: 'Review: limits', location: '', color: 'violet' as Color },
  ]
  return (
    <BentoGrid>
      <BentoItem col={2} row={2}>
        <Card
          className="h-full"
          title="Today's agenda"
          subtitle="Friday, October 3"
          icon={<CalendarDays />}
          color="gold"
          actions={
            <Button variant="icon" size="sm" aria-label="Open agenda">
              <ArrowUpRight className="size-4" />
            </Button>
          }
        >
          <ol className="flex flex-col gap-3">
            {agenda.map((e) => (
              <li key={e.start} className="flex items-center gap-4 rounded-control p-3 shadow-raised-sm">
                <span className="w-12 text-sm font-semibold tabular-nums">{e.start}</span>
                <span aria-hidden className={cn('h-9 w-1 rounded-pill', solid[e.color])} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.title}</p>
                  <p className="text-xs text-ink-muted">
                    {e.end ? `until ${e.end}` : 'scheduled time'}
                    {e.location && ` · ${e.location}`}
                  </p>
                </div>
                <ChevronRight aria-hidden className="size-4 text-ink-muted" />
              </li>
            ))}
          </ol>
        </Card>
      </BentoItem>

      <BentoItem>
        <Card className="h-full justify-between" title="Tasks" subtitle="open" icon={<ListChecks />} color="primary">
          <p className="font-display text-5xl font-normal">7</p>
          <Badge color="gold">2 for today</Badge>
        </Card>
      </BentoItem>

      <BentoItem>
        <Card className="h-full justify-between" title="Reviews" subtitle="pending" icon={<BookOpen />} color="violet">
          <p className="font-display text-5xl font-normal">12</p>
          <ProgressBar label="Calculus II" value={64} color="violet" />
        </Card>
      </BentoItem>

      <BentoItem col={2}>
        <Card
          className="h-full"
          title="3 priorities"
          icon={<Sparkles />}
          color="primary"
          actions={
            <Button variant="icon" size="sm" aria-label="More options">
              <MoreVertical className="size-4" />
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <Checkbox label="Calculus problem set 3" strikethrough />
            <Checkbox label="Pay the electricity bill" strikethrough />
            <Checkbox label="Fill in the profile in the memory" strikethrough defaultChecked />
          </div>
        </Card>
      </BentoItem>

      <BentoItem>
        <Card className="h-full" title="Morning" subtitle="Mon–Fri at 06:50" icon={<Repeat />} color="wood">
          <Toggle on={routines.morning} onChange={(v) => setRoutines((r) => ({ ...r, morning: v }))} label="Morning routine active" />
        </Card>
      </BentoItem>
      <BentoItem>
        <Card className="h-full" title="Night" subtitle="every day at 23:00" icon={<Clock />} color="wood">
          <Toggle on={routines.night} onChange={(v) => setRoutines((r) => ({ ...r, night: v }))} label="Night routine active" />
        </Card>
      </BentoItem>

      <BentoItem col={2}>
        <div
          className={cn(
            sunken,
            'flex h-full items-center gap-3 rounded-card p-3',
            'focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-primary',
          )}
        >
          <IconChip color="primary">
            <Inbox />
          </IconChip>
          <input
            aria-label="Quick capture to raw/"
            placeholder="Jot down anything… it goes to raw/"
            className="h-11 min-w-0 flex-1 bg-transparent px-2 placeholder:text-ink-muted/70 focus-visible:outline-none"
          />
          <Button size="sm">Save</Button>
        </div>
      </BentoItem>
    </BentoGrid>
  )
}

/** The living catalog of the design system. */
export function UiCatalog() {
  const toast = useToast()
  const [tab, setTab] = useState('today')
  const [on, setOn] = useState(true)
  const [modal, setModal] = useState(false)
  const [progress, setProgress] = useState(40)

  return (
    <div className="flex flex-col gap-14">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Design system</h1>
        <p className="mt-2 text-ink-muted">
          "Grey" neumorphism: stone, midnight blue and the staff's wood. Hover, click and use Tab.
        </p>
      </header>

      <Section title="Bento grid (example)">
        <BentoExample />
      </Section>

      <Section title="Colors">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-7">
          {colors.map(({ color, use }) => (
            <div key={color} className="flex flex-col items-center gap-2 text-center">
              <span className={cn('size-14 rounded-pill shadow-raised-sm', solid[color])} aria-hidden />
              <span className="text-sm font-semibold">{color}</span>
              <span className="text-xs text-ink-muted">{use}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex h-20 items-center justify-center rounded-card text-sm font-semibold shadow-raised">
            raised
          </div>
          <div className={cn(sunken, 'flex h-20 items-center justify-center rounded-card text-sm font-semibold')}>
            sunken
          </div>
        </div>
      </Section>

      <Section title="Button">
        <Row label="variants">
          {variants.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </Row>
        <Row label="sizes">
          <Button size="sm">small</Button>
          <Button size="md">medium</Button>
          <Button size="lg">large</Button>
        </Row>
        <Row label="with icon · icon · disabled">
          <Button variant="accent">
            <Play className="size-4" aria-hidden /> Run
          </Button>
          <Button variant="icon" aria-label="Add">
            <Plus className="size-5" />
          </Button>
          <Button variant="icon" size="sm" aria-label="Settings">
            <Settings className="size-4" />
          </Button>
          <Button disabled>disabled</Button>
          <Button variant="secondary" disabled>
            secondary off
          </Button>
        </Row>
      </Section>

      <Section title="Badge · Pill · Tier · IconChip">
        <Row label="badges">
          <Badge color="gold">today</Badge>
          <Badge color="ember">overdue</Badge>
          <Badge color="primary">ok</Badge>
          <Badge color="silver">info</Badge>
          <Badge color="violet">studies</Badge>
        </Row>
        <Row label="pills">
          <Pill>#personal</Pill>
          <Pill>#studies/calculus</Pill>
          <Pill>⏫ high</Pill>
        </Row>
        <Row label="Gandalf's tiers">
          <TierBadge tier={1} />
          <TierBadge tier={2} />
          <TierBadge tier={3} />
        </Row>
        <Row label="icon chips">
          <IconChip size="sm" color="primary">
            <Sparkles />
          </IconChip>
          <IconChip color="gold">
            <CalendarDays />
          </IconChip>
          <IconChip size="lg" color="violet">
            <BookOpen />
          </IconChip>
          <IconChip sunken color="wood">
            <Repeat />
          </IconChip>
        </Row>
      </Section>

      <Section title="Card">
        <div className="grid gap-6 md:grid-cols-3">
          <Card title="Title only">A simple raised card.</Card>
          <Card
            title="AI Analytics"
            subtitle="today's usage"
            icon={<Sparkles />}
            color="primary"
            actions={
              <Button variant="icon" size="sm" aria-label="Open">
                <ArrowUpRight className="size-4" />
              </Button>
            }
          >
            With an icon chip, a subtitle and an action in the corner.
          </Card>
          <Card>A card without a header.</Card>
        </div>
      </Section>

      <Section title="Tabs">
        <div>
          <Tabs
            label="Tabs example"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
            ]}
          />
        </div>
        <p className="text-sm text-ink-muted">
          Active tab: <strong className="text-ink">{tab}</strong> (use ← → with focus on the tabs)
        </p>
      </Section>

      <Section title="Toggle · Checkbox">
        <Row label="toggle">
          <Toggle on={on} onChange={setOn} label="Routine active" showLabel />
          <Toggle on={false} onChange={() => {}} label="Off" showLabel />
          <Toggle on onChange={() => {}} label="Disabled" showLabel disabled />
        </Row>
        <Row label="checkbox">
          <Checkbox label="Calculus problem set 3" strikethrough />
          <Checkbox label="Already done" strikethrough defaultChecked />
          <Checkbox label="Disabled" disabled />
        </Row>
      </Section>

      <Section title="Input · SearchInput">
        <div className="grid gap-6 md:grid-cols-3">
          <Input label="New task" placeholder="E.g.: pay the electricity bill" hint="Enter to add" />
          <Input label="With an error" defaultValue="02/31" error="Invalid date" />
          <Input label="Disabled" placeholder="…" disabled />
        </div>
        <SearchInput label="Search the memory" placeholder="Search the memory…" className="max-w-md" />
      </Section>

      <Section title="Dropdown / Menu">
        <Row label="menu">
          <Dropdown
            label="Actions"
            items={[
              { id: 'edit', label: 'Edit', icon: <Pencil className="size-4" />, onSelect: () => toast('info', 'Edit') },
              { id: 'run', label: 'Run now', icon: <Play className="size-4" />, onSelect: () => toast('success', 'Running') },
              { id: 'delete', label: 'Delete', icon: <Trash2 className="size-4" />, danger: true, onSelect: () => toast('error', 'Deleted (not really)') },
            ]}
          />
          <Dropdown
            variant="primary"
            label="Model"
            items={[
              { id: 'haiku', label: 'Haiku', onSelect: () => {} },
              { id: 'sonnet', label: 'Sonnet', onSelect: () => {} },
            ]}
          />
        </Row>
      </Section>

      <Section title="ProgressBar">
        <div className="grid max-w-xl gap-5">
          <ProgressBar label="Empty" value={0} />
          <ProgressBar label="Calculus reviews" value={progress} color="violet" />
          <ProgressBar label="Complete" value={100} />
          <div className="flex gap-3">
            <Button size="sm" variant="secondary" onClick={() => setProgress((p) => Math.max(0, p - 10))}>
              −10
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setProgress((p) => Math.min(100, p + 10))}>
              +10
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Toast">
        <Row label="static">
          <ToastView kind="success">Task done</ToastView>
          <ToastView kind="error">The routine failed to run</ToastView>
          <ToastView kind="info">New note in wiki/</ToastView>
        </Row>
        <Row label="trigger">
          <Button onClick={() => toast('success', 'Saved to the memory!')}>Success</Button>
          <Button variant="secondary" onClick={() => toast('error', 'The Bridge is down')}>
            Error
          </Button>
          <Button variant="secondary" onClick={() => toast('info', 'Routine started')}>
            Info
          </Button>
        </Row>
      </Section>

      <Section title="Modal">
        <Row label="open">
          <Button variant="secondary" onClick={() => setModal(true)}>
            Open modal
          </Button>
        </Row>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="New routine"
          icon={<Repeat />}
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setModal(false)
                  toast('success', 'Routine created')
                }}
              >
                Create
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Input label="Name" placeholder="Morning summary" />
            <Input label="Time" placeholder="Mon–Fri at 06:50" />
          </div>
        </Modal>
      </Section>

      <Section title="TerminalPane">
        <TerminalPane
          title="claude · organize raw/"
          actions={
            <Button size="sm" variant="secondary">
              Cancel
            </Button>
          }
          lines={[
            '$ claude -p "organize raw/"',
            '● Reading wiki/_master-index.md',
            '● 3 new files in raw/',
            '✎ wiki/studies/calculus/limits.md',
            '✎ wiki/studies/calculus/_index.md',
            '',
            '✓ done in 42s',
          ]}
        />
      </Section>

      <Section title="Orb">
        <Row label="idle · listening · thinking · chat">
          <Orb />
          <Orb state="listening" />
          <Orb state="thinking" />
          <Orb mode="chat" />
        </Row>
      </Section>

      <Section title="EmptyState">
        <div className="grid gap-6 md:grid-cols-2">
          <EmptyState
            icon={<Inbox />}
            title="Nothing in raw/"
            description="Throw anything into the quick capture and Gandalf organizes it later."
            action={<Button>Capture</Button>}
          />
          <EmptyState icon={<Play />} color="wood" title="No active session" />
        </div>
      </Section>
    </div>
  )
}
