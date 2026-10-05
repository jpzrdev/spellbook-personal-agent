const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function hhmm(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "há 5 min", "hoje 09:15", "ontem 23:00", "sáb 23:00", "03/10 23:00". */
export function quandoRelativo(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso)
  const diffMin = Math.round((agora.getTime() - d.getTime()) / 60_000)
  if (diffMin >= 0 && diffMin < 1) return 'agora'
  if (diffMin > 0 && diffMin < 60) return `há ${diffMin} min`
  if (mesmoDia(d, agora)) return `hoje ${hhmm(d)}`
  const ontem = new Date(agora)
  ontem.setDate(agora.getDate() - 1)
  if (mesmoDia(d, ontem)) return `ontem ${hhmm(d)}`
  const amanha = new Date(agora)
  amanha.setDate(agora.getDate() + 1)
  if (mesmoDia(d, amanha)) return `amanhã ${hhmm(d)}`
  const dias = Math.abs(agora.getTime() - d.getTime()) / 86_400_000
  if (dias < 6) return `${DIAS[d.getDay()]} ${hhmm(d)}`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hhmm(d)}`
}

export type Dias = 'todo' | 'uteis' | 'fds' | 'custom'

/** Lê um cron simples de volta para o formulário (null = precisa do modo avançado). */
export function lerCron(cron: string): { hora: string; dias: Dias; custom: number[] } | null {
  const partes = cron.trim().split(/\s+/)
  if (partes.length !== 5) return null
  const [m, h, dia, mes, semana] = partes
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h) || dia !== '*' || mes !== '*') return null
  const hora = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  if (semana === '*') return { hora, dias: 'todo', custom: [1, 3, 5] }
  if (semana === '1-5') return { hora, dias: 'uteis', custom: [1, 3, 5] }
  if (semana === '0,6' || semana === '6,0') return { hora, dias: 'fds', custom: [1, 3, 5] }
  if (/^[0-7](,[0-7])*$/.test(semana)) return { hora, dias: 'custom', custom: [...new Set(semana.split(',').map((d) => Number(d) % 7))] }
  return null
}

/** Monta a expressão cron a partir do formulário simples. Dias custom: 0 = dom … 6 = sáb. */
export function montarCron(hora: string, dias: Dias, custom: number[]): string {
  const [h, m] = hora.split(':').map((x) => Number(x) || 0)
  const campoDias = dias === 'todo' ? '*' : dias === 'uteis' ? '1-5' : dias === 'fds' ? '0,6' : [...custom].sort().join(',') || '*'
  return `${m} ${h} * * ${campoDias}`
}
