import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextoGandalf } from '../components/TextoGandalf'
import { ddmm, prazo } from './datas'

describe('datas', () => {
  it('formata dd/mm', () => {
    expect(ddmm('2026-10-05')).toBe('05/10')
  })

  it('classifica o prazo', () => {
    expect(prazo('2026-10-01', '2026-10-02')).toBe('atrasada')
    expect(prazo('2026-10-02', '2026-10-02')).toBe('hoje')
    expect(prazo('2026-10-09', '2026-10-02')).toBe('futura')
    expect(prazo(null, '2026-10-02')).toBeNull()
  })
})

describe('TextoGandalf', () => {
  it('renderiza negrito, código e itens de lista', () => {
    render(<TextoGandalf texto={'**Hoje, sexta**\n- 09:00 Aula\nAnotado em `raw/x.md`.'} />)
    expect(screen.getByText('Hoje, sexta').tagName).toBe('STRONG')
    expect(screen.getByText('09:00 Aula')).toBeInTheDocument()
    expect(screen.getByText('raw/x.md').tagName).toBe('CODE')
  })
})
