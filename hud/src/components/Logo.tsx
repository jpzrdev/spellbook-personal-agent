// Desenho do mago (espaço 32×32), o mesmo de public/icone.svg e scripts/gerar_icones.py.
const MAGO = {
  chapeu: '11,14.8 16.8,5 19.6,4.6 18.5,6.6 21,14.8',
  barba: '11.2,18.4 20.8,18.4 19.5,23.5 16,29.5 12.5,23.5',
  estrela: '16,9.4 16.45,10.45 17.5,10.9 16.45,11.35 16,12.4 15.55,11.35 14.5,10.9 15.55,10.45',
}

/** Medalhão de céu noturno com o mago (chapéu cinzento, barba branca, estrela no chapéu). */
export function Logo() {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-pilula bg-[radial-gradient(circle_at_35%_30%,#3d5278,#1f2b40)] shadow-relevo-sm" aria-hidden>
      <svg viewBox="1 2 30 30" className="size-8">
        <g fill="#f4f2ec" opacity="0.8">
          <circle cx="6" cy="9" r="0.55" />
          <circle cx="26.5" cy="8" r="0.45" />
          <circle cx="27" cy="22" r="0.4" />
          <circle cx="5" cy="21" r="0.4" />
        </g>
        <polygon points={MAGO.chapeu} fill="#8c8a80" />
        <ellipse cx="16" cy="14.9" rx="7.8" ry="1.7" fill="#6f6d65" />
        <ellipse cx="16" cy="17.6" rx="4.6" ry="2.8" fill="#e9c9a1" />
        <circle cx="14.3" cy="17.1" r="0.6" fill="#2a2a22" />
        <circle cx="17.7" cy="17.1" r="0.6" fill="#2a2a22" />
        <ellipse cx="14.1" cy="16.1" rx="1.4" ry="0.5" fill="#d8d4c8" />
        <ellipse cx="17.9" cy="16.1" rx="1.4" ry="0.5" fill="#d8d4c8" />
        <polygon points={MAGO.barba} className="fill-marfim" />
        <ellipse cx="16" cy="19" rx="4.9" ry="1.5" className="fill-marfim" />
        <ellipse cx="16" cy="18.4" rx="0.9" ry="0.8" fill="#dcb88e" />
        <polygon points={MAGO.estrela} fill="#e0a42a" />
      </svg>
    </span>
  )
}
