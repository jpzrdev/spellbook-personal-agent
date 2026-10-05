/** '2026-10-05' → '05/10' */
export function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export type Prazo = 'atrasada' | 'hoje' | 'futura' | null

export function prazo(vence: string | null, hoje: string): Prazo {
  if (!vence) return null
  if (vence < hoje) return 'atrasada'
  if (vence === hoje) return 'hoje'
  return 'futura'
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** '2026-10-03' → 'sábado, 3 de outubro de 2026' (por extenso para pegar erros da voz: "3" → "13"). */
export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  return `${DIAS[new Date(a, m - 1, d).getDay()]}, ${d} de ${MESES[m - 1]} de ${a}`
}
