import type { Cor } from '../components/ui'
import type { StatusSessao } from './api'

export const STATUS_SESSAO: Record<StatusSessao, { cor: Cor; texto: string }> = {
  fila: { cor: 'ardosia', texto: 'na fila' },
  rodando: { cor: 'ocre', texto: 'rodando' },
  ok: { cor: 'musgo', texto: 'concluída' },
  erro: { cor: 'terracota', texto: 'erro' },
  cancelada: { cor: 'madeira', texto: 'cancelada' },
  tempo_esgotado: { cor: 'terracota', texto: 'tempo esgotado' },
}
