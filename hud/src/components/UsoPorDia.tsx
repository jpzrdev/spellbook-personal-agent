import { useState } from 'react'
import type { CustoDia } from '../lib/api'
import { cn } from '../lib/cn'
import { ddmm } from '../lib/datas'

// Séries = tiers do Gandalf, empilhadas de baixo para cima nesta ordem fixa (cores validadas: tokens serie-1..3).
const SERIES = [
  { chave: '1', nome: 'T1 · regras', cor: 'var(--color-serie-1)' },
  { chave: '2', nome: 'T2 · rápido', cor: 'var(--color-serie-2)' },
  { chave: '3', nome: 'T3 · Claude Code', cor: 'var(--color-serie-3)' },
] as const

const ALTURA = 180
const ESPACO = 2 // px de superfície entre segmentos empilhados

function diasDoPeriodo(fim: string, dias: number): string[] {
  const [a, m, d] = fim.split('-').map(Number)
  const lista: string[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const dt = new Date(a, m - 1, d - i)
    lista.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)
  }
  return lista
}

function escalaY(max: number): { topo: number; marcas: number[] } {
  if (max <= 4) return { topo: 4, marcas: [0, 2, 4] }
  const passo = [1, 2, 5, 10, 20, 50, 100].find((p) => max / p <= 4) ?? Math.ceil(max / 4)
  const topo = Math.ceil(max / passo) * passo
  const marcas = []
  for (let v = 0; v <= topo; v += passo) marcas.push(v)
  return { topo, marcas }
}

type Props = { dados: CustoDia[]; dias: number; hoje: string; tabela?: boolean }

/** Chamadas por dia, empilhadas por tier. Hover mostra o detalhe; `tabela` mostra os números. */
export function UsoPorDia({ dados, dias, hoje, tabela }: Props) {
  const [foco, setFoco] = useState<string | null>(null)
  const porDia = new Map(dados.map((d) => [d.dia, d]))
  const eixo = diasDoPeriodo(hoje, dias).map(
    (dia) => porDia.get(dia) ?? { dia, chamadas: { '1': 0, '2': 0, '3': 0 }, tokens_entrada: 0, tokens_saida: 0, custo_estimado_usd: 0 },
  )
  const total = (d: CustoDia) => d.chamadas['1'] + d.chamadas['2'] + d.chamadas['3']
  const { topo, marcas } = escalaY(Math.max(1, ...eixo.map(total)))
  const totais = SERIES.map((s) => eixo.reduce((n, d) => n + d.chamadas[s.chave], 0))
  const rotuloCada = dias <= 7 ? 1 : dias <= 14 ? 2 : 5
  const emFoco = eixo.find((d) => d.dia === foco)

  if (tabela)
    return (
      <div className="max-h-80 overflow-auto rounded-controle shadow-cavado-sm">
        <table className="w-full text-sm">
          <caption className="sr-only">Chamadas por dia e por tier</caption>
          <thead className="sticky top-0 bg-pergaminho text-left text-xs text-tinta-suave">
            <tr>
              <th className="p-2">Dia</th>
              {SERIES.map((s) => (
                <th key={s.chave} className="p-2 text-right">{s.nome}</th>
              ))}
              <th className="p-2 text-right">Tokens</th>
              <th className="p-2 text-right">≈ US$</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[...eixo].reverse().filter((d) => total(d) > 0).map((d) => (
              <tr key={d.dia} className="border-t border-sombra/40">
                <td className="p-2">{ddmm(d.dia)}</td>
                {SERIES.map((s) => (
                  <td key={s.chave} className="p-2 text-right">{d.chamadas[s.chave]}</td>
                ))}
                <td className="p-2 text-right">{(d.tokens_entrada + d.tokens_saida).toLocaleString('pt-BR')}</td>
                <td className="p-2 text-right">{d.custo_estimado_usd.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      {/* Legenda sempre presente, com o total do período (rótulo direto: identidade nunca só pela cor). */}
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legenda">
        {SERIES.map((s, i) => (
          <li key={s.chave} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.cor }} />
            <span className="text-tinta-suave">{s.nome}</span>
            <span className="font-semibold tabular-nums">{totais[i]}</span>
          </li>
        ))}
      </ul>

      <div className="relative" onMouseLeave={() => setFoco(null)}>
        <div className="flex">
          {/* Eixo Y recessivo */}
          <div className="relative w-7 shrink-0 text-right text-[0.7rem] text-tinta-suave tabular-nums" style={{ height: ALTURA }} aria-hidden>
            {marcas.map((m) => (
              <span key={m} className="absolute right-1.5 -translate-y-1/2" style={{ top: ALTURA - (m / topo) * ALTURA }}>
                {m}
              </span>
            ))}
          </div>
          <div className="relative flex-1" style={{ height: ALTURA }}>
            {marcas.map((m) => (
              <div key={m} aria-hidden className="absolute inset-x-0 border-t border-sombra/45" style={{ top: ALTURA - (m / topo) * ALTURA }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]" role="img" aria-label={`Chamadas por dia nos últimos ${dias} dias, empilhadas por tier`}>
              {eixo.map((d) => {
                const segs = SERIES.map((s) => ({ ...s, n: d.chamadas[s.chave] })).filter((s) => s.n > 0)
                return (
                  <button
                    key={d.dia}
                    type="button"
                    aria-label={`${ddmm(d.dia)}: ${total(d)} chamada(s)`}
                    onMouseEnter={() => setFoco(d.dia)}
                    onFocus={() => setFoco(d.dia)}
                    onBlur={() => setFoco(null)}
                    // Alvo de hover = coluna inteira (maior que a barra).
                    className={cn('relative flex h-full flex-1 cursor-default flex-col justify-end rounded-sm focus-visible:outline-2 focus-visible:outline-musgo', foco === d.dia && 'bg-tinta/5')}
                  >
                    <span className="mx-auto flex w-full max-w-5 flex-col-reverse" style={{ gap: ESPACO }}>
                      {segs.map((s, i) => (
                        <span
                          key={s.chave}
                          style={{ height: Math.max(2, (s.n / topo) * ALTURA - ESPACO), background: s.cor }}
                          // Só o segmento de cima arredonda (4px), ancorado na base.
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
        {/* Eixo X: um rótulo a cada N dias, sempre o último (hoje). */}
        <div className="mt-1.5 flex pl-7 text-[0.7rem] text-tinta-suave tabular-nums" aria-hidden>
          {eixo.map((d, i) => (
            <span key={d.dia} className="flex-1 text-center">
              {(eixo.length - 1 - i) % rotuloCada === 0 ? ddmm(d.dia) : ''}
            </span>
          ))}
        </div>

        {emFoco && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 right-0 z-10 min-w-48 rounded-controle bg-pergaminho p-3 text-sm shadow-relevo"
          >
            <p className="font-semibold">{ddmm(emFoco.dia)}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {SERIES.map((s) => (
                <li key={s.chave} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-tinta-suave">
                    <span aria-hidden className="size-2 rounded-sm" style={{ background: s.cor }} />
                    {s.nome}
                  </span>
                  <span className="font-semibold tabular-nums">{emFoco.chamadas[s.chave]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-tinta-suave tabular-nums">
              {(emFoco.tokens_entrada + emFoco.tokens_saida).toLocaleString('pt-BR')} tokens · ≈ US$ {emFoco.custo_estimado_usd.toFixed(3)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
