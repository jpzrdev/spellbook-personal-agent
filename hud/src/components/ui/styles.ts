// Classes compartilhadas pelo design system neumórfico "Bonsai".

export type Cor = 'musgo' | 'musgo-claro' | 'madeira' | 'ocre' | 'terracota' | 'sakura' | 'ardosia'

// Mapas estáticos: o Tailwind só gera classes que aparecem literalmente no código.

/** Cor sólida (pontos, preenchimentos, ícones). */
export const solido: Record<Cor, string> = {
  musgo: 'bg-musgo',
  'musgo-claro': 'bg-musgo-claro',
  madeira: 'bg-madeira',
  ocre: 'bg-ocre',
  terracota: 'bg-terracota',
  sakura: 'bg-sakura',
  ardosia: 'bg-ardosia',
}

/** Cor do ícone/traço. */
export const texto: Record<Cor, string> = {
  musgo: 'text-musgo',
  'musgo-claro': 'text-musgo-claro',
  madeira: 'text-madeira',
  ocre: 'text-ocre',
  terracota: 'text-terracota',
  sakura: 'text-sakura',
  ardosia: 'text-ardosia',
}

/** Fundo tingido de leve; o texto continua em `tinta` para manter contraste. */
export const tingido: Record<Cor, string> = {
  musgo: 'bg-musgo/20',
  'musgo-claro': 'bg-musgo-claro/30',
  madeira: 'bg-madeira/20',
  ocre: 'bg-ocre/25',
  terracota: 'bg-terracota/20',
  sakura: 'bg-sakura/30',
  ardosia: 'bg-ardosia/20',
}

export const foco = 'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-musgo'

/** Superfície em relevo (card, painel). */
export const relevo = 'bg-pergaminho shadow-relevo'

/** Superfície cavada (campo, trilha, área vazia). */
export const cavado = 'bg-pergaminho shadow-cavado'

/** Controle em relevo que cresce no hover e afunda no clique. */
export const interativo = [
  'shadow-relevo-sm transition-[box-shadow,color,background-color] duration-150',
  'hover:shadow-relevo active:shadow-cavado-sm',
  'disabled:pointer-events-none disabled:opacity-45',
  foco,
].join(' ')

// Cada tier tem a mesma cor em todo o HUD (selos e gráficos): tokens serie-1..3.
export const COR_TIER: Record<1 | 2 | 3, { ponto: string; fundo: string }> = {
  1: { ponto: 'bg-serie-1', fundo: 'bg-serie-1/20' },
  2: { ponto: 'bg-serie-2', fundo: 'bg-serie-2/25' },
  3: { ponto: 'bg-serie-3', fundo: 'bg-serie-3/20' },
}
