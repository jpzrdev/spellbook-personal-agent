import type { Avatar, Gender } from '../lib/api'
import { shade } from '../lib/avatar'
import { cn } from '../lib/cn'

export type MascotState = 'normal' | 'thinking' | 'talking' | 'happy' | 'confused' | 'petted' | 'sleeping' | 'tired'

const INK = '#2a2a22'
const WOOD = '#7a5434'
const LIPS = '#b8566a'

type Props = { state?: MascotState; gender: Gender; avatar: Avatar }

/** The drawn wizard (SVG) in the user's colors: bearded (male) or long-haired (female). The state's
 * animations live in index.css (mascot-* classes, active inside a `.mascot[data-state]`). */
export function WizardFigure({ state = 'normal', gender, avatar }: Props) {
  const sleeping = state === 'sleeping'
  const female = gender === 'female'
  const { hat, robe, hair, skin, gem } = avatar
  return (
    <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible" aria-hidden>
      <ellipse cx="60" cy="133" rx="30" ry="4" className="fill-ink/15" />
      <g className="mascot-body">
        {/* staff */}
        <line x1="92" y1="44" x2="90" y2="131" stroke={WOOD} strokeWidth="4" strokeLinecap="round" />
        <circle cx="92" cy="40" r="9" className="mascot-halo" fill={gem} opacity="0.25" />
        <circle cx="92" cy="40" r="5" className="mascot-glow" fill={gem} />
        {female ? (
          <>
            {/* long hair, behind the head and over the shoulders */}
            <path
              d="M41 57 C34 70 33 90 37 103 C40 107 44 104 46 107 C49 109 52 104 53 99 Q60 95 67 99 C68 104 71 109 74 107 C76 104 80 107 83 103 C87 90 86 70 79 57 Z"
              fill={shade(hair, -0.12)}
            />
            {/* dress: fitted at the waist, a belt with a gem */}
            <path d="M39 129 Q44 108 50 93 Q48 85 51 80 Q60 76 69 80 Q72 85 70 93 Q76 108 81 129 Z" fill={robe} />
            <path d="M51 80 Q60 76 69 80 L64 88 Q60 91 56 88 Z" fill={shade(robe, -0.22)} />
            <path d="M49.4 92 Q60 95.5 70.6 92 L71.3 96 Q60 99.5 48.7 96 Z" fill={shade(robe, -0.35)} />
            <circle cx="60" cy="96.6" r="1.8" fill={gem} />
            <path d="M44 112 Q60 117 76 112" stroke={shade(robe, -0.18)} strokeWidth="1.2" fill="none" />
          </>
        ) : (
          <>
            {/* hair behind, down to the shoulders */}
            <path d="M42 58 C36 68 36 83 40 93 Q44 95 47 91 L73 91 Q76 95 80 93 C84 83 84 68 78 58 Z" fill={shade(hair, -0.12)} />
            {/* robe with sleeves and a rope belt (its tassel in the staff's color) */}
            <path d="M37 129 Q42 104 47 82 Q60 76 73 82 Q78 104 83 129 Z" fill={robe} />
            <path d="M44 129 Q60 133 76 129" stroke={shade(robe, -0.2)} strokeWidth="1.4" fill="none" />
            <path d="M47 84 Q39 98 40 112 Q45 113 50 110 Q49 97 53 88 Z" fill={shade(robe, -0.14)} />
            <path d="M72 84 Q81 83 87 85.5 L86.5 92 Q79 92.5 72 92 Z" fill={shade(robe, -0.14)} />
            <path d="M46.8 101 Q60 105 73.2 101" stroke={shade(robe, -0.4)} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M53 103.5 Q52 109 53.5 114" stroke={shade(robe, -0.4)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <circle cx="53.5" cy="115" r="1.6" fill={gem} />
          </>
        )}
        <circle cx="89" cy={female ? 84 : 88} r="4.2" fill={skin} />
        <g className="mascot-head">
          {/* hat: a cone with a band; the brim is drawn last, over the head (the hair comes out from under it) */}
          <polygon points="45.5,56 62,18 70,16 66,23 74.5,56" fill={hat} />
          <polygon points="47.3,51.5 72.9,51.5 74.1,55.6 45.7,55.6" fill={shade(hat, -0.35)} />
          <polygon points="59,37 60.2,40 63.4,41.2 60.2,42.4 59,45.6 57.8,42.4 54.6,41.2 57.8,40" className="mascot-star" fill={gem} />
          {female ? <Witch state={state} hair={hair} skin={skin} /> : <Wizard state={state} hair={hair} skin={skin} />}
          <ellipse cx="60" cy="56.5" rx="22.5" ry="4.6" fill={shade(hat, -0.2)} />
        </g>
      </g>

      {/* per-state effects */}
      {state === 'thinking' && (
        <g className="mascot-orbit" fill={gem}>
          <circle cx="92" cy="26" r="1.8" />
          <circle cx="104" cy="44" r="1.4" />
          <circle cx="80" cy="46" r="1.2" />
        </g>
      )}
      {state === 'happy' && (
        <g className="mascot-burst" fill={gem}>
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
        <g stroke={gem} strokeWidth="1.6" fill="none" strokeLinecap="round" className="mascot-waves">
          <path d="M22 66 q-4 6 0 12" />
          <path d="M16 62 q-6 10 0 20" />
        </g>
      )}
    </svg>
  )
}

type FaceProps = { state: MascotState; hair: string; skin: string }

function ClosedEyes({ y = 65.5, dx = 0 }: { y?: number; dx?: number }) {
  return (
    <g stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round">
      <path d={`M${51.5 + dx} ${y} Q${54 + dx} ${y + 2} ${56.5 + dx} ${y}`} />
      <path d={`M${63.5 - dx} ${y} Q${66 - dx} ${y + 2} ${68.5 - dx} ${y}`} />
    </g>
  )
}

/** The bearded face: bushy brows, a moustache with curled ends and a long layered beard. */
function Wizard({ state, hair, skin }: FaceProps) {
  const brow = shade(hair, -0.08)
  const strand = shade(hair, -0.14)
  return (
    <>
      <ellipse cx="60" cy="66" rx="13" ry="10.5" fill={skin} />
      <ellipse cx="51.5" cy="70" rx="2.6" ry="1.5" fill="#e0707a" opacity="0.22" />
      <ellipse cx="68.5" cy="70" rx="2.6" ry="1.5" fill="#e0707a" opacity="0.22" />
      <path d="M47.5 59 Q44.5 65 46.5 72 Q48.2 67 49.4 62 Z" fill={hair} />
      <path d="M72.5 59 Q75.5 65 73.5 72 Q71.8 67 70.6 62 Z" fill={hair} />
      {state === 'sleeping' ? (
        <ClosedEyes y={66.6} dx={0.5} />
      ) : (
        <g className={cn('mascot-eyes', state === 'thinking' && 'mascot-eyes-up')}>
          <circle cx="54.5" cy="66.6" r="2" fill={INK} />
          <circle cx="65.5" cy="66.6" r="2" fill={INK} />
          <circle cx="55.2" cy="65.9" r="0.55" fill="#fff" />
          <circle cx="66.2" cy="65.9" r="0.55" fill="#fff" />
        </g>
      )}
      <g stroke={brow} strokeWidth="2.3" fill="none" strokeLinecap="round">
        <path d="M50.6 63.4 Q54 61.4 57.6 62.8" className={cn(state === 'confused' && 'mascot-brow')} />
        <path d="M62.4 62.8 Q66 61.4 69.4 63.4" />
      </g>
      <g className="mascot-beard">
        <path d="M46 70 Q45 83 50 93 Q53 99 56 100.5 Q57.5 108 60 113 Q62.5 108 64 100.5 Q67 99 70 93 Q75 83 74 70 Q60 78 46 70 Z" fill={hair} />
        <g stroke={strand} strokeWidth="0.9" fill="none" strokeLinecap="round">
          <path d="M53.5 82 Q54.5 91 57 98" />
          <path d="M66.5 82 Q65.5 91 63 98" />
          <path d="M60 84 Q60.6 96 60 106" />
        </g>
      </g>
      <path
        d="M60 72 Q54 70 50.5 72.6 Q48.3 74.6 49.3 76.4 Q53 73.8 60 74.8 Q67 73.8 70.7 76.4 Q71.7 74.6 69.5 72.6 Q66 70 60 72 Z"
        fill={hair}
      />
      <ellipse cx="60" cy="70.2" rx="2.5" ry="2.1" fill={shade(skin, -0.12)} />
    </>
  )
}

/** The witch's face: long hair with bangs, lashes, rosy cheeks and lips. */
function Witch({ state, hair, skin }: FaceProps) {
  const brow = shade(hair, -0.3)
  return (
    <>
      <ellipse cx="60" cy="65.5" rx="12.5" ry="10" fill={skin} />
      <path d="M47.5 59 Q43 70 45.5 84 Q48.5 76 50 64 Z" fill={hair} />
      <path d="M72.5 59 Q77 70 74.5 84 Q71.5 76 70 64 Z" fill={hair} />
      <path d="M46.5 58.5 Q54.5 68 63.5 61.4 Q68 64.6 73.5 58.5 Q67 57.5 60 57.5 Q52 57.5 46.5 58.5 Z" fill={hair} />
      <ellipse cx="51.8" cy="69.4" rx="2.6" ry="1.5" fill="#e0707a" opacity="0.35" />
      <ellipse cx="68.2" cy="69.4" rx="2.6" ry="1.5" fill="#e0707a" opacity="0.35" />
      {state === 'sleeping' ? (
        <ClosedEyes dx={0.5} />
      ) : (
        <g className={cn('mascot-eyes', state === 'thinking' && 'mascot-eyes-up')}>
          <circle cx="54.5" cy="65.6" r="2.1" fill={INK} />
          <circle cx="65.5" cy="65.6" r="2.1" fill={INK} />
          <circle cx="55.2" cy="64.9" r="0.6" fill="#fff" />
          <circle cx="66.2" cy="64.9" r="0.6" fill="#fff" />
          <g stroke={INK} strokeWidth="0.9" strokeLinecap="round">
            <path d="M52.5 64.4 L51.2 63.4" />
            <path d="M67.5 64.4 L68.8 63.4" />
          </g>
        </g>
      )}
      <g stroke={brow} strokeWidth="1" fill="none" strokeLinecap="round">
        <path d="M51.6 62.2 Q54.5 60.8 57.2 62" className={cn(state === 'confused' && 'mascot-brow')} />
        <path d="M62.8 62 Q65.5 60.8 68.4 62.2" />
      </g>
      <path d="M59.4 67.6 Q60 69 60.8 68.4" stroke={shade(skin, -0.25)} strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <path className="mascot-beard" d="M57 71.6 Q60 74 63 71.6 Q60 72.6 57 71.6 Z" fill={LIPS} stroke={LIPS} strokeWidth="0.8" strokeLinejoin="round" />
    </>
  )
}
