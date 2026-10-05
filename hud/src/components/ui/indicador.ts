import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

/** Pílula em relevo que desliza até o item ativo (abas, menu do topo).
 * O contêiner precisa ser `relative`; cada item registra o próprio elemento em `itens.current[i]`. */
export function useIndicador<T extends HTMLElement>(ativo: number) {
  const container = useRef<HTMLDivElement>(null)
  const itens = useRef<Array<T | null>>([])
  const primeira = useRef(true)
  const [estilo, setEstilo] = useState<CSSProperties>({ opacity: 0 })

  useLayoutEffect(() => {
    function medir() {
      const el = itens.current[ativo]
      if (!el) return setEstilo({ opacity: 0 })
      setEstilo({
        width: el.offsetWidth,
        height: el.offsetHeight,
        transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`,
        opacity: 1,
        // Na primeira medida (e ao redimensionar) aparece direto no lugar, sem deslizar do canto.
        transition: primeira.current ? 'none' : undefined,
      })
      primeira.current = false
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return // navegadores antigos/testes: só mede ao trocar
    const ro = new ResizeObserver(() => {
      primeira.current = true
      medir()
    })
    if (container.current) ro.observe(container.current)
    return () => ro.disconnect()
  }, [ativo])

  return { container, itens, estilo }
}

/** Classes da pílula deslizante (posição absoluta atrás dos itens). */
export const PILULA =
  'pointer-events-none absolute top-0 left-0 rounded-pilula bg-pergaminho shadow-relevo-sm transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]'
