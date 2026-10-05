const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** '2026-10-05' → 'Oct 5' */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return m && d ? `${MONTHS[m - 1].slice(0, 3)} ${d}` : iso
}

export type Due = 'overdue' | 'today' | 'upcoming' | null

export function dueStatus(due: string | null, today: string): Due {
  if (!due) return null
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  return 'upcoming'
}

/** '2026-10-03' → 'Saturday, October 3, 2026' (spelled out to catch voice errors: "3" → "13"). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`
}
