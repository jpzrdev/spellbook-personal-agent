import { Check, ExternalLink, ImageOff, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchMemoryFile } from '../../lib/api'
import { cn } from '../../lib/cn'
import { display, optionOf, type FieldDef, type FieldValue } from '../../lib/spaces'
import { Badge, Toggle } from '../ui'
import { focusRing, solid, sunken } from '../ui/styles'

/** An image from the web or from the memory (memory files need the token, so they come as an object URL). */
export function MemoryImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const remote = /^(https?:|data:)/.test(src)
  const [url, setUrl] = useState<string | null>(remote ? src : null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (remote) return
    let alive = true
    let created: string | null = null
    fetchMemoryFile(src.replace(/^\/+/, ''))
      .then((u) => {
        created = u
        if (alive) setUrl(u)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [src, remote])

  if (failed)
    return (
      <span role="img" aria-label={alt} className={cn(sunken, 'grid place-items-center text-ink-muted', className)}>
        <ImageOff className="size-5" aria-hidden />
      </span>
    )
  return url ? <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn('object-cover', className)} /> : <span className={cn(sunken, 'animate-pulse', className)} />
}

export function Stars({ value, max = 5, onChange, label }: { value: number; max?: number; onChange?: (v: number) => void; label: string }) {
  const count = Math.round(max)
  if (!onChange)
    return (
      <span role="img" aria-label={`${label}: ${value} of ${count}`} className="inline-flex gap-0.5 text-gold">
        {Array.from({ length: count }, (_, i) => (
          <Star key={i} aria-hidden className={cn('size-3.5', i < value ? 'fill-current' : 'opacity-35')} />
        ))}
      </span>
    )
  return (
    <span role="radiogroup" aria-label={label} className="inline-flex gap-1 text-gold">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          aria-label={`${i + 1}`}
          onClick={() => onChange(value === i + 1 ? 0 : i + 1)}
          className={cn('cursor-pointer rounded-pill p-0.5 transition-transform hover:scale-110', focusRing)}
        >
          <Star aria-hidden className={cn('size-5', i < value ? 'fill-current' : 'opacity-35')} />
        </button>
      ))}
    </span>
  )
}

export function MiniProgress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.round((Math.min(Math.max(value, 0), max) / max) * 100)
  return (
    <span className="inline-flex min-w-24 items-center gap-2">
      <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 flex-1 overflow-hidden rounded-pill bg-surface shadow-sunken-sm">
        <span className={cn('block h-full rounded-pill', solid.primary)} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs text-ink-muted tabular-nums">{pct}%</span>
    </span>
  )
}

/** A value read-only, in the compact form of cards, rows and kanban cards. */
export function FieldText({ field: f, value }: { field: FieldDef; value: FieldValue | undefined }) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return null
  switch (f.type) {
    case 'select': {
      const o = optionOf(f, value)
      return <Badge color={o?.color ?? 'silver'}>{o?.label ?? String(value)}</Badge>
    }
    case 'tags':
      return (
        <span className="inline-flex flex-wrap gap-1">
          {(value as string[]).map((t) => (
            <span key={t} className="rounded-pill px-2 py-0.5 text-xs font-medium text-ink-muted shadow-raised-sm">
              #{t}
            </span>
          ))}
        </span>
      )
    case 'rating':
      return <Stars value={Number(value)} max={f.max ?? 5} label={f.label} />
    case 'progress':
      return <MiniProgress value={Number(value)} max={f.max ?? 100} label={f.label} />
    case 'bool':
      return value ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-text">
          <Check className="size-3.5" aria-hidden /> {f.label}
        </span>
      ) : null
    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={cn('inline-flex items-center gap-1 text-sm font-semibold text-primary-text underline-offset-2 hover:underline', focusRing)}>
          {display(f, value)} <ExternalLink className="size-3" aria-hidden />
        </a>
      )
    case 'image':
      return null
    default:
      return <span className="text-sm text-ink-muted">{display(f, value)}</span>
  }
}

const inline = cn(sunken, 'h-9 w-full rounded-control px-3 text-sm placeholder:text-ink-muted/70', focusRing)

/** A text-like input that saves when it loses focus or on Enter (and goes back on Esc). */
function DraftInput({ value, onSave, type = 'text', placeholder, label }: { value: string; onSave: (v: string) => void; type?: string; placeholder?: string; label: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => draft !== value && onSave(draft)
  return (
    <input
      aria-label={label}
      type={type}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft(value)
      }}
      className={inline}
    />
  )
}

/** A value editable in place (the item's properties block). `onChange` saves right away. */
export function FieldEditor({ field: f, value, onChange }: { field: FieldDef; value: FieldValue | undefined; onChange: (v: FieldValue) => void }) {
  const text = value === null || value === undefined ? '' : Array.isArray(value) ? value.join(', ') : String(value)
  switch (f.type) {
    case 'select':
      return (
        <select aria-label={f.label} value={text} onChange={(e) => onChange(e.target.value || null)} className={cn(inline, 'cursor-pointer')}>
          <option value="">—</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value}
            </option>
          ))}
        </select>
      )
    case 'bool':
      return <Toggle on={Boolean(value)} onChange={(v) => onChange(v)} label={f.label} />
    case 'rating':
      return <Stars value={Number(value ?? 0)} max={f.max ?? 5} onChange={(v) => onChange(v || null)} label={f.label} />
    case 'progress': {
      const max = f.max ?? 100
      return (
        <span className="flex items-center gap-3">
          <input
            type="range"
            aria-label={f.label}
            min={0}
            max={max}
            defaultValue={Number(value ?? 0)}
            key={String(value)}
            onPointerUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
            className="flex-1 accent-[var(--color-primary)]"
          />
          <span className="w-10 text-right text-sm text-ink-muted tabular-nums">{Math.round((Number(value ?? 0) / max) * 100)}%</span>
        </span>
      )
    }
    case 'tags':
      return <DraftInput label={f.label} value={text} placeholder="tag, another" onSave={(v) => onChange(v.split(',').map((t) => t.trim()).filter(Boolean))} />
    case 'date':
      return <DraftInput label={f.label} type="date" value={text} onSave={(v) => onChange(v || null)} />
    case 'number':
    case 'duration':
      return <DraftInput label={f.label} type="number" value={text} placeholder={f.type === 'duration' ? 'minutes' : f.unit ?? ''} onSave={(v) => onChange(v === '' ? null : Number(v))} />
    case 'url':
    case 'image':
      return <DraftInput label={f.label} type={f.type === 'url' ? 'url' : 'text'} value={text} placeholder={f.type === 'url' ? 'https://…' : 'https://… or a memory path'} onSave={(v) => onChange(v || null)} />
    default:
      return <DraftInput label={f.label} value={text} onSave={(v) => onChange(v || null)} />
  }
}
