/**
 * Tamaños de corte y lo que pide cada destino: el margen minimo de cada lado
 * (con el medianil segun el numero de paginas), cuantas paginas admite, y si
 * la ultima tiene que ir en blanco.
 *
 * Los numeros salen de las paginas de ayuda de cada tienda, citadas en
 * plan.md y en la referencia (parte B). Son MINIMOS TECNICOS: lo que la tienda
 * rechaza o recorta por debajo. Los margenes bonitos los pone el autor; aqui
 * solo se impide que bajen de ahi.
 */

/** Puntos PostScript por milimetro. */
export const PT_POR_MM = 72 / 25.4

export interface Corte {
  readonly id: string
  /** En pulgadas: es como los publica KDP. */
  readonly ancho: number
  readonly alto: number
}

/** Los de rustica de KDP, en su orden. Todos los acepta tambien IngramSpark. */
export const CORTES: readonly Corte[] = [
  { id: '5x8', ancho: 5, alto: 8 },
  { id: '5.06x7.81', ancho: 5.06, alto: 7.81 },
  { id: '5.25x8', ancho: 5.25, alto: 8 },
  { id: '5.5x8.5', ancho: 5.5, alto: 8.5 },
  { id: '6x9', ancho: 6, alto: 9 },
  { id: '6.14x9.21', ancho: 6.14, alto: 9.21 },
  { id: '6.69x9.61', ancho: 6.69, alto: 9.61 },
  { id: '7x10', ancho: 7, alto: 10 },
  { id: '7.44x9.69', ancho: 7.44, alto: 9.69 },
  { id: '7.5x9.25', ancho: 7.5, alto: 9.25 },
  { id: '8x10', ancho: 8, alto: 10 },
  { id: '8.25x6', ancho: 8.25, alto: 6 },
  { id: '8.25x8.25', ancho: 8.25, alto: 8.25 },
  { id: '8.5x8.5', ancho: 8.5, alto: 8.5 },
  { id: '8.5x11', ancho: 8.5, alto: 11 },
  { id: '8.27x11.69', ancho: 8.27, alto: 11.69 },
]

export const CORTE_POR_DEFECTO = '6x9'

export type Destino = 'kdp' | 'ingram' | 'imprenta'
export const DESTINOS: readonly Destino[] = ['kdp', 'ingram', 'imprenta']

export type Papel = 'crema' | 'blanco'

/** Distancias minimas desde el corte a todo lo que se imprime, folios incluidos. En puntos. */
export interface Zona {
  readonly interior: number
  readonly exterior: number
  readonly superior: number
  readonly inferior: number
}

const IN = 72

/**
 * KDP: el margen interior minimo crece con el numero de paginas, porque en
 * rustica el lomo se come parte del medianil.
 * https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6
 */
const MEDIANIL_KDP: readonly { readonly hasta: number; readonly pulgadas: number }[] = [
  { hasta: 150, pulgadas: 0.375 },
  { hasta: 300, pulgadas: 0.5 },
  { hasta: 500, pulgadas: 0.625 },
  { hasta: 700, pulgadas: 0.75 },
  { hasta: Infinity, pulgadas: 0.875 },
]

/** El tramo de la tabla de KDP en que cae ese numero de paginas (0 a 4). */
export function tramoKdp(paginas: number): number {
  return MEDIANIL_KDP.findIndex((t) => paginas <= t.hasta)
}

/** El medianil minimo de KDP para ese numero de paginas, en puntos. */
export function medianilKdp(paginas: number): number {
  return (MEDIANIL_KDP[tramoKdp(paginas)] as { pulgadas: number }).pulgadas * IN
}

/**
 * Lo minimo de cada lado para ese destino y ese numero de paginas.
 *
 * KDP sin sangrado: 0,25 in fuera, arriba y abajo, y el medianil de su tabla.
 * IngramSpark: 0,5 in en todos los lados, «folios incluidos».
 * Imprenta u otro: no hay regla publicada; manda lo que diga la imprenta.
 */
export function zonaSegura(destino: Destino, paginas: number): Zona {
  if (destino === 'kdp') return { interior: medianilKdp(paginas), exterior: 0.25 * IN, superior: 0.25 * IN, inferior: 0.25 * IN }
  if (destino === 'ingram') return { interior: 0.5 * IN, exterior: 0.5 * IN, superior: 0.5 * IN, inferior: 0.5 * IN }
  return { interior: 0, exterior: 0, superior: 0, inferior: 0 }
}

/** Si el minimo de ese destino depende del numero de paginas (hay que componer, contar y volver). */
export function dependeDePaginas(destino: Destino): boolean {
  return destino === 'kdp'
}

/** Cuantas paginas admite: KDP rustica en B/N, 24 a 828 en blanco y 24 a 776 en crema. */
export function rangoDePaginas(destino: Destino, papel: Papel): { readonly min: number; readonly max: number } | null {
  if (destino === 'kdp') return { min: 24, max: papel === 'blanco' ? 828 : 776 }
  return null
}

/** IngramSpark pide la ultima pagina en blanco («si no, la añaden ellos»). */
export function ultimaEnBlanco(destino: Destino): boolean {
  return destino === 'ingram'
}

/** KDP: no mas de 4 paginas en blanco seguidas al principio o en medio, ni mas de 10 al final. */
export const BLANCAS_SEGUIDAS = { dentro: 4, final: 10 } as const
