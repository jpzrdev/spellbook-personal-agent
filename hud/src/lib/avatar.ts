import type { Agent, Avatar, Gender } from './api'

// The assistant's look: always the same wizard drawing (so every animation of the mascot works), with the
// gender (bearded wizard or long-haired witch) and the colors the user picks in the setup.

export const DEFAULT_AVATAR: Avatar = { hat: '#8c8a80', robe: '#8c8a80', hair: '#f7f0e0', skin: '#e9c9a1', gem: '#e0a42a' }

export const DEFAULT_AGENT: Agent = { name: 'Gandalf', gender: 'male', avatar: DEFAULT_AVATAR, setup_done: null, kind: 'wizard' }

export type Part = keyof Avatar

export const PARTS: Array<{ part: Part; label: string }> = [
  { part: 'hat', label: 'Hat' },
  { part: 'robe', label: 'Robe' },
  { part: 'hair', label: 'Hair and beard' },
  { part: 'skin', label: 'Skin' },
  { part: 'gem', label: 'Staff light' },
]

const CLOTH = ['#8c8a80', '#e8e6df', '#34497a', '#6b4a8c', '#3f6b4a', '#8c3a3a', '#7a5a3c', '#3a3a40']

export const SWATCHES: Record<Part, string[]> = {
  hat: CLOTH,
  robe: CLOTH,
  hair: ['#f7f0e0', '#c9c9cf', '#9a958a', '#d2803c', '#a0522d', '#5c3d2e', '#2b2b2e'],
  skin: ['#f3d7b8', '#e9c9a1', '#d6a77a', '#b07850', '#8a5a3b', '#5c3b28'],
  gem: ['#e0a42a', '#f4f2ec', '#4aa3ff', '#4fbf7a', '#a77bff', '#ff6b5a'],
}

export const COLOR_NAMES: Record<string, string> = {
  '#8c8a80': 'grey',
  '#e8e6df': 'white',
  '#34497a': 'midnight blue',
  '#6b4a8c': 'purple',
  '#3f6b4a': 'forest green',
  '#8c3a3a': 'crimson',
  '#7a5a3c': 'brown',
  '#3a3a40': 'black',
  '#f7f0e0': 'snow white',
  '#c9c9cf': 'silver',
  '#9a958a': 'ash',
  '#d2803c': 'ginger',
  '#a0522d': 'auburn',
  '#5c3d2e': 'dark brown',
  '#2b2b2e': 'black',
  '#f3d7b8': 'light',
  '#e9c9a1': 'light beige',
  '#d6a77a': 'tan',
  '#b07850': 'medium brown',
  '#8a5a3b': 'brown',
  '#5c3b28': 'deep brown',
  '#e0a42a': 'gold',
  '#f4f2ec': 'white',
  '#4aa3ff': 'blue',
  '#4fbf7a': 'green',
  '#a77bff': 'violet',
  '#ff6b5a': 'red',
}

/** Ready-made looks (one click), then fine-tuned part by part. */
export const PRESETS: Array<{ name: string; avatar: Avatar }> = [
  { name: 'The Grey', avatar: DEFAULT_AVATAR },
  { name: 'The White', avatar: { hat: '#e8e6df', robe: '#e8e6df', hair: '#f7f0e0', skin: '#f3d7b8', gem: '#f4f2ec' } },
  { name: 'Midnight', avatar: { hat: '#34497a', robe: '#34497a', hair: '#c9c9cf', skin: '#d6a77a', gem: '#4aa3ff' } },
  { name: 'Druid', avatar: { hat: '#7a5a3c', robe: '#3f6b4a', hair: '#9a958a', skin: '#b07850', gem: '#4fbf7a' } },
  { name: 'Ember', avatar: { hat: '#3a3a40', robe: '#8c3a3a', hair: '#a0522d', skin: '#e9c9a1', gem: '#ff6b5a' } },
  { name: 'Arcane', avatar: { hat: '#6b4a8c', robe: '#6b4a8c', hair: '#2b2b2e', skin: '#8a5a3b', gem: '#a77bff' } },
]

/** Darkens (amount < 0) or lightens (amount > 0) a hex color: shadows and details of each part. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const channel = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(channel)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export const pronoun = (gender: Gender) => (gender === 'female' ? { subject: 'she', object: 'her' } : { subject: 'he', object: 'him' })

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]

export function randomAvatar(): Avatar {
  return { hat: pick(CLOTH), robe: pick(CLOTH), hair: pick(SWATCHES.hair), skin: pick(SWATCHES.skin), gem: pick(SWATCHES.gem) }
}
