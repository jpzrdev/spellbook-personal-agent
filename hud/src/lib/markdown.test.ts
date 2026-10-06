import { describe, expect, it } from 'vitest'
import { wikilinks } from './markdown'

describe('wikilinks', () => {
  it('turns Obsidian links into links to the Vault screen', () => {
    expect(wikilinks('see [[wiki/studies/limits]]')).toBe('see [limits](/vault?note=wiki%2Fstudies%2Flimits.md)')
    expect(wikilinks('[[raw/idea.md|the idea]]')).toBe('[the idea](/vault?note=raw%2Fidea.md)')
    expect(wikilinks('no links')).toBe('no links')
  })
})

describe('Obsidian callouts', () => {
  it('become collapsed details', async () => {
    const { render } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { MemoryRouter } = await import('react-router')
    const { Markdown } = await import('../components/Markdown')
    const { container } = render(
      createElement(MemoryRouter, null, createElement(Markdown, { text: '1. Question?\n> [!note]- Answer\n> That is it.' })),
    )
    const d = container.querySelector('details')!
    expect(d).toBeTruthy()
    expect(d.open).toBe(false)
    expect(d.querySelector('summary')!.textContent).toBe('Answer')
    expect(d.textContent).toContain('That is it.')
  })
})
