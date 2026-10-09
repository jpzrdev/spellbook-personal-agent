const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "5 min ago", "today 09:15", "yesterday 23:00", "Sat 23:00", "Oct 3 23:00". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60_000)
  if (diffMin >= 0 && diffMin < 1) return 'now'
  if (diffMin > 0 && diffMin < 60) return `${diffMin} min ago`
  if (sameDay(d, now)) return `today ${hhmm(d)}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `yesterday ${hhmm(d)}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (sameDay(d, tomorrow)) return `tomorrow ${hhmm(d)}`
  const days = Math.abs(now.getTime() - d.getTime()) / 86_400_000
  if (days < 6) return `${WEEKDAYS[d.getDay()]} ${hhmm(d)}`
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${hhmm(d)}`
}

/** How long until something expires: "in 6 days", "in 5 h", "in 20 min", "soon". */
export function expiresIn(iso: string, now: Date = new Date()): string {
  const min = Math.floor((new Date(iso).getTime() - now.getTime()) / 60_000)
  if (min < 1) return 'soon'
  if (min < 60) return `in ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 48) return `in ${hours} h`
  return `in ${Math.floor(hours / 24)} days`
}

export type Days = 'every' | 'weekdays' | 'weekend' | 'custom'

/** Reads a simple cron back into the form (null = needs the advanced mode). */
export function readCron(cron: string): { time: string; days: Days; custom: number[] } | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [m, h, day, month, week] = parts
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h) || day !== '*' || month !== '*') return null
  const time = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  if (week === '*') return { time, days: 'every', custom: [1, 3, 5] }
  if (week === '1-5') return { time, days: 'weekdays', custom: [1, 3, 5] }
  if (week === '0,6' || week === '6,0') return { time, days: 'weekend', custom: [1, 3, 5] }
  if (/^[0-7](,[0-7])*$/.test(week)) return { time, days: 'custom', custom: [...new Set(week.split(',').map((d) => Number(d) % 7))] }
  return null
}

/** Builds the cron expression from the simple form. Custom days: 0 = Sun … 6 = Sat. */
export function buildCron(time: string, days: Days, custom: number[]): string {
  const [h, m] = time.split(':').map((x) => Number(x) || 0)
  const dayField = days === 'every' ? '*' : days === 'weekdays' ? '1-5' : days === 'weekend' ? '0,6' : [...custom].sort().join(',') || '*'
  return `${m} ${h} * * ${dayField}`
}
