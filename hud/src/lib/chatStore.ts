import { useSyncExternalStore } from 'react'
import type { RespostaGandalf } from './api'

// Conversa com o Gandalf compartilhada entre a tela Chat e o Orb. Fica no localStorage deste navegador
// (conveniência por pessoa; o registro oficial de cada pedido são os recibos no vault).
export type Troca = { id: string; pergunta: string; resposta?: RespostaGandalf; erro?: string; quando: string }

const CHAVE = 'lifeos-chat'
const MAX = 50

function carregar(): Troca[] {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const lista = bruto ? (JSON.parse(bruto) as Troca[]) : []
    // Pedidos que estavam "pensando" quando a página fechou não vão mais voltar.
    return lista.map((t) => (t.resposta || t.erro ? t : { ...t, erro: 'interrompido (a página foi recarregada)' }))
  } catch {
    return []
  }
}

let trocas: Troca[] = carregar()
const ouvintes = new Set<() => void>()

function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(trocas.slice(-MAX)))
  } catch {
    // sem persistência
  }
  ouvintes.forEach((f) => f())
}

export const chat = {
  adicionar(pergunta: string): string {
    const id = crypto.randomUUID()
    trocas = [...trocas, { id, pergunta, quando: new Date().toISOString() }].slice(-MAX)
    salvar()
    return id
  },
  atualizar(id: string, dados: Partial<Troca>) {
    trocas = trocas.map((t) => (t.id === id ? { ...t, ...dados } : t))
    salvar()
  },
  /** Últimas trocas respondidas nos últimos 10 min: vão junto no /ask para o Tier 2 entender
   * continuações ("amanhã às 9" depois de o Gandalf perguntar "quando?"). */
  anteriores(): Array<{ pergunta: string; resposta: string }> {
    const limite = Date.now() - 10 * 60_000
    return trocas
      .filter((t) => t.resposta && t.resposta.tier > 0 && new Date(t.quando).getTime() >= limite)
      .slice(-2)
      .map((t) => ({ pergunta: t.pergunta.slice(0, 1000), resposta: t.resposta!.resposta.slice(0, 1500) }))
  },
  limpar() {
    trocas = []
    salvar()
  },
}

export function useChat(): Troca[] {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => trocas,
  )
}
