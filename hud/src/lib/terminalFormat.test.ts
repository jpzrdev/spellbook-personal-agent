import { describe, expect, it } from 'vitest'
import { formatEvent } from './terminalFormat'

// eslint-disable-next-line no-control-regex -- strips the ANSI color codes on purpose
const noAnsi = (lines: string[]) => lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''))

describe('formatEvent', () => {
  it('init shows the model', () => {
    expect(noAnsi(formatEvent({ type: 'system', subtype: 'init', model: 'claude-sonnet-5-5' }))).toEqual([
      '● session started · claude-sonnet-5-5',
    ])
  })

  it('assistant shows text and tools', () => {
    const lines = noAnsi(
      formatEvent({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: "I'll read the index." },
            { type: 'tool_use', name: 'Read', input: { file_path: 'wiki/_master-index.md' } },
          ],
        },
      }),
    )
    expect(lines).toEqual(["I'll read the index.", '⏺ Read(wiki/_master-index.md)'])
  })

  it('tool_result is summarized in 3 lines', () => {
    const [line] = noAnsi(
      formatEvent({
        type: 'user',
        message: { content: [{ type: 'tool_result', content: 'a\nb\nc\nd\ne' }] },
      }),
    )
    expect(line).toContain('⎿ a')
    expect(line).toContain('(+2 lines)')
  })

  it('success and error results', () => {
    expect(noAnsi(formatEvent({ type: 'result', subtype: 'success', duration_ms: 1500 }))).toContain('✓ done in 1.5s')
    expect(noAnsi(formatEvent({ type: 'result', subtype: 'error_max_turns', is_error: true }))[1]).toContain('error')
  })

  it('ignores unknown events and an ok end', () => {
    expect(formatEvent({ type: 'stream_event' })).toEqual([])
    expect(formatEvent({ type: 'gandalf_end', status: 'ok' })).toEqual([])
  })
})
