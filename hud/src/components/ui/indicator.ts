import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

/** A raised pill that slides to the active item (tabs, top menu).
 * The container must be `relative`; each item registers its own element in `items.current[i]`. */
export function useIndicator<T extends HTMLElement>(active: number) {
  const container = useRef<HTMLDivElement>(null)
  const items = useRef<Array<T | null>>([])
  const first = useRef(true)
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 })

  useLayoutEffect(() => {
    function measure() {
      const el = items.current[active]
      if (!el) return setStyle({ opacity: 0 })
      setStyle({
        width: el.offsetWidth,
        height: el.offsetHeight,
        transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`,
        opacity: 1,
        // On the first measurement (and on resize) it appears right in place, without sliding from the corner.
        transition: first.current ? 'none' : undefined,
      })
      first.current = false
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return // old browsers/tests: only measures on change
    const ro = new ResizeObserver(() => {
      first.current = true
      measure()
    })
    if (container.current) ro.observe(container.current)
    return () => ro.disconnect()
  }, [active])

  return { container, items, style }
}

/** Classes of the sliding pill (absolutely positioned behind the items). */
export const PILL =
  'pointer-events-none absolute top-0 left-0 rounded-pill bg-surface shadow-raised-sm transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]'
