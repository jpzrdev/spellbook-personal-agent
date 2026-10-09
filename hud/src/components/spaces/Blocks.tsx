import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, Pause, Play, RotateCcw, Table2, Timer } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { clock, display, images, links, listItems, section, series, seriesNames, steps, table, type Block, type FieldValue, type SpaceConfig, type SpaceItem, type Step } from '../../lib/spaces'
import { Markdown } from '../Markdown'
import { Button, Checkbox, Modal, ProgressBar, useToast } from '../ui'
import { focusRing, raised, solid, sunken } from '../ui/styles'
import { FieldEditor, FieldText, MemoryImage } from './Fields'

type Handlers = {
  /** The section a button is writing right now (the assistant is working on it). */
  writing?: string | null
  /** Saves a property; without it, the properties are read-only (a template's preview). */
  onField?: (key: string, value: FieldValue) => void
  /** Checks a persisted checklist item. */
  onCheck?: (section: string, index: number, done: boolean) => void
}

function Empty({ name }: { name: string }) {
  return <p className="text-sm text-ink-muted">Nothing in “{name}” yet.</p>
}

function Frame({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn(raised, 'flex flex-col gap-4 rounded-card p-5')}>
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-lg font-semibold">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

function Properties({ config, item, keys, onField }: { config: SpaceConfig; item: SpaceItem; keys: string[] } & Handlers) {
  const fields = (keys.length ? keys.map((k) => config.fields.find((f) => f.key === k)) : config.fields).filter((f) => f !== undefined)
  if (!fields.length) return null
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className="flex min-w-0 flex-col gap-1.5">
          <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{f.label}</dt>
          <dd className="min-h-9 content-center">
            {onField ? (
              <FieldEditor field={f} value={item.fields[f.key]} onChange={(v) => onField(f.key, v)} />
            ) : display(f, item.fields[f.key]) ? (
              <FieldText field={f} value={item.fields[f.key]} />
            ) : (
              <span className="text-sm text-ink-muted">—</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Checklist({ text, name, persist, onCheck }: { text: string; name: string; persist: boolean } & Handlers) {
  const items = listItems(text)
  const saved = items.map((i) => i.checked)
  const [local, setLocal] = useState<boolean[]>(saved)
  const key = saved.join()
  useEffect(() => setLocal(key.split(',').map((v) => v === 'true')), [key])
  if (!items.length) return <Empty name={name} />
  const state = persist && onCheck ? saved : local
  const done = state.filter(Boolean).length

  return (
    <div className="flex flex-col gap-4">
      <ProgressBar value={done} max={items.length} label={`${done} of ${items.length}`} showValue={false} />
      <ul className="flex flex-col gap-2.5">
        {items.map((it, i) => (
          <li key={i}>
            <Checkbox
              label={it.text}
              strikethrough
              checked={state[i] ?? false}
              onChange={(e) => (persist && onCheck ? onCheck(name, i, e.target.checked) : setLocal((l) => l.map((v, j) => (j === i ? e.target.checked : v))))}
            />
          </li>
        ))}
      </ul>
      {!persist && done > 0 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setLocal(items.map(() => false))}>
          <RotateCcw className="size-4" aria-hidden /> Uncheck all
        </Button>
      )}
    </div>
  )
}

/** A countdown that survives re-renders and tells when it ends (toast + vibration on the phone). */
function useCountdown(seconds: number, label: string) {
  const toast = useToast()
  const [left, setLeft] = useState(seconds)
  const [running, setRunning] = useState(false)
  const end = useRef(0)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const rest = Math.max(0, (end.current - Date.now()) / 1000)
      setLeft(rest)
      if (rest <= 0) {
        setRunning(false)
        toast('success', `Time's up: ${label}`)
        navigator.vibrate?.([200, 100, 200])
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [running, label, toast])

  return {
    left,
    running,
    finished: left <= 0,
    toggle() {
      if (running) return setRunning(false)
      end.current = Date.now() + (left > 0 ? left : seconds) * 1000
      if (left <= 0) setLeft(seconds)
      setRunning(true)
    },
    reset() {
      setRunning(false)
      setLeft(seconds)
    },
  }
}

function StepTimer({ step, large }: { step: Step & { seconds: number }; large?: boolean }) {
  const t = useCountdown(step.seconds, step.text.slice(0, 60))
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-pill py-1 pr-1 pl-3 shadow-raised-sm', t.finished && 'text-primary-text', large && 'gap-3 py-2 pl-5 text-2xl')}>
      <Timer className={cn('size-4 text-ink-muted', large && 'size-6', t.running && 'animate-pulse text-primary')} aria-hidden />
      <span role="timer" aria-live="off" className="font-semibold tabular-nums">
        {clock(t.left)}
      </span>
      <button type="button" aria-label={t.running ? 'Pause' : 'Start timer'} onClick={t.toggle} className={cn('grid cursor-pointer place-items-center rounded-pill shadow-raised-sm active:shadow-sunken-sm', large ? 'size-12' : 'size-7', focusRing)}>
        {t.running ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
      </button>
      {(t.running || t.left !== step.seconds) && (
        <button type="button" aria-label="Reset timer" onClick={t.reset} className={cn('grid cursor-pointer place-items-center rounded-pill text-ink-muted hover:text-ink', large ? 'size-12' : 'size-7', focusRing)}>
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  )
}

function Steps({ text, name, timers, color }: { text: string; name: string; timers: boolean; color: SpaceConfig['color'] }) {
  const list = steps(text)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [focus, setFocus] = useState<number | null>(null)
  if (!list.length) return <Empty name={name} />
  const toggle = (i: number) => setDone((d) => new Set(d.has(i) ? [...d].filter((x) => x !== i) : [...d, i]))
  const total = list.reduce((n, s) => n + (s.seconds ?? 0), 0)

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
        <span>
          {list.length} steps{total ? ` · ${clock(total)} of timers` : ''}
        </span>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setFocus(Math.max(0, list.findIndex((_, i) => !done.has(i))))}>
          <Maximize2 className="size-4" aria-hidden /> Focus mode
        </Button>
      </div>
      <ol className="relative flex flex-col">
        {list.map((s, i) => {
          const isDone = done.has(i)
          return (
            <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
              {i < list.length - 1 && <span aria-hidden className={cn('absolute top-9 bottom-0 left-[1.0625rem] w-0.5 rounded-pill', isDone ? solid[color] : 'bg-shade/60')} />}
              <button
                type="button"
                aria-pressed={isDone}
                aria-label={`Step ${i + 1}${isDone ? ', done' : ''}`}
                onClick={() => toggle(i)}
                className={cn(
                  'relative z-10 grid size-9 shrink-0 cursor-pointer place-items-center rounded-pill text-sm font-bold transition-[box-shadow,background-color]',
                  isDone ? cn(solid[color], 'text-on-primary shadow-raised-sm') : 'bg-surface shadow-raised-sm hover:shadow-raised',
                  focusRing,
                )}
              >
                {i + 1}
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1.5">
                <p className={cn('leading-snug', isDone && 'text-ink-muted line-through')}>{s.text}</p>
                {timers && s.seconds !== null && <StepTimer step={s as Step & { seconds: number }} />}
              </div>
            </li>
          )
        })}
      </ol>
      {focus !== null && (
        <Modal open onClose={() => setFocus(null)} title={`Step ${focus + 1} of ${list.length}`} icon={<Maximize2 />} wide>
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-8 py-4 text-center">
            <p className="text-2xl leading-snug font-semibold sm:text-3xl">{list[focus].text}</p>
            {timers && list[focus].seconds !== null && <StepTimer key={focus} step={list[focus] as Step & { seconds: number }} large />}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={focus === 0} onClick={() => setFocus(focus - 1)}>
              <ChevronLeft className="size-4" aria-hidden /> Back
            </Button>
            {focus < list.length - 1 ? (
              <Button
                onClick={() => {
                  setDone((d) => new Set([...d, focus]))
                  setFocus(focus + 1)
                }}
              >
                Next <ChevronRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setDone((d) => new Set([...d, focus]))
                  setFocus(null)
                }}
              >
                Done
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

function Gallery({ text, name }: { text: string; name: string }) {
  const list = images(text)
  const [open, setOpen] = useState<number | null>(null)
  if (!list.length) return <Empty name={name} />
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((img, i) => (
          <li key={i}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`Open ${img.alt || 'image'}`} className={cn('block w-full cursor-zoom-in overflow-hidden rounded-control shadow-raised-sm', focusRing)}>
              <MemoryImage src={img.src} alt={img.alt} className="aspect-square w-full" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Modal open onClose={() => setOpen(null)} title={list[open].alt || name} wide>
          <MemoryImage src={list[open].src} alt={list[open].alt} className="max-h-[70vh] w-full rounded-control object-contain" />
        </Modal>
      )}
    </>
  )
}

function Links({ text, name }: { text: string; name: string }) {
  const list = links(text)
  if (!list.length) return <Empty name={name} />
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {list.map((l) => (
        <li key={l.href}>
          <a href={l.href} target="_blank" rel="noreferrer" className={cn('flex items-center gap-3 rounded-control p-3 shadow-raised-sm transition-shadow hover:shadow-raised', focusRing)}>
            <span aria-hidden className={cn(sunken, 'grid size-10 shrink-0 place-items-center rounded-pill font-display text-lg font-semibold text-ink-muted uppercase')}>
              {l.host[0]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{l.label}</span>
              <span className="truncate text-xs text-ink-muted">{l.note || l.host}</span>
            </span>
            <ExternalLink className="size-4 shrink-0 text-ink-muted" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  )
}

const W = 560
const H = 200
const PAD = { top: 12, right: 12, bottom: 28, left: 40 }

function Chart({ text, name, x, y, kind, by }: { text: string; name: string; x: string; y: string; kind: 'line' | 'bar'; by?: string | null }) {
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const t = table(text)
  const names = t && by ? seriesNames(t, by) : []
  const [picked, setPicked] = useState<string | null>(null)
  const current = picked && names.some((n) => n.toLowerCase() === picked.toLowerCase()) ? picked : (names[0] ?? null)
  const points = t ? series(t, x, y, by, current) : []
  if (!t || !points.length) return <p className="text-sm text-ink-muted">Nothing logged in “{name}” yet.</p>

  const values = points.map((p) => p.y)
  const lo = Math.min(0, ...values)
  const hi = Math.max(...values) || 1
  const step = (W - PAD.left - PAD.right) / Math.max(1, points.length - (kind === 'bar' ? 0 : 1))
  const px = (i: number) => PAD.left + (kind === 'bar' ? step * (i + 0.5) : step * i)
  const py = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const ticks = [lo, (lo + hi) / 2, hi]
  const labelEvery = Math.ceil(points.length / 6)
  const focused = hover !== null ? points[hover] : points[points.length - 1]

  return (
    <div className="flex flex-col gap-3">
      {names.length > 1 && !asTable && (
        <div role="radiogroup" aria-label={by ?? ''} className="flex flex-wrap gap-2">
          {names.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === current}
              onClick={() => (setPicked(n), setHover(null))}
              className={cn('cursor-pointer rounded-pill px-3 py-1 text-sm font-semibold', n === current ? 'text-primary-text shadow-sunken-sm' : 'text-ink-muted shadow-raised-sm', focusRing)}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          {current && names.length === 1 && <span className="font-semibold">{current} · </span>}
          <span className="text-ink-muted">{focused.x}: </span>
          <span className="text-lg font-semibold tabular-nums">{focused.y}</span> <span className="text-ink-muted">{y}</span>
        </p>
        <Button variant="ghost" size="sm" className="ml-auto" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          <Table2 className="size-4" aria-hidden /> {asTable ? 'Chart' : 'Table'}
        </Button>
      </div>
      {asTable ? (
        <Markdown text={text} className="text-sm" />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${y} by ${x}, ${points.length} points, last ${points[points.length - 1].y}`} className="w-full overflow-visible" onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={py(v)} y2={py(v)} stroke="var(--color-shade)" strokeDasharray="3 4" />
              <text x={PAD.left - 8} y={py(v)} textAnchor="end" dominantBaseline="middle" className="fill-ink-muted text-[11px] tabular-nums">
                {Number.isInteger(v) ? v : v.toFixed(1)}
              </text>
            </g>
          ))}
          {kind === 'bar'
            ? points.map((p, i) => (
                <rect key={i} x={px(i) - step * 0.3} width={step * 0.6} y={py(p.y)} height={Math.max(1, py(lo) - py(p.y))} rx={4} fill="var(--color-series-1)" opacity={hover === null || hover === i ? 1 : 0.5} />
              ))
            : (
              <polyline points={points.map((p, i) => `${px(i)},${py(p.y)}`).join(' ')} fill="none" stroke="var(--color-series-1)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            )}
          {kind === 'line' && points.map((p, i) => <circle key={i} cx={px(i)} cy={py(p.y)} r={hover === i ? 5 : 3.5} fill="var(--color-surface)" stroke="var(--color-series-1)" strokeWidth={2} />)}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text key={i} x={px(i)} y={H - 8} textAnchor="middle" className="fill-ink-muted text-[11px]">
                {p.x.length > 10 ? p.x.slice(5) : p.x}
              </text>
            ) : null,
          )}
          {points.map((_, i) => (
            <rect key={i} x={px(i) - step / 2} width={step} y={0} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
      )}
    </div>
  )
}

function Writing() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm font-semibold text-primary-text">
      <span aria-hidden className="size-2 animate-pulse rounded-pill bg-primary" /> The assistant is writing this…
    </p>
  )
}

/** One block of an item, drawn from its section of the note. */
function BlockView({ block, config, item, onField, onCheck, writing }: { block: Block; config: SpaceConfig; item: SpaceItem } & Handlers) {
  if (block.block === 'properties')
    return (
      <Frame title={block.title ?? 'Details'}>
        <Properties config={config} item={item} keys={block.fields} onField={onField} />
      </Frame>
    )
  const text = section(item, block.section)
  const title = block.title ?? block.section
  switch (block.block) {
    case 'checklist':
      return (
        <Frame title={title}>
          <Checklist text={text} name={block.section} persist={block.persist} onCheck={onCheck} />
        </Frame>
      )
    case 'steps':
      return (
        <Frame title={title}>
          <Steps text={text} name={block.section} timers={block.timers} color={config.color} />
        </Frame>
      )
    case 'gallery':
      return (
        <Frame title={title}>
          <Gallery text={text} name={block.section} />
        </Frame>
      )
    case 'links':
      return (
        <Frame title={title}>
          <Links text={text} name={block.section} />
        </Frame>
      )
    case 'chart':
      return (
        <Frame title={title}>
          <Chart text={text} name={block.section} x={block.x} y={block.y} kind={block.kind} by={block.series} />
        </Frame>
      )
    default:
      return (
        <Frame title={title}>
          {writing && writing.toLowerCase() === block.section.toLowerCase() && <Writing />}
          {text ? <Markdown text={text} /> : writing?.toLowerCase() === block.section.toLowerCase() ? null : <Empty name={block.section} />}
        </Frame>
      )
  }
}

/** The item's page: its intro and the page's blocks, top to bottom. */
export function ItemBody({ config, item, onField, onCheck, writing }: { config: SpaceConfig; item: SpaceItem } & Handlers) {
  return (
    <div className="flex flex-col gap-5">
      {item.intro && <Markdown text={item.intro} className="text-ink-muted" />}
      {config.item.map((block, i) => (
        <BlockView key={i} block={block} config={config} item={item} onField={onField} onCheck={onCheck} writing={writing} />
      ))}
    </div>
  )
}
