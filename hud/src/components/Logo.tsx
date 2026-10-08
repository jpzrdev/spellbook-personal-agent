import type { Avatar, Gender } from '../lib/api'
import { DEFAULT_AVATAR, shade } from '../lib/avatar'

// The wizard drawing (32×32 space), the same as public/icon.svg and scripts/generate_icons.py (those keep the
// default grey wizard; this one follows the assistant the user drew in the setup).
const WIZARD = {
  hat: '11,14.8 16.8,5 19.6,4.6 18.5,6.6 21,14.8',
  beard: '11.2,18.4 20.8,18.4 19.5,23.5 16,29.5 12.5,23.5',
  star: '16,9.4 16.45,10.45 17.5,10.9 16.45,11.35 16,12.4 15.55,11.35 14.5,10.9 15.55,10.45',
  hairBack: 'M11.6 15.2 C9.8 18.5 9.6 23 10.8 26 Q13 25.6 14 24.4 Q16 23.4 18 24.4 Q19 25.6 21.2 26 C22.4 23 22.2 18.5 20.4 15.2 Z',
  hairShort: 'M11.8 15.2 C10.4 17.5 10.3 20.5 11.1 22.8 L20.9 22.8 C21.7 20.5 21.6 17.5 20.2 15.2 Z',
  bangs: 'M11.8 15.4 Q14 18 16.6 16.4 Q18 17.2 20.2 15.4 Q16 14.8 11.8 15.4 Z',
}

type Props = { gender?: Gender; avatar?: Avatar }

/** A night-sky medallion with the assistant (hat with a star; a beard or long hair). */
export function Logo({ gender = 'male', avatar = DEFAULT_AVATAR }: Props) {
  const female = gender === 'female'
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-[radial-gradient(circle_at_35%_30%,#3d5278,#1f2b40)] shadow-raised-sm" aria-hidden>
      <svg viewBox="1 2 30 30" className="size-8">
        <g fill="#f4f2ec" opacity="0.8">
          <circle cx="6" cy="9" r="0.55" />
          <circle cx="26.5" cy="8" r="0.45" />
          <circle cx="27" cy="22" r="0.4" />
          <circle cx="5" cy="21" r="0.4" />
        </g>
        {/* hair behind the head: long for her, down to the shoulders for him */}
        <path d={female ? WIZARD.hairBack : WIZARD.hairShort} fill={shade(avatar.hair, -0.12)} />
        <polygon points={WIZARD.hat} fill={avatar.hat} />
        {/* the face sits a little lower so the brim (drawn last, over the head) doesn't hide the eyes */}
        <g transform="translate(0 0.6)">
          <ellipse cx="16" cy="17.6" rx="4.6" ry="2.8" fill={avatar.skin} />
          <circle cx="14.3" cy="17.3" r="0.6" fill="#2a2a22" />
          <circle cx="17.7" cy="17.3" r="0.6" fill="#2a2a22" />
          {female ? (
            <>
              <path d={WIZARD.bangs} fill={avatar.hair} />
              <path d="M15 19.1 Q16 19.9 17 19.1 Q16 19.4 15 19.1 Z" fill="#b8566a" stroke="#b8566a" strokeWidth="0.35" strokeLinejoin="round" />
            </>
          ) : (
            <>
              <g stroke={shade(avatar.hair, -0.08)} strokeWidth="0.75" strokeLinecap="round" fill="none">
                <path d="M13.1 16.5 Q14.3 15.9 15.4 16.3" />
                <path d="M16.6 16.3 Q17.7 15.9 18.9 16.5" />
              </g>
              <polygon points={WIZARD.beard} fill={avatar.hair} />
              <ellipse cx="16" cy="19" rx="4.9" ry="1.5" fill={avatar.hair} />
              <ellipse cx="16" cy="18.4" rx="0.9" ry="0.8" fill={shade(avatar.skin, -0.12)} />
            </>
          )}
        </g>
        {/* the brim over the head (the hair comes out from under the hat) */}
        <ellipse cx="16" cy="14.9" rx="7.8" ry="1.7" fill={shade(avatar.hat, -0.2)} />
        <polygon points={WIZARD.star} fill={avatar.gem} />
      </svg>
    </span>
  )
}
