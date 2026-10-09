import { describe, expect, it } from 'vitest'
import { arrange, clock, display, duration, images, links, listItems, series, seriesNames, stepNames, steps, table, type Collection, type FieldDef, type SpaceItem } from './spaces'

describe('page parsers', () => {
  it('reads the top-level list items, checked or not', () => {
    expect(listItems('- 3 eggs\n- [x] flour\n  - nested\n1. [ ] sugar\ntext')).toEqual([
      { text: '3 eggs', checked: false },
      { text: 'flour', checked: true },
      { text: 'sugar', checked: false },
    ])
  })

  it('finds durations in steps, in English and Portuguese', () => {
    expect(duration('Bake (40 min)')).toBe(2400)
    expect(duration('Descanse (1,5 h)')).toBe(5400)
    expect(duration('Prancha (30 seg)')).toBe(30)
    expect(duration('Mix well')).toBeNull()
    expect(steps('1. Preheat (10 min)\n2. Mix')).toEqual([
      { text: 'Preheat (10 min)', seconds: 600 },
      { text: 'Mix', seconds: null },
    ])
    expect(clock(3725)).toBe('1:02:05')
    expect(clock(65)).toBe('1:05')
  })

  it('reads images, links and tables', () => {
    expect(images('![cake](https://x.dev/a.png) and ![[raw/photo.jpg|My photo]]')).toEqual([
      { src: 'https://x.dev/a.png', alt: 'cake' },
      { src: 'raw/photo.jpg', alt: 'My photo' },
    ])
    expect(links('- [Astro docs](https://docs.astro.build): the framework\n- https://www.are.na\n- no link')).toEqual([
      { label: 'Astro docs', href: 'https://docs.astro.build', host: 'docs.astro.build', note: 'the framework' },
      { label: 'are.na', href: 'https://www.are.na', host: 'are.na', note: '' },
    ])
    const t = table('intro\n| Date | Load (kg) |\n|---|---|\n| 2026-09-15 | 40 |\n| 2026-09-22 | 42,5 |\n| skip | - |')!
    expect(t.headers).toEqual(['Date', 'Load (kg)'])
    expect(series(t, 'date', 'Load (kg)')).toEqual([
      { x: '2026-09-15', y: 40 },
      { x: '2026-09-22', y: 42.5 },
    ])
  })
})

describe('workout helpers', () => {
  it('splits a log in series and names the exercises', () => {
    const t = table('| Date | Exercise | Load (kg) |\n|---|---|---|\n| 09-15 | Bench | 40 |\n| 09-15 | Squat | 60 |\n| 09-22 | bench | 42.5 |')!
    expect(seriesNames(t, 'exercise')).toEqual(['Bench', 'Squat'])
    expect(series(t, 'Date', 'Load (kg)', 'Exercise', 'Bench')).toEqual([
      { x: '09-15', y: 40 },
      { x: '09-22', y: 42.5 },
    ])
    expect(stepNames('1. Bench press: 4 × 8\n2. Rest (2 min)\n3. Plank (1 min)\n4. Agachamento — 3 × 10')).toEqual(['Bench press', 'Plank', 'Agachamento'])
  })
})

describe('arranging a collection', () => {
  const item = (title: string, fields: SpaceItem['fields']): SpaceItem => ({ id: title, title, fields, summary: '', updated: '' })
  const items = [
    item('A', { rating: 3, tags: ['oven'], tried: true }),
    item('B', { rating: null, tags: [], tried: false }),
    item('C', { rating: 5, tags: ['oven', 'quick'], tried: false }),
  ]
  const c: Collection = { view: 'cards', show: [], filters: [], sort: { field: 'rating', order: 'desc' } }

  it('sorts with empty values last and filters by tag and bool', () => {
    expect(arrange(items, c, {}).map((i) => i.title)).toEqual(['C', 'A', 'B'])
    expect(arrange(items, { ...c, sort: { field: 'rating', order: 'asc' } }, {}).map((i) => i.title)).toEqual(['A', 'C', 'B'])
    expect(arrange(items, c, { tags: 'oven', tried: false }).map((i) => i.title)).toEqual(['C'])
    expect(arrange(items, c, {}, 'b').map((i) => i.title)).toEqual(['B'])
  })

  it('shows values as short text', () => {
    const f = (type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({ key: 'k', label: 'K', type, options: [], ...extra })
    expect(display(f('duration'), 90)).toBe('1 h 30 min')
    expect(display(f('progress', { max: 300 }), 150)).toBe('50%')
    expect(display(f('select', { options: [{ value: 'want', label: 'Want to read', color: 'silver' }] }), 'want')).toBe('Want to read')
    expect(display(f('url'), 'https://www.github.com/x')).toBe('github.com')
    expect(display(f('text'), null)).toBe('')
  })
})
