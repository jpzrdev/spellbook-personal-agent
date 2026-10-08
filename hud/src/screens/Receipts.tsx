import { BarChart3, Coins, Hash, Receipt, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Markdown } from '../components/Markdown'
import { Badge, Card, EmptyState, Modal, Select, Tabs, TierBadge, type Color } from '../components/ui'
import { UsageByDay } from '../components/UsageByDay'
import { cn } from '../lib/cn'
import { useCosts, useReceipt, useReceipts, useAgent } from '../lib/queries'
import { relativeTime } from '../lib/time'

const STATUS: Record<string, Color> = { ok: 'primary', error: 'ember', cancelled: 'wood', timed_out: 'ember' }
const SOURCES = [
  { value: '', text: 'All sources' },
  { value: 'hud', text: 'HUD' },
  { value: 'voice', text: 'Voice' },
  { value: 'routine', text: 'Routine' },
]

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M` : n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : String(n)

function Stat({ title, subtitle, value, icon, color, footer }: { title: string; subtitle: string; value: string; icon: ReactNode; color: Color; footer?: ReactNode }) {
  return (
    <Card className="h-full justify-between" title={title} subtitle={subtitle} icon={icon} color={color}>
      <p className="font-display text-3xl font-normal tabular-nums sm:text-4xl">{value}</p>
      {footer}
    </Card>
  )
}

function ReceiptDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isPending, error } = useReceipt(id)
  return (
    <Modal open={id !== null} onClose={onClose} title="Receipt" icon={<Receipt />} color="silver">
      <div className="max-h-[60vh] overflow-y-auto p-1">
        {isPending ? (
          <p className="text-ink-muted">loading…</p>
        ) : error ? (
          <p role="alert" className="font-semibold text-danger">{error.message}</p>
        ) : data ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              {data.tier >= 1 && data.tier <= 3 && <TierBadge tier={data.tier as 1 | 2 | 3} />}
              <Badge color={STATUS[data.status] ?? 'silver'}>{data.status}</Badge>
              <span>{data.at && relativeTime(data.at)}</span>
              <span>· {data.source}</span>
              {data.model && <span>· {data.model}</span>}
              <span className="tabular-nums">· {(data.duration_ms / 1000).toFixed(1)} s</span>
              {data.input_tokens + data.output_tokens > 0 && (
                <span className="tabular-nums">
                  · {fmtTokens(data.input_tokens + data.output_tokens)} tokens · ≈ US$ {data.estimated_cost_usd.toFixed(3)}
                </span>
              )}
            </div>
            {data.text && <Markdown text={data.text} />}
            <p className="font-mono text-xs text-ink-muted">{data.file}</p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

export function Receipts() {
  const agentName = useAgent().name
  const [days, setDays] = useState(30)
  const [showTable, setShowTable] = useState(false)
  const [tier, setTier] = useState('')
  const [source, setSource] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const { data: costs } = useCosts(days)
  const { data: receipts = [], isPending } = useReceipts({ days, tier: tier ? Number(tier) : null, source: source || null })

  const aiToday = costs ? costs.today.calls['2'] + costs.today.calls['3'] : 0
  const limit = costs?.daily_call_limit ?? 0

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Receipts &amp; costs</h1>
        <p className="mt-1 text-ink-muted">
          Every request to {agentName} becomes a receipt in <code className="font-mono text-sm">receipts/</code>. The "≈ US$" is the API equivalent
          reported by Claude Code, for reference only: you pay for the subscription.
        </p>
      </header>

      {costs && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
            <Stat
              title="AI today"
              subtitle="T2 + T3 calls"
              value={`${aiToday}`}
              icon={<Sparkles />}
              color="gold"
              footer={limit > 0 && <Badge color={aiToday >= limit ? 'ember' : 'primary'}>daily limit: {limit}</Badge>}
            />
            <Stat
              title="This month"
              subtitle={`requests to ${agentName}`}
              value={`${costs.month.calls['1'] + costs.month.calls['2'] + costs.month.calls['3']}`}
              icon={<Hash />}
              color="primary"
              footer={<span className="text-xs text-ink-muted tabular-nums">T1 {costs.month.calls['1']} · T2 {costs.month.calls['2']} · T3 {costs.month.calls['3']}</span>}
            />
            <Stat title="Tokens" subtitle="this month" value={fmtTokens(costs.month.tokens)} icon={<BarChart3 />} color="silver" />
            <Stat
              title="≈ US$ in API"
              subtitle="this month (reference)"
              value={costs.month.estimated_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              icon={<Coins />}
              color="wood"
            />
          </div>

          <Card
            title="Usage per day"
            subtitle={`calls to ${agentName}, by tier`}
            icon={<BarChart3 />}
            color="primary"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Tabs label="Period" value={String(days)} onChange={(v) => setDays(Number(v))} items={[{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }]} />
                <Tabs label="View" value={showTable ? 'table' : 'chart'} onChange={(v) => setShowTable(v === 'table')} items={[{ id: 'chart', label: 'Chart' }, { id: 'table', label: 'Table' }]} />
              </div>
            }
          >
            <UsageByDay data={costs.by_day} days={days} today={costs.date} table={showTable} />
          </Card>
        </>
      )}

      <Card title="History" subtitle={`last ${days} days`} icon={<Receipt />} color="silver">
        <div className="flex flex-wrap gap-4">
          <Select
            label="Tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            options={[{ value: '', text: 'All tiers' }, { value: '1', text: 'T1 · rules' }, { value: '2', text: 'T2 · fast' }, { value: '3', text: 'T3 · Claude Code' }]}
            className="w-52"
          />
          <Select label="Source" value={source} onChange={(e) => setSource(e.target.value)} options={SOURCES} className="w-52" />
        </div>
        {isPending ? (
          <p className="text-ink-muted">loading…</p>
        ) : receipts.length === 0 ? (
          <EmptyState icon={<Receipt />} color="silver" title="No receipts" description="Nothing with these filters in the period." className="py-8" />
        ) : (
          <ul className="flex flex-col gap-2">
            {receipts.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpen(r.id)}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-3 py-2 text-left shadow-raised-sm transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-primary active:shadow-sunken-sm"
                >
                  <span className="w-24 shrink-0 text-xs text-ink-muted tabular-nums">{r.at && relativeTime(r.at)}</span>
                  {r.tier >= 1 && r.tier <= 3 && <TierBadge tier={r.tier as 1 | 2 | 3} />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.request || r.intent}</span>
                  <span className="text-xs text-ink-muted">{r.source}</span>
                  {r.status !== 'ok' && <Badge color={STATUS[r.status] ?? 'silver'}>{r.status}</Badge>}
                  <span className={cn('w-16 text-right text-xs text-ink-muted tabular-nums', r.input_tokens + r.output_tokens === 0 && 'opacity-0')}>
                    {fmtTokens(r.input_tokens + r.output_tokens)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ReceiptDetail id={open} onClose={() => setOpen(null)} />
    </div>
  )
}
