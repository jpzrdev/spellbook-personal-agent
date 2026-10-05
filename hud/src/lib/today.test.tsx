import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GandalfText } from '../components/GandalfText'
import { dueStatus, longDate, shortDate } from './dates'

describe('dates', () => {
  it('formats a short date', () => {
    expect(shortDate('2026-10-05')).toBe('Oct 5')
  })

  it('spells out a long date', () => {
    expect(longDate('2026-10-03')).toBe('Saturday, October 3, 2026')
  })

  it('classifies the due date', () => {
    expect(dueStatus('2026-10-01', '2026-10-02')).toBe('overdue')
    expect(dueStatus('2026-10-02', '2026-10-02')).toBe('today')
    expect(dueStatus('2026-10-09', '2026-10-02')).toBe('upcoming')
    expect(dueStatus(null, '2026-10-02')).toBeNull()
  })
})

describe('GandalfText', () => {
  it('renders bold, code and list items', () => {
    render(<GandalfText text={'**Today, Friday**\n- 09:00 Lecture\nNoted in `raw/x.md`.'} />)
    expect(screen.getByText('Today, Friday').tagName).toBe('STRONG')
    expect(screen.getByText('09:00 Lecture')).toBeInTheDocument()
    expect(screen.getByText('raw/x.md').tagName).toBe('CODE')
  })
})
