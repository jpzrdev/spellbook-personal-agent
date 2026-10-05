import { useCallback, useEffect, useState } from 'react'

// Preferência de tema do HUD. "sistema" segue o prefers-color-scheme do aparelho.
// O mesmo cálculo roda antes da pintura num script inline do index.html (evita piscar).
export type Tema = 'sistema' | 'claro' | 'escuro'

const CHAVE = 'lifeos-tema'
const consulta = '(prefers-color-scheme: dark)'

function lerPreferencia(): Tema {
  try {
    const valor = localStorage.getItem(CHAVE)
    if (valor === 'claro' || valor === 'escuro' || valor === 'sistema') return valor
  } catch {
    // localStorage pode estar bloqueado; segue o sistema.
  }
  return 'sistema'
}

function resolver(tema: Tema): 'claro' | 'escuro' {
  if (tema !== 'sistema') return tema
  return window.matchMedia?.(consulta).matches ? 'escuro' : 'claro'
}

function aplicar(tema: Tema) {
  document.documentElement.dataset.theme = resolver(tema)
}

export function useTema() {
  const [tema, setTemaState] = useState<Tema>(lerPreferencia)

  useEffect(() => {
    aplicar(tema)
    if (tema !== 'sistema' || !window.matchMedia) return
    const mq = window.matchMedia(consulta)
    const onChange = () => aplicar('sistema')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [tema])

  const setTema = useCallback((novo: Tema) => {
    try {
      localStorage.setItem(CHAVE, novo)
    } catch {
      // sem persistência; o tema vale só nesta aba.
    }
    setTemaState(novo)
  }, [])

  return { tema, setTema, efetivo: resolver(tema) }
}
