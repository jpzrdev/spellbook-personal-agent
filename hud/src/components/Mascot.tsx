import { useIsMutating } from '@tanstack/react-query'
import { cn } from '../lib/cn'
import { mascot, useMascot } from '../lib/mascot'
import { useSessions, useToday } from '../lib/queries'

export type MascotState = 'normal' | 'thinking' | 'talking' | 'happy' | 'confused' | 'petted' | 'sleeping' | 'tired'

const PHRASE: Record<MascotState, string> = {
  normal: '',
  thinking: 'consulting the scrolls…',
  talking: 'speaking…',
  happy: 'done!',
  confused: "hmm… that wasn't clear",
  petted: 'thank you, friend',
  sleeping: 'napping… tap to wake him up',
  tired: 'tired; chat with him a little',
}

function mood(doneToday: number, overdue: number): number {
  return Math.max(0, Math.min(100, 45 + doneToday * 15 - overdue * 12))
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[0.7rem] font-semibold text-ink-muted">
      <span className="w-14">{label}</span>
      <span
        className="h-2 flex-1 overflow-hidden rounded-pill shadow-sunken-sm"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={cn('block h-full rounded-pill transition-[width] duration-700', color)} style={{ width: `${value}%` }} />
      </span>
    </div>
  )
}

/** The drawn wizard (SVG) with the state's animations (CSS in index.css, mascot-* classes). */
function Drawing({ state }: { state: MascotState }) {
  const sleeping = state === 'sleeping'
  return (
    <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible" aria-hidden>
      <ellipse cx="60" cy="133" rx="30" ry="4" className="fill-ink/15" />
      <g className="mascot-body">
        {/* staff */}
        <line x1="92" y1="44" x2="90" y2="131" stroke="#7a5434" strokeWidth="4" strokeLinecap="round" />
        <circle cx="92" cy="40" r="9" className="mascot-halo" fill="#e0a42a" opacity="0.25" />
        <circle cx="92" cy="40" r="5" className="mascot-glow" fill="#e0a42a" />
        {/* robe */}
        <path d="M38 129 L47 80 Q60 75 73 80 L82 129 Z" fill="#8c8a80" />
        <path d="M47 80 Q60 75 73 80 L75 90 Q60 86 45 90 Z" fill="#6f6d65" />
        <circle cx="89" cy="84" r="4.2" fill="#e9c9a1" />
        <g className="mascot-head">
          {/* hat */}
          <polygon points="46,56 62,18 70,16 66,23 74,56" fill="#8c8a80" />
          <ellipse cx="60" cy="56.5" rx="21" ry="4.6" fill="#6f6d65" />
          <polygon points="59,37 60.2,40 63.4,41.2 60.2,42.4 59,45.6 57.8,42.4 54.6,41.2 57.8,40" className="mascot-star" fill="#e0a42a" />
          {/* face */}
          <ellipse cx="60" cy="65" rx="14" ry="10" fill="#e9c9a1" />
          {sleeping ? (
            <g stroke="#2a2a22" strokeWidth="1.4" fill="none" strokeLinecap="round">
              <path d="M51.5 65 Q54 67 56.5 65" />
              <path d="M63.5 65 Q66 67 68.5 65" />
            </g>
          ) : (
            <g className={cn('mascot-eyes', state === 'thinking' && 'mascot-eyes-up')}>
              <circle cx="54" cy="65" r="1.9" fill="#2a2a22" />
              <circle cx="66" cy="65" r="1.9" fill="#2a2a22" />
            </g>
          )}
          <ellipse cx="54" cy="60.5" rx="4.2" ry="1.4" fill="#d8d4c8" className={cn(state === 'confused' && 'mascot-brow')} />
          <ellipse cx="66" cy="60.5" rx="4.2" ry="1.4" fill="#d8d4c8" />
          {/* beard and moustache */}
          <path className="mascot-beard" d="M46 69 Q60 75 74 69 L70 94 Q60 112 50 94 Z" fill="#f7f0e0" />
          <ellipse cx="60" cy="72" rx="12" ry="3.6" fill="#f7f0e0" />
          <ellipse cx="60" cy="69.5" rx="2.6" ry="2.2" fill="#dcb88e" />
        </g>
      </g>

      {/* per-state effects */}
      {state === 'thinking' && (
        <g className="mascot-orbit" fill="#e0a42a">
          <circle cx="92" cy="26" r="1.8" />
          <circle cx="104" cy="44" r="1.4" />
          <circle cx="80" cy="46" r="1.2" />
        </g>
      )}
      {state === 'happy' && (
        <g className="mascot-burst" fill="#e0a42a">
          <polygon points="22,30 24,35 29,36 24,38 22,43 20,38 15,36 20,35" />
          <polygon points="100,14 101.5,18 105.5,19 101.5,20.5 100,24 98.5,20.5 94.5,19 98.5,18" />
          <polygon points="30,88 31,91 34,92 31,93 30,96 29,93 26,92 29,91" />
        </g>
      )}
      {state === 'confused' && (
        <text x="88" y="24" className="mascot-waves fill-ink-muted font-display" fontSize="20" fontWeight="700">
          ?
        </text>
      )}
      {state === 'petted' && (
        <path className="mascot-float" d="M30 40 c-3-4-9-1-6 4 l6 6 6-6 c3-5-3-8-6-4z" fill="#c9776a" />
      )}
      {sleeping && (
        <g className="fill-ink-muted font-display" fontWeight="700">
          <text x="80" y="30" fontSize="11" className="mascot-z">z</text>
          <text x="90" y="18" fontSize="14" className="mascot-z mascot-z-2">z</text>
        </g>
      )}
      {state === 'talking' && (
        <g stroke="#e0a42a" strokeWidth="1.6" fill="none" strokeLinecap="round" className="mascot-waves">
          <path d="M22 66 q-4 6 0 12" />
          <path d="M16 62 q-6 10 0 20" />
        </g>
      )}
    </svg>
  )
}

type Props = { size?: 'sm' | 'md'; className?: string }

/** Gandalf's tamagotchi: reacts to what happens in the chat (thinking, speaking, done, confused),
 * sleeps at night, gets tired without conversation and is in a good mood when tasks move along. */
export function Mascot({ size = 'md', className }: Props) {
  const m = useMascot()
  const thinkingChat = useIsMutating({ mutationKey: ['ask'] }) > 0
  const { data: sessions } = useSessions()
  const { data: today } = useToday()
  const sessionRunning = sessions?.some((s) => s.status === 'running') ?? false
  const humor = today ? mood(today.tasks.done_today, today.tasks.overdue) : 50

  const state: MascotState =
    m.moment ?? (thinkingChat || sessionRunning ? 'thinking' : m.night ? 'sleeping' : m.energy < 25 ? 'tired' : 'normal')
  const phrase =
    PHRASE[state] ||
    (humor >= 70 ? 'in a great mood: the tasks are moving along' : humor < 35 ? 'worried about the overdue tasks' : 'serene, at your service')

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => {
          mascot.feed(5)
          mascot.react('petted', 1800)
        }}
        aria-label="Pet Gandalf"
        title="Pet him"
        data-state={state}
        className={cn('mascot cursor-pointer rounded-card', size === 'sm' ? 'size-20' : 'size-48')}
      >
        <Drawing state={state} />
      </button>
      <p role="status" className="text-center text-xs font-semibold text-ink-muted">
        Gandalf: {phrase}
      </p>
      {size === 'md' && (
        <div className="flex w-full max-w-56 flex-col gap-1.5">
          <Meter label="Energy" value={m.energy} color="bg-gold" />
          <Meter label="Mood" value={humor} color="bg-primary" />
        </div>
      )}
    </div>
  )
}
