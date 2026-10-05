import { describe, expect, it } from 'vitest'
import { formatarEvento } from './terminalFormat'

// eslint-disable-next-line no-control-regex -- remove os códigos ANSI de cor de propósito
const semAnsi = (linhas: string[]) => linhas.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''))

describe('formatarEvento', () => {
  it('init mostra o modelo', () => {
    expect(semAnsi(formatarEvento({ type: 'system', subtype: 'init', model: 'claude-sonnet-5-5' }))).toEqual([
      '● sessão iniciada · claude-sonnet-5-5',
    ])
  })

  it('assistant mostra texto e ferramentas', () => {
    const linhas = semAnsi(
      formatarEvento({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Vou ler o índice.' },
            { type: 'tool_use', name: 'Read', input: { file_path: 'wiki/_master-index.md' } },
          ],
        },
      }),
    )
    expect(linhas).toEqual(['Vou ler o índice.', '⏺ Read(wiki/_master-index.md)'])
  })

  it('tool_result é resumido em 3 linhas', () => {
    const [linha] = semAnsi(
      formatarEvento({
        type: 'user',
        message: { content: [{ type: 'tool_result', content: 'a\nb\nc\nd\ne' }] },
      }),
    )
    expect(linha).toContain('⎿ a')
    expect(linha).toContain('(+2 linhas)')
  })

  it('result de sucesso e de erro', () => {
    expect(semAnsi(formatarEvento({ type: 'result', subtype: 'success', duration_ms: 1500 }))).toContain('✓ concluído em 1.5s')
    expect(semAnsi(formatarEvento({ type: 'result', subtype: 'error_max_turns', is_error: true }))[1]).toContain('erro')
  })

  it('ignora eventos desconhecidos e fim ok', () => {
    expect(formatarEvento({ type: 'stream_event' })).toEqual([])
    expect(formatarEvento({ type: 'lifeos_fim', status: 'ok' })).toEqual([])
  })
})
