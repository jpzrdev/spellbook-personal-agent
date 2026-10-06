import { Loader, MessageCircle, Mic, Volume2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { focusRing } from './styles'

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  state?: OrbState
  mode?: 'voice' | 'chat'
}

const labels: Record<OrbState, string> = {
  idle: 'Talk to Gandalf',
  listening: 'Listening… release to send',
  thinking: 'Gandalf is thinking',
  speaking: 'Gandalf is speaking: click to stop',
}

/** A big round raised button. Listening: it sinks and pulses in primary. */
export function Orb({ state = 'idle', mode = 'voice', className, ...props }: Props) {
  const Icon = state === 'thinking' ? Loader : state === 'speaking' ? Volume2 : mode === 'voice' ? Mic : MessageCircle
  const listening = state === 'listening'
  return (
    <button
      type="button"
      aria-label={labels[state]}
      aria-pressed={listening}
      className={cn(
        'relative grid size-16 cursor-pointer place-items-center rounded-pill bg-surface text-primary-text',
        'transition-[box-shadow] duration-150',
        listening ? 'shadow-sunken' : 'shadow-raised hover:shadow-raised-lg active:shadow-sunken',
        focusRing,
        className,
      )}
      {...props}
    >
      {listening && (
        <span
          aria-hidden
          className="absolute -inset-1 rounded-pill border-2 border-primary motion-safe:animate-orb-pulse"
        />
      )}
      <span
        aria-hidden
        className={cn(
          'grid size-10 place-items-center rounded-pill',
          listening ? 'bg-primary text-on-primary' : 'shadow-sunken-sm',
        )}
      >
        <Icon className={cn('size-5', state === 'thinking' && 'motion-safe:animate-spin')} strokeWidth={2.25} />
      </span>
    </button>
  )
}
