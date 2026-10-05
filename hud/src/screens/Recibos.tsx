import { BarChart3, Coins, Hash, Receipt, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Markdown } from '../components/Markdown'
import { Badge, Card, EmptyState, Modal, Select, Tabs, TierBadge, type Cor } from '../components/ui'
import { UsoPorDia } from '../components/UsoPorDia'
import { cn } from '../lib/cn'
import { useCustos, useRecibo, useRecibos } from '../lib/queries'
import { quandoRelativo } from '../lib/tempo'

const STATUS: Record<string, Cor> = { ok: 'musgo', erro: 'terracota', cancelada: 'madeira', tempo_esgotado: 'terracota' }
const ORIGENS = [
  { valor: '', texto: 'Todas as origens' },
  { valor: 'hud', texto: 'HUD' },
  { valor: 'voz', texto: 'Voz' },
  { valor: 'rotina', texto: 'Rotina' },
  { valor: 'obsidian', texto: 'Obsidian' },
]

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : n >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(n)

function Numero({ titulo, subtitulo, valor, icone, cor, rodape }: { titulo: string; subtitulo: string; valor: string; icone: ReactNode; cor: Cor; rodape?: ReactNode }) {
  return (
    <Card className="h-full justify-between" titulo={titulo} subtitulo={subtitulo} icone={icone} cor={cor}>
      <p className="font-titulo text-3xl font-normal tabular-nums sm:text-4xl">{valor}</p>
      {rodape}
    </Card>
  )
}

function DetalheRecibo({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isPending, error } = useRecibo(id)
  return (
    <Modal aberto={id !== null} onClose={onClose} titulo="Recibo" icone={<Receipt />} cor="ardosia">
      <div className="max-h-[60vh] overflow-y-auto p-1">
        {isPending ? (
          <p className="text-tinta-suave">carregando…</p>
        ) : error ? (
          <p role="alert" className="font-semibold text-erro">{error.message}</p>
        ) : data ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-tinta-suave">
              {data.tier >= 1 && data.tier <= 3 && <TierBadge tier={data.tier as 1 | 2 | 3} />}
              <Badge cor={STATUS[data.status] ?? 'ardosia'}>{data.status}</Badge>
              <span>{data.quando && quandoRelativo(data.quando)}</span>
              <span>· {data.origem}</span>
              {data.modelo && <span>· {data.modelo}</span>}
              <span className="tabular-nums">· {(data.duracao_ms / 1000).toFixed(1)} s</span>
              {data.tokens_entrada + data.tokens_saida > 0 && (
                <span className="tabular-nums">
                  · {fmtTokens(data.tokens_entrada + data.tokens_saida)} tokens · ≈ US$ {data.custo_estimado_usd.toFixed(3)}
                </span>
              )}
            </div>
            {data.texto && <Markdown texto={data.texto} />}
            <p className="font-mono text-xs text-tinta-suave">{data.arquivo}</p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

export function Recibos() {
  const [dias, setDias] = useState(30)
  const [verTabela, setVerTabela] = useState(false)
  const [tier, setTier] = useState('')
  const [origem, setOrigem] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const { data: custos } = useCustos(dias)
  const { data: recibos = [], isPending } = useRecibos({ dias, tier: tier ? Number(tier) : null, origem: origem || null })

  const iaHoje = custos ? custos.hoje.chamadas['2'] + custos.hoje.chamadas['3'] : 0
  const limite = custos?.limite_diario_chamadas ?? 0

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Recibos &amp; custos</h1>
        <p className="mt-1 text-tinta-suave">
          Cada pedido ao Gandalf vira um recibo em <code className="font-mono text-sm">recibos/</code>. O "≈ US$" é o equivalente em API
          informado pelo Claude Code, só como referência: você paga a assinatura.
        </p>
      </header>

      {custos && (
        <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
            <Numero
              titulo="IA hoje"
              subtitulo="chamadas T2 + T3"
              valor={`${iaHoje}`}
              icone={<Sparkles />}
              cor="ocre"
              rodape={limite > 0 && <Badge cor={iaHoje >= limite ? 'terracota' : 'musgo'}>limite diário: {limite}</Badge>}
            />
            <Numero
              titulo="Este mês"
              subtitulo="pedidos ao Gandalf"
              valor={`${custos.mes.chamadas['1'] + custos.mes.chamadas['2'] + custos.mes.chamadas['3']}`}
              icone={<Hash />}
              cor="musgo"
              rodape={<span className="text-xs text-tinta-suave tabular-nums">T1 {custos.mes.chamadas['1']} · T2 {custos.mes.chamadas['2']} · T3 {custos.mes.chamadas['3']}</span>}
            />
            <Numero titulo="Tokens" subtitulo="este mês" valor={fmtTokens(custos.mes.tokens)} icone={<BarChart3 />} cor="ardosia" />
            <Numero
              titulo="≈ US$ em API"
              subtitulo="este mês (referência)"
              valor={custos.mes.custo_estimado_usd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              icone={<Coins />}
              cor="madeira"
            />
        </div>

            <Card
              titulo="Uso por dia"
              subtitulo="chamadas ao Gandalf, por tier"
              icone={<BarChart3 />}
              cor="musgo"
              acoes={
                <div className="flex flex-wrap items-center gap-2">
                  <Tabs rotulo="Período" valor={String(dias)} onChange={(v) => setDias(Number(v))} itens={[{ id: '7', label: '7 dias' }, { id: '30', label: '30 dias' }]} />
                  <Tabs rotulo="Visualização" valor={verTabela ? 'tabela' : 'grafico'} onChange={(v) => setVerTabela(v === 'tabela')} itens={[{ id: 'grafico', label: 'Gráfico' }, { id: 'tabela', label: 'Tabela' }]} />
                </div>
              }
            >
              <UsoPorDia dados={custos.por_dia} dias={dias} hoje={custos.data} tabela={verTabela} />
            </Card>
      </>
      )}

      <Card titulo="Histórico" subtitulo={`últimos ${dias} dias`} icone={<Receipt />} cor="ardosia">
        <div className="flex flex-wrap gap-4">
          <Select
            rotulo="Tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            opcoes={[{ valor: '', texto: 'Todos os tiers' }, { valor: '1', texto: 'T1 · regras' }, { valor: '2', texto: 'T2 · rápido' }, { valor: '3', texto: 'T3 · Claude Code' }]}
            className="w-52"
          />
          <Select rotulo="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)} opcoes={ORIGENS} className="w-52" />
        </div>
        {isPending ? (
          <p className="text-tinta-suave">carregando…</p>
        ) : recibos.length === 0 ? (
          <EmptyState icone={<Receipt />} cor="ardosia" titulo="Nenhum recibo" descricao="Nada com esses filtros no período." className="py-8" />
        ) : (
          <ul className="flex flex-col gap-2">
            {recibos.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setAberto(r.id)}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-controle px-3 py-2 text-left shadow-relevo-sm transition-shadow hover:shadow-relevo focus-visible:outline-2 focus-visible:outline-musgo active:shadow-cavado-sm"
                >
                  <span className="w-24 shrink-0 text-xs text-tinta-suave tabular-nums">{r.quando && quandoRelativo(r.quando)}</span>
                  {r.tier >= 1 && r.tier <= 3 && <TierBadge tier={r.tier as 1 | 2 | 3} />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.pedido || r.intent}</span>
                  <span className="text-xs text-tinta-suave">{r.origem}</span>
                  {r.status !== 'ok' && <Badge cor={STATUS[r.status] ?? 'ardosia'}>{r.status}</Badge>}
                  <span className={cn('w-16 text-right text-xs text-tinta-suave tabular-nums', r.tokens_entrada + r.tokens_saida === 0 && 'opacity-0')}>
                    {fmtTokens(r.tokens_entrada + r.tokens_saida)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <DetalheRecibo id={aberto} onClose={() => setAberto(null)} />
    </div>
  )
}
