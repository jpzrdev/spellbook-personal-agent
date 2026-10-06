import { useState } from 'react'
import type { DayCost } from '../lib/api'
import { cn } from '../lib/cn'
import { shortDate } from '../lib/dates'

// Series = Gandalf's tiers, stacked bottom-up in this fixed order (validated colors: tokens series-1..3).
const SERIES = [
  { key: '1', name: 'T1 · rules', color: 'var(--color-series-1)' },
  { key: '2', name: 'T2 · fast', color: 'var(--color-series-2)' },
  { key: '3', name: 'T3 · Claude Code', color: 'var(--color-series-3)' },
] as const

const HEIGHT = 180
const GAP = 2 // px of surface between stacked segments

function periodDays(end: string, days: number): string[] {
  const [y, m, d] = end.split('-').map(Number)
  const items: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i)
    items.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)
  }
  return items
}

function yScale(max: number): { top: number; ticks: number[] } {
  if (max <= 4) return { top: 4, ticks: [0, 2, 4] }
  const step = [1, 2, 5, 10, 20, 50, 100].find((p) => max / p <= 4) ?? Math.ceil(max / 4)
  const top = Math.ceil(max / step) * step
  const ticks = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  return { top, ticks }
}

type Props = { data: DayCost[]; days: number; today: string; table?: boolean }

/** Calls per day, stacked by tier. Hover shows the detail; `table` shows the numbers. */
export function UsageByDay({ data, days, today, table }: Props) {
  const [focus, setFocus] = useState<string | null>(null)
  const byDay = new Map(data.map((d) => [d.day, d]))
  const axis = periodDays(today, days).map(
    (day) => byDay.get(day) ?? { day, calls: { '1': 0, '2': 0, '3': 0 }, input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
  )
  const total = (d: DayCost) => d.calls['1'] + d.calls['2'] + d.calls['3']
  const { top, ticks } = yScale(Math.max(1, ...axis.map(total)))
  const totals = SERIES.map((s) => axis.reduce((n, d) => n + d.calls[s.key], 0))
  const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : 5
  const focused = axis.find((d) => d.day === focus)

  if (table)
    return (
      <div className="max-h-80 overflow-auto rounded-control shadow-sunken-sm">
        <table className="w-full text-sm">
          <caption className="sr-only">Calls per day and per tier</caption>
          <thead className="sticky top-0 bg-surface text-left text-xs text-ink-muted">
            <tr>
              <th className="p-2">Day</th>
              {SERIES.map((s) => (
                <th key={s.key} className="p-2 text-right">{s.name}</th>
              ))}
              <th className="p-2 text-right">Tokens</th>
              <th className="p-2 text-right">≈ US$</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[...axis].reverse().filter((d) => total(d) > 0).map((d) => (
              <tr key={d.day} className="border-t border-shade/40">
                <td className="p-2">{shortDate(d.day)}</td>
                {SERIES.map((s) => (
                  <td key={s.key} className="p-2 text-right">{d.calls[s.key]}</td>
                ))}
                <td className="p-2 text-right">{(d.input_tokens + d.output_tokens).toLocaleString('en-US')}</td>
                <td className="p-2 text-right">{d.estimated_cost_usd.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      {/* The legend is always there, with the period total (direct label: identity is never color alone). */}
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
        {SERIES.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-ink-muted">{s.name}</span>
            <span className="font-semibold tabular-nums">{totals[i]}</span>
          </li>
        ))}
      </ul>

      <div className="relative" onMouseLeave={() => setFocus(null)}>
        <div className="flex">
          {/* Recessive Y axis */}
          <div className="relative w-7 shrink-0 text-right text-[0.7rem] text-ink-muted tabular-nums" style={{ height: HEIGHT }} aria-hidden>
            {ticks.map((m) => (
              <span key={m} className="absolute right-1.5 -translate-y-1/2" style={{ top: HEIGHT - (m / top) * HEIGHT }}>
                {m}
              </span>
            ))}
          </div>
          <div className="relative flex-1" style={{ height: HEIGHT }}>
            {ticks.map((m) => (
              <div key={m} aria-hidden className="absolute inset-x-0 border-t border-shade/45" style={{ top: HEIGHT - (m / top) * HEIGHT }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]" role="img" aria-label={`Calls per day over the last ${days} days, stacked by tier`}>
              {axis.map((d) => {
                const segs = SERIES.map((s) => ({ ...s, n: d.calls[s.key] })).filter((s) => s.n > 0)
                return (
                  <button
                    key={d.day}
                    type="button"
                    aria-label={`${shortDate(d.day)}: ${total(d)} call(s)`}
                    onMouseEnter={() => setFocus(d.day)}
                    onFocus={() => setFocus(d.day)}
                    onBlur={() => setFocus(null)}
                    // Hover target = the whole column (bigger than the bar).
                    className={cn('relative flex h-full flex-1 cursor-default flex-col justify-end rounded-sm focus-visible:outline-2 focus-visible:outline-primary', focus === d.day && 'bg-ink/5')}
                  >
                    <span className="mx-auto flex w-full max-w-5 flex-col-reverse" style={{ gap: GAP }}>
                      {segs.map((s, i) => (
                        <span
                          key={s.key}
                          style={{ height: Math.max(2, (s.n / top) * HEIGHT - GAP), background: s.color }}
                          // Only the top segment is rounded (4px), anchored to the baseline.
                          className={cn('block w-full', i === segs.length - 1 && 'rounded-t-[4px]')}
                        />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        {/* X axis: one label every N days, always the last one (today). */}
        <div className="mt-1.5 flex pl-7 text-[0.7rem] text-ink-muted tabular-nums" aria-hidden>
          {axis.map((d, i) => (
            <span key={d.day} className="flex-1 text-center">
              {(axis.length - 1 - i) % labelEvery === 0 ? shortDate(d.day) : ''}
            </span>
          ))}
        </div>

        {focused && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 right-0 z-10 min-w-48 rounded-control bg-surface p-3 text-sm shadow-raised"
          >
            <p className="font-semibold">{shortDate(focused.day)}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {SERIES.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-ink-muted">
                    <span aria-hidden className="size-2 rounded-sm" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="font-semibold tabular-nums">{focused.calls[s.key]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-ink-muted tabular-nums">
              {(focused.input_tokens + focused.output_tokens).toLocaleString('en-US')} tokens · ≈ US$ {focused.estimated_cost_usd.toFixed(3)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
