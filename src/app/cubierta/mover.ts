/**
 * Mover a mano las piezas de la cubierta: que pieza hay bajo el puntero,
 * cuanto se mueve al arrastrar, un paso con las flechas y el tamaño de las de
 * la contraportada. Puro: se prueba en Node.
 *
 * Las de la portada (titulo, autor, sello) se guardan por estilo; las de la
 * contraportada (codigo, sello, sinopsis), una vez para todos, con su escala.
 * Todo en fracciones del ancho de la portada (A): lo movido en 6 × 9 cae en
 * el mismo sitio relativo en 5 × 8. Se parte siempre de lo que de verdad se
 * movio (`movidas`, `ajustesContra`), no de lo pedido: si el compositor lo
 * paro en el borde de lo seguro, arrastrar de vuelta responde en el acto.
 */
import type { Caja, CubiertaCompuesta } from '../../core/impreso/cubierta'
import { ESCALAS, PIEZAS_CONTRA, PIEZAS_PORTADA, type PiezaContra, type Punto, type QuePieza } from '../../core/impreso/cubierta-config'

const MM = 72 / 25.4

export type Direccion = 'izquierda' | 'derecha' | 'arriba' | 'abajo'
export type PiezaMovible = QuePieza | PiezaContra

export const esDeContra = (q: PiezaMovible): q is PiezaContra => (PIEZAS_CONTRA as readonly string[]).includes(q)

/**
 * Las piezas que se pueden mover en esta cubierta: las de la portada que hay,
 * y las de la contraportada; el codigo, solo si lo genera Pubteca (la caja
 * libre es donde KDP pone el suyo, y ahi se queda).
 */
export function movibles(c: CubiertaCompuesta): readonly { readonly que: PiezaMovible; readonly caja: Caja }[] {
  return c.piezas.filter((p): p is { que: PiezaMovible; caja: Caja } => {
    if ((PIEZAS_PORTADA as readonly string[]).includes(p.que)) return true
    if (p.que === 'codigo') return c.codigoMovible
    return (PIEZAS_CONTRA as readonly string[]).includes(p.que)
  })
}

/** La pieza bajo un punto de la hoja (en puntos), con 2 mm de holgura; si hay dos, la mas pequeña. */
export function piezaEn(c: CubiertaCompuesta, x: number, y: number, holgura = 2 * MM): PiezaMovible | null {
  let mejor: { que: PiezaMovible; area: number } | null = null
  for (const p of movibles(c)) {
    const k = p.caja
    if (x < k.x - holgura || x > k.x + k.ancho + holgura || y < k.y - holgura || y > k.y + k.alto + holgura) continue
    const area = k.ancho * k.alto
    if (!mejor || area < mejor.area) mejor = { que: p.que, area }
  }
  return mejor?.que ?? null
}

/** Lo movido hasta ahora de una pieza (cero si no se movio). */
export function movidaDe(c: CubiertaCompuesta, que: PiezaMovible): Punto {
  if (esDeContra(que)) {
    const a = c.ajustesContra[que]
    return a ? { x: a.x, y: a.y } : { x: 0, y: 0 }
  }
  return c.movidas[que] ?? { x: 0, y: 0 }
}

/** El tamaño de una pieza de la contraportada sobre el del estilo (1 si no se toco; las de la portada, siempre 1). */
export const escalaDe = (c: CubiertaCompuesta, que: PiezaMovible): number => (esDeContra(que) ? (c.ajustesContra[que]?.escala ?? 1) : 1)

/** El tamaño pedido, dentro de lo que admite cada pieza. */
export function escalaLimitada(que: PiezaContra, escala: number): number {
  const { min, max } = ESCALAS[que]
  return Math.min(max, Math.max(min, escala))
}

/** Arrastrar desde `desde` hasta `hasta` (puntos de la hoja) a partir de `base`. */
export function arrastrada(c: CubiertaCompuesta, base: Punto, desde: { x: number; y: number }, hasta: { x: number; y: number }): Punto {
  const A = c.medidas.portada.ancho
  return { x: base.x + (hasta.x - desde.x) / A, y: base.y + (hasta.y - desde.y) / A }
}

/** Un paso con las flechas: `mm` milimetros en esa direccion. */
export function paso(c: CubiertaCompuesta, que: PiezaMovible, d: Direccion, mm: number): Punto {
  const m = movidaDe(c, que)
  const k = (mm * MM) / c.medidas.portada.ancho
  if (d === 'izquierda') return { x: m.x - k, y: m.y }
  if (d === 'derecha') return { x: m.x + k, y: m.y }
  if (d === 'arriba') return { x: m.x, y: m.y - k }
  return { x: m.x, y: m.y + k }
}

/** La direccion de una tecla de flecha, o null. */
export function direccionDeTecla(tecla: string): Direccion | null {
  return tecla === 'ArrowLeft' ? 'izquierda' : tecla === 'ArrowRight' ? 'derecha' : tecla === 'ArrowUp' ? 'arriba' : tecla === 'ArrowDown' ? 'abajo' : null
}
