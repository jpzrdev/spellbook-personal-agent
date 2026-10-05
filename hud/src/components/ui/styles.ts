// Classes shared by the neumorphic design system.

export type Color = 'primary' | 'primary-light' | 'wood' | 'gold' | 'ember' | 'violet' | 'silver'

// Static maps: Tailwind only generates classes that appear literally in the code.

/** Solid color (dots, fills, icons). */
export const solid: Record<Color, string> = {
  primary: 'bg-primary',
  'primary-light': 'bg-primary-light',
  wood: 'bg-wood',
  gold: 'bg-gold',
  ember: 'bg-ember',
  violet: 'bg-violet',
  silver: 'bg-silver',
}

/** Icon/stroke color. */
export const textColor: Record<Color, string> = {
  primary: 'text-primary',
  'primary-light': 'text-primary-light',
  wood: 'text-wood',
  gold: 'text-gold',
  ember: 'text-ember',
  violet: 'text-violet',
  silver: 'text-silver',
}

/** Lightly tinted background; the text stays `ink` to keep contrast. */
export const tinted: Record<Color, string> = {
  primary: 'bg-primary/20',
  'primary-light': 'bg-primary-light/30',
  wood: 'bg-wood/20',
  gold: 'bg-gold/25',
  ember: 'bg-ember/20',
  violet: 'bg-violet/30',
  silver: 'bg-silver/20',
}

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary'

/** Raised surface (card, panel). */
export const raised = 'bg-surface shadow-raised'

/** Sunken surface (field, track, empty area). */
export const sunken = 'bg-surface shadow-sunken'

/** Raised control that grows on hover and sinks on click. */
export const interactive = [
  'shadow-raised-sm transition-[box-shadow,color,background-color] duration-150',
  'hover:shadow-raised active:shadow-sunken-sm',
  'disabled:pointer-events-none disabled:opacity-45',
  focusRing,
].join(' ')

// Each tier has the same color across the HUD (badges and charts): tokens series-1..3.
export const TIER_COLOR: Record<1 | 2 | 3, { dot: string; bg: string }> = {
  1: { dot: 'bg-series-1', bg: 'bg-series-1/20' },
  2: { dot: 'bg-series-2', bg: 'bg-series-2/25' },
  3: { dot: 'bg-series-3', bg: 'bg-series-3/20' },
}
