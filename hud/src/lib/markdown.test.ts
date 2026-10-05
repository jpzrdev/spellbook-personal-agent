import { describe, expect, it } from 'vitest'
import { wikilinks } from './markdown'

describe('wikilinks', () => {
  it('converte links do Obsidian em links para a tela Vault', () => {
    expect(wikilinks('veja [[wiki/estudos/limites]]')).toBe('veja [limites](/vault?nota=wiki%2Festudos%2Flimites.md)')
    expect(wikilinks('[[raw/ideia.md|a ideia]]')).toBe('[a ideia](/vault?nota=raw%2Fideia.md)')
    expect(wikilinks('sem links')).toBe('sem links')
  })
})

describe('callouts do Obsidian', () => {
  it('viram details recolhidos', async () => {
    const { render } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { MemoryRouter } = await import('react-router')
    const { Markdown } = await import('../components/Markdown')
    const { container } = render(
      createElement(MemoryRouter, null, createElement(Markdown, { texto: '1. Pergunta?\n> [!note]- Resposta\n> É isso.' })),
    )
    const d = container.querySelector('details')!
    expect(d).toBeTruthy()
    expect(d.open).toBe(false)
    expect(d.querySelector('summary')!.textContent).toBe('Resposta')
    expect(d.textContent).toContain('É isso.')
  })
})
