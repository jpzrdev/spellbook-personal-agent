import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, Check, CircleAlert, ExternalLink, KeyRound, Mail, RefreshCw, Shuffle, Sparkles, UserRound, Wand2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Logo } from '../components/Logo'
import { WizardFigure, type MascotState } from '../components/WizardFigure'
import { Button, Card, Input, Tabs, Textarea, useToast } from '../components/ui'
import { focusRing } from '../components/ui/styles'
import { api, post, type Avatar, type Connectors, type Gender, type SetupStatus } from '../lib/api'
import { COLOR_NAMES, PARTS, PRESETS, SWATCHES, randomAvatar, type Part } from '../lib/avatar'
import { cn } from '../lib/cn'
import { useFinishSetup, useSaveAgent, useSaveUser, useSetup } from '../lib/queries'

// First run: connect Claude (and, optionally, Google), name and draw the assistant, introduce yourself.
// It can be opened again later (/setup) to change any of it; the answers come prefilled.

const STEPS = ['Connect', 'Your assistant', 'About you', 'Ready'] as const

export function Setup() {
  const { data: status, error, isPending } = useSetup()
  if (status) return <SetupFlow status={status} />
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 pt-8 pb-16 sm:px-6">
      {isPending && <p className="text-ink-muted">connecting to the Bridge…</p>}
      {error && (
        <Card title="No connection to the Bridge" icon={<CircleAlert />} color="ember">
          <p className="text-sm text-ink-muted">
            {error.message}. Start it with <code className="font-mono">scripts/start.ps1</code> and check <code className="font-mono">BRIDGE_TOKEN</code> in
            the <code className="font-mono">.env</code>.
          </p>
        </Card>
      )}
    </div>
  )
}

function SetupFlow({ status }: { status: SetupStatus }) {
  const [step, setStep] = useState(0)
  // The form starts from what is saved (on a first run, the default look and an empty name).
  const [agent, setAgent] = useState<AgentForm>({
    name: status.agent.setup_done ? status.agent.name : '',
    gender: status.agent.gender,
    avatar: status.agent.avatar,
  })
  const [user, setUser] = useState<UserForm>(status.user)
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 pt-8 pb-16 sm:px-6">
      <header className="flex items-center gap-3">
        <Logo gender={agent.gender} avatar={agent.avatar} />
        <div className="flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{status?.done ? 'Settings' : 'Welcome'}</h1>
          <p className="text-sm text-ink-muted">
            {status?.done ? 'Change your assistant or what it knows about you.' : 'A few steps and your personal system is ready.'}
          </p>
        </div>
        {/* Opened again from the menu: a way back without saving. */}
        {status.done && (
          <Button variant="icon" size="sm" aria-label="Close without saving" title="Close" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}>
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </header>

      <Stepper step={step} onGo={(i) => i < step && setStep(i)} />

      <div key={step} className="anim-enter">
        {step === 0 && <ConnectStep status={status} onNext={() => setStep(1)} />}
        {step === 1 && <AgentStep value={agent} onChange={setAgent} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
        {step === 2 && <UserStep agentName={agent.name} value={user} onChange={setUser} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && <ReadyStep agent={agent} userName={user.name} again={status.done} onBack={() => setStep(2)} />}
      </div>
    </div>
  )
}

function Stepper({ step, onGo }: { step: number; onGo: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Setup steps">
      {STEPS.map((label, i) => (
        <li key={label}>
          <button
            type="button"
            onClick={() => onGo(i)}
            disabled={i >= step}
            aria-current={i === step ? 'step' : undefined}
            className={cn('flex w-full flex-col gap-2 rounded-control text-left disabled:cursor-default', i < step && 'cursor-pointer', focusRing)}
          >
            <span className={cn('h-1.5 rounded-pill', i <= step ? 'bg-primary' : 'shadow-sunken-sm')} />
            <span className={cn('text-xs font-semibold', i === step ? 'text-ink' : 'text-ink-muted')}>
              {i + 1}. {label}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function Nav({ onBack, next }: { onBack?: () => void; next: ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      {next}
    </div>
  )
}

function StatusLine({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold">
      {ok ? <Check className="size-4 text-primary" aria-hidden /> : <CircleAlert className={cn('size-4', ok === null ? 'text-ink-muted' : 'text-gold')} aria-hidden />}
      {children}
    </p>
  )
}

function Command({ children }: { children: string }) {
  return <code className="block rounded-control px-4 py-2.5 font-mono text-sm shadow-sunken-sm">{children}</code>
}

// ---------- 1. Connect ----------

function ConnectStep({ status, onNext }: { status: SetupStatus; onNext: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [waiting, setWaiting] = useState(false)
  const [checking, setChecking] = useState(false)
  const claude = status.claude

  async function check() {
    setChecking(true)
    try {
      qc.setQueryData(['setup'], await api<SetupStatus>('/setup?refresh=true'))
    } finally {
      setChecking(false)
    }
  }

  // After opening the sign-in, check every few seconds until it's done.
  useEffect(() => {
    if (!waiting || claude.logged_in) return
    const timer = setInterval(() => void check(), 4000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, claude.logged_in])

  async function login() {
    try {
      const r = await post<{ opened: boolean }>('/setup/claude-login', {})
      if (r.opened) {
        setWaiting(true)
        toast('info', 'A terminal opened on the PC running the Bridge: sign in there with your Claude account.')
      } else {
        toast('info', 'Run the command below in a terminal on the PC running the Bridge.')
      }
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Claude"
        subtitle="The brain: your assistant thinks with Claude Code, on your Claude subscription. No API key."
        icon={<KeyRound />}
        color="primary"
        actions={
          <Button variant="ghost" size="sm" onClick={check} disabled={checking} aria-label="Check the Claude connection again">
            <RefreshCw className={cn('size-4', checking && 'animate-spin')} aria-hidden /> Check again
          </Button>
        }
      >
        {!claude.installed ? (
          <>
            <StatusLine ok={false}>Claude Code is not installed on this PC.</StatusLine>
            <p className="text-sm text-ink-muted">Install it (Windows PowerShell), then click “Check again”:</p>
            <Command>irm https://claude.ai/install.ps1 | iex</Command>
            <a className="text-sm font-semibold text-primary-text" href="https://claude.com/claude-code" target="_blank" rel="noreferrer">
              Other systems <ExternalLink className="inline size-3.5" aria-hidden />
            </a>
          </>
        ) : !claude.logged_in ? (
          <>
            <StatusLine ok={false}>{waiting ? 'Waiting for you to sign in…' : 'Claude Code is installed, but not signed in.'}</StatusLine>
            <p className="text-sm text-ink-muted">
              Sign in with your Claude account (Pro or Max). The browser opens Anthropic's own page: your password never passes through here.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={login}>
                <KeyRound className="size-4" aria-hidden /> Sign in to Claude
              </Button>
            </div>
            <p className="text-sm text-ink-muted">Or run it yourself in a terminal on this PC:</p>
            <Command>claude auth login</Command>
          </>
        ) : (
          <StatusLine ok>Connected to Claude{claude.method ? ` (${claude.method})` : ''}.</StatusLine>
        )}
      </Card>

      {claude.logged_in && <GoogleCard />}

      <Nav
        next={
          <Button onClick={onNext} disabled={!claude.logged_in} title={claude.logged_in ? undefined : 'Sign in to Claude first'}>
            Next
          </Button>
        }
      />
    </div>
  )
}

function GoogleCard() {
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ['setup', 'connectors'],
    queryFn: () => api<Connectors>('/setup/connectors'),
    retry: false,
    staleTime: Infinity,
  })
  const line = (key: 'gmail' | 'calendar', label: string) => {
    const c = data?.[key]
    return (
      <StatusLine ok={c ? c.connected : null}>
        {label}: {!c ? (isFetching ? 'checking…' : '?') : c.connected ? 'connected' : c.found ? 'found, but not connected' : 'not connected'}
      </StatusLine>
    )
  }
  return (
    <Card
      title="Email and calendar (optional)"
      subtitle="So your assistant can read your Gmail and keep your Google Calendar. You can do this later."
      icon={<Mail />}
      color="violet"
      actions={
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Check the Google connections again">
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} aria-hidden /> Check again
        </Button>
      }
    >
      <div className="flex flex-col gap-1.5">
        {line('gmail', 'Gmail')}
        {line('calendar', 'Google Calendar')}
        {error && <p className="text-sm text-danger">Couldn't check: {error.message}</p>}
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
        <li>
          Open Claude's connectors and turn on <strong>Gmail</strong> and <strong>Google Calendar</strong>.
        </li>
        <li>Sign in to Google on that page (Google's own sign-in: no password is stored here).</li>
        <li>Come back and click “Check again”.</li>
      </ol>
      <div>
        <a
          href="https://claude.ai/settings/connectors"
          target="_blank"
          rel="noreferrer"
          className={cn('inline-flex items-center gap-2 text-sm font-semibold text-primary-text', focusRing)}
        >
          <Calendar className="size-4" aria-hidden /> Open Claude's connectors <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    </Card>
  )
}

// ---------- 2. The assistant ----------

type AgentForm = { name: string; gender: Gender; avatar: Avatar }

function AgentStep({ value, onChange, onBack, onNext }: { value: AgentForm; onChange: (v: AgentForm) => void; onBack: () => void; onNext: () => void }) {
  const save = useSaveAgent()
  const toast = useToast()
  const [preview, setPreview] = useState<MascotState>('normal')
  const name = value.name.trim()
  const set = (partial: Partial<AgentForm>) => onChange({ ...value, ...partial })
  const setPart = (part: Part, color: string) => set({ avatar: { ...value.avatar, [part]: color } })

  function react(state: MascotState) {
    setPreview(state)
    setTimeout(() => setPreview('normal'), 1600)
  }

  async function next() {
    try {
      await save.mutateAsync({ name, gender: value.gender, avatar: value.avatar })
      onNext()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_1fr]">
      <div className="flex flex-col items-center gap-3 md:sticky md:top-6 md:self-start">
        <button
          type="button"
          onClick={() => react('happy')}
          aria-label="Preview: make your assistant react"
          data-state={preview}
          className={cn('mascot size-52 cursor-pointer rounded-card', focusRing)}
        >
          <WizardFigure state={preview} gender={value.gender} avatar={value.avatar} />
        </button>
        <p className="text-center font-display text-xl font-semibold">{name || 'Your assistant'}</p>
        <Button variant="ghost" size="sm" onClick={() => (set({ avatar: randomAvatar() }), react('petted'))}>
          <Shuffle className="size-4" aria-hidden /> Surprise me
        </Button>
      </div>

      <div className="flex flex-col gap-5">
        <Input
          label="Name"
          placeholder="Gandalf, Merlin, Morgana…"
          value={value.name}
          maxLength={40}
          autoFocus
          onChange={(e) => set({ name: e.target.value })}
          hint="What you'll call your assistant. It answers by this name."
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Look</span>
          <Tabs
            label="Look"
            value={value.gender}
            onChange={(id) => (set({ gender: id as Gender }), react('happy'))}
            items={[
              { id: 'male', label: 'Wizard (he)' },
              { id: 'female', label: 'Witch (she)' },
            ]}
          />
          <p className="text-sm text-ink-muted">Also picks the voice and how it talks about itself.</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Ready-made</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p.name} variant="secondary" size="sm" onClick={() => set({ avatar: p.avatar })}>
                <span aria-hidden className="size-3 rounded-pill" style={{ background: p.avatar.robe }} />
                {p.name}
              </Button>
            ))}
          </div>
        </div>
        {PARTS.map(({ part, label }) => (
          <Swatches
            key={part}
            label={part === 'hair' && value.gender === 'female' ? 'Hair' : label}
            colors={SWATCHES[part]}
            value={value.avatar[part]}
            onChange={(c) => setPart(part, c)}
          />
        ))}
        <Nav
          onBack={onBack}
          next={
            <Button onClick={next} disabled={!name || save.isPending}>
              <Wand2 className="size-4" aria-hidden /> {save.isPending ? 'Saving…' : 'Next'}
            </Button>
          }
        />
      </div>
    </div>
  )
}

function Swatches({ label, colors, value, onChange }: { label: string; colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2.5">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === value}
            aria-label={COLOR_NAMES[c] ?? c}
            title={COLOR_NAMES[c] ?? c}
            onClick={() => onChange(c)}
            className={cn(
              'size-9 cursor-pointer rounded-pill shadow-raised-sm transition-[box-shadow,transform] duration-150 hover:scale-105',
              c === value && 'scale-110 outline-2 outline-offset-2 outline-primary',
              focusRing,
            )}
            style={{ background: c }}
          />
        ))}
      </div>
    </fieldset>
  )
}

// ---------- 3. About you ----------

type UserForm = { name: string; about: string }

function UserStep({ agentName, value, onChange, onBack, onNext }: { agentName: string; value: UserForm; onChange: (v: UserForm) => void; onBack: () => void; onNext: () => void }) {
  const save = useSaveUser()
  const toast = useToast()
  const name = value.name.trim()

  async function next() {
    try {
      await save.mutateAsync({ name, about: value.about })
      onNext()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <Card title={`Introduce yourself to ${agentName}`} subtitle="Only your name is required." icon={<UserRound />} color="gold">
      <Input label="Your name" value={value.name} maxLength={40} autoFocus onChange={(e) => onChange({ ...value, name: e.target.value })} />
      <Textarea
        label={`Anything you want ${agentName} to know (optional)`}
        rows={8}
        maxLength={3000}
        value={value.about}
        onChange={(e) => onChange({ ...value, about: e.target.value })}
        placeholder="What you do, what you're studying, your goals for this year, your routine, the people who matter, how you like answers…"
        hint={`Saved to your memory (wiki/about-me/profile.md); you can edit it anytime in the Memory tab. ${value.about.length}/3000`}
      />
      <Nav
        onBack={onBack}
        next={
          <Button onClick={next} disabled={!name || save.isPending}>
            {save.isPending ? 'Saving…' : 'Next'}
          </Button>
        }
      />
    </Card>
  )
}

// ---------- 4. Ready ----------

function ReadyStep({ agent, userName, again, onBack }: { agent: AgentForm; userName: string; again: boolean; onBack: () => void }) {
  const finish = useFinishSetup()
  const navigate = useNavigate()
  const toast = useToast()

  async function start() {
    try {
      await finish.mutateAsync()
      navigate('/', { replace: true })
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="mascot size-56" data-state="happy">
        <WizardFigure state="happy" gender={agent.gender} avatar={agent.avatar} />
      </div>
      <h2 className="font-display text-3xl font-semibold">
        {agent.name.trim()} is ready, {userName.trim()}.
      </h2>
      <p className="max-w-md text-ink-muted">
        Ask for anything in the Chat or hold the round button to talk. Try: “what do I have today?”, “remind me to call mom at 6pm” or
        “help me study for the exam”.
      </p>
      <div className="flex w-full max-w-md justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" onClick={start} disabled={finish.isPending}>
          <Sparkles className="size-5" aria-hidden /> {again ? 'Save' : 'Start'}
        </Button>
      </div>
    </div>
  )
}
