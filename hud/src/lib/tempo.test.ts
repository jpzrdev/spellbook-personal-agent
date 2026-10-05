import { describe, expect, it } from 'vitest'
import { montarCron, quandoRelativo } from './tempo'

describe('quandoRelativo', () => {
  const agora = new Date(2026, 9, 3, 10, 0) // sáb 03/10 10:00 (hora local)

  it('minutos, hoje, ontem, amanhã', () => {
    expect(quandoRelativo(new Date(2026, 9, 3, 9, 55).toISOString(), agora)).toBe('há 5 min')
    expect(quandoRelativo(new Date(2026, 9, 3, 7, 0).toISOString(), agora)).toBe('hoje 07:00')
    expect(quandoRelativo(new Date(2026, 9, 2, 23, 0).toISOString(), agora)).toBe('ontem 23:00')
    expect(quandoRelativo(new Date(2026, 9, 4, 6, 50).toISOString(), agora)).toBe('amanhã 06:50')
  })

  it('dia da semana e data', () => {
    expect(quandoRelativo(new Date(2026, 9, 5, 6, 50).toISOString(), agora)).toBe('seg 06:50')
    expect(quandoRelativo(new Date(2026, 8, 20, 8, 0).toISOString(), agora)).toBe('20/09 08:00')
  })
})

describe('montarCron', () => {
  it('monta as variações', () => {
    expect(montarCron('06:50', 'uteis', [])).toBe('50 6 * * 1-5')
    expect(montarCron('23:00', 'todo', [])).toBe('0 23 * * *')
    expect(montarCron('20:00', 'fds', [])).toBe('0 20 * * 0,6')
    expect(montarCron('19:30', 'custom', [5, 1, 3])).toBe('30 19 * * 1,3,5')
  })
})

describe('lerCron', () => {
  it('volta para o formulário simples', async () => {
    const { lerCron, montarCron } = await import('./tempo')
    expect(lerCron('50 23 * * *')).toMatchObject({ hora: '23:50', dias: 'todo' })
    expect(lerCron('0 8 * * 1-5')).toMatchObject({ hora: '08:00', dias: 'uteis' })
    expect(lerCron('30 7 * * 1,3')).toMatchObject({ dias: 'custom', custom: [1, 3] })
    expect(lerCron('0 7-22/2 * * *')).toBeNull()
    const r = lerCron('15 6 * * 0,6')!
    expect(montarCron(r.hora, r.dias, r.custom)).toBe('15 6 * * 0,6')
  })
})
