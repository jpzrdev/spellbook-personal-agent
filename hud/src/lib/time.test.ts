import { describe, expect, it } from 'vitest'
import { buildCron, readCron, relativeTime } from './time'

describe('relativeTime', () => {
  const now = new Date(2026, 9, 3, 10, 0) // Sat 10/03 10:00 (local time)

  it('minutes, today, yesterday, tomorrow', () => {
    expect(relativeTime(new Date(2026, 9, 3, 9, 55).toISOString(), now)).toBe('5 min ago')
    expect(relativeTime(new Date(2026, 9, 3, 7, 0).toISOString(), now)).toBe('today 07:00')
    expect(relativeTime(new Date(2026, 9, 2, 23, 0).toISOString(), now)).toBe('yesterday 23:00')
    expect(relativeTime(new Date(2026, 9, 4, 6, 50).toISOString(), now)).toBe('tomorrow 06:50')
  })

  it('weekday and date', () => {
    expect(relativeTime(new Date(2026, 9, 5, 6, 50).toISOString(), now)).toBe('Mon 06:50')
    expect(relativeTime(new Date(2026, 8, 20, 8, 0).toISOString(), now)).toBe('Sep 20 08:00')
  })
})

describe('buildCron', () => {
  it('builds the variations', () => {
    expect(buildCron('06:50', 'weekdays', [])).toBe('50 6 * * 1-5')
    expect(buildCron('23:00', 'every', [])).toBe('0 23 * * *')
    expect(buildCron('20:00', 'weekend', [])).toBe('0 20 * * 0,6')
    expect(buildCron('19:30', 'custom', [5, 1, 3])).toBe('30 19 * * 1,3,5')
  })
})

describe('readCron', () => {
  it('goes back to the simple form', () => {
    expect(readCron('50 23 * * *')).toMatchObject({ time: '23:50', days: 'every' })
    expect(readCron('0 8 * * 1-5')).toMatchObject({ time: '08:00', days: 'weekdays' })
    expect(readCron('30 7 * * 1,3')).toMatchObject({ days: 'custom', custom: [1, 3] })
    expect(readCron('0 7-22/2 * * *')).toBeNull()
    const r = readCron('15 6 * * 0,6')!
    expect(buildCron(r.time, r.days, r.custom)).toBe('15 6 * * 0,6')
  })
})
