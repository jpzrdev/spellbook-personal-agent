import { Pause, Play, RotateCcw, SkipForward, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { mmss, PHASE_NAME, pomodoro, PRESETS, remaining, total, usePomodoro } from '../lib/pomodoro'
import { Button, Tabs } from './ui'
import { focusRing, raised } from './ui/styles'

const PHASE_STROKE = { focus: 'stroke-ember', break: 'stroke-primary', long: 'stroke-primary' } as const
const PHASE_TEXT = { focus: 'text-ember', break: 'text-primary-text', long: 'text-primary-text' } as const

/** The phase's progress ring (full at the start, empties toward the end). */
function Ring({ fraction, phase, size, thickness }: { fraction: number; phase: keyof typeof PHASE_STROKE; size: number; thickness: number }) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-shade/40" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        className={cn(PHASE_STROKE[phase], 'transition-[stroke-dashoffset] duration-1000 ease-linear')}
      />
    </svg>
  )
}

/** The pomodoro widget: a round button in the side stack (with the time ring) + a panel with the controls. */
export function Pomodoro() {
  const { state: p, now } = usePomodoro()
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const left = remaining(p, now)
  const fraction = Math.max(0, Math.min(1, left / total(p)))
  const active = p.running || left < total(p)
  // A phase ended: the panel opens by itself for the next step (closing it also dismisses the alert).
  const show = open || p.finished !== null
  const close = () => {
    setOpen(false)
    pomodoro.dismiss()
  }

  useEffect(() => {
    if (!show) return
    const outside = (ev: MouseEvent) => {
      if (!panel.current?.parentElement?.contains(ev.target as Node)) close()
    }
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && close()
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', esc)
    }
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      {show && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Pomodoro"
          className={cn(raised, 'anim-pop absolute right-full bottom-0 mr-3 flex w-72 origin-bottom-right flex-col items-center gap-4 rounded-card p-5 shadow-raised-lg')}
        >
          <header className="flex w-full items-center justify-between">
            <span className={cn('text-sm font-bold', PHASE_TEXT[p.phase])}>{PHASE_NAME[p.phase]}</span>
            <span className="text-xs text-ink-muted" title="Focus blocks finished today">
              🍅 × {p.focusToday} today
            </span>
            <button type="button" aria-label="Close" onClick={close} className={cn('rounded-pill p-1 text-ink-muted hover:text-ink', focusRing)}>
              <X className="size-4" />
            </button>
          </header>

          {p.finished && (
            <p role="status" className="w-full rounded-control px-3 py-2 text-center text-sm font-semibold shadow-sunken-sm">
              {p.finished === 'focus' ? 'Focus done! Breathe, stretch, drink some water.' : 'Break over. Ready for another focus block?'}
            </p>
          )}

          <div className="relative grid place-items-center">
            <Ring fraction={fraction} phase={p.phase} size={168} thickness={10} />
            <span className="absolute font-display text-4xl tabular-nums" aria-live="off">
              {mmss(left)}
            </span>
          </div>

          <input
            aria-label="What you'll focus on"
            placeholder="What will you focus on?"
            value={p.label}
            onChange={(ev) => pomodoro.setLabel(ev.target.value)}
            className="h-9 w-full rounded-pill bg-surface px-4 text-center text-sm shadow-sunken-sm placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-primary"
          />

          <div className="flex items-center gap-2">
            <Button variant="icon" size="sm" aria-label="Restart phase" title="Restart phase" onClick={pomodoro.restart}>
              <RotateCcw className="size-4" />
            </Button>
            {p.running ? (
              <Button onClick={pomodoro.pause}>
                <Pause className="size-4" aria-hidden /> Pause
              </Button>
            ) : (
              <Button onClick={() => pomodoro.start()}>
                <Play className="size-4" aria-hidden /> {left < total(p) ? 'Resume' : p.phase === 'focus' ? 'Start focus' : 'Start break'}
              </Button>
            )}
            <Button variant="icon" size="sm" aria-label="Skip to the next phase" title="Skip phase" onClick={pomodoro.skip}>
              <SkipForward className="size-4" />
            </Button>
          </div>

          <Tabs
            label="Duration"
            value={p.preset}
            onChange={(preset) => pomodoro.choosePreset(preset)}
            items={Object.keys(PRESETS).map((preset) => ({ id: preset, label: preset }))}
          />
          <p className="text-center text-[0.7rem] text-ink-muted">Every 4 focus blocks, a long break. The alert reaches your phone even with the app closed.</p>
        </div>
      )}

      <button
        type="button"
        aria-label={active ? `Pomodoro: ${PHASE_NAME[p.phase]}, ${mmss(left)} left` : 'Open pomodoro'}
        aria-expanded={show}
        onClick={() => (show ? close() : setOpen(true))}
        className={cn(
          'relative grid size-11 cursor-pointer place-items-center rounded-pill bg-surface text-ink-muted shadow-raised-sm hover:text-ink active:shadow-sunken-sm',
          p.finished && 'animate-bounce',
          focusRing,
        )}
      >
        {active ? (
          <>
            <span className="absolute inset-0 grid place-items-center">
              <Ring fraction={fraction} phase={p.phase} size={44} thickness={3} />
            </span>
            <span className={cn('relative text-[0.62rem] font-bold tabular-nums', PHASE_TEXT[p.phase])}>{mmss(left)}</span>
          </>
        ) : (
          <Timer className="size-5" aria-hidden />
        )}
      </button>
    </div>
  )
}
