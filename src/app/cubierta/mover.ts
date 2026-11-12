/**
 * Mover a mano las piezas de la portada: que pieza hay bajo el dedo, cuanto
 * se mueve al arrastrar, y un paso con las flechas. Puro: se prueba en Node.
 *
 * Todo se guarda en fracciones del ancho de la portada (A), como los estilos:
 * lo movido en 6 × 9 cae en el mismo sitio relativo en 5 × 8. Se parte siempre
 * de lo que de verdad se movio (`CubiertaCompuesta.movidas`), no de lo pedido:
 * si se pidio de mas y el compositor lo paro en el borde de lo seguro,
 * arrastrar de vuelta responde en el acto.
 */
import type { CubiertaCompuesta } from '../../core/impreso/cubierta'
import { PIEZAS_PORTADA, type Punto, type QuePieza } from '../../core/impreso/cubierta-config'

const MM = 72 / 25.4

export type Direccion = 'izquierda' | 'derecha' | 'arriba' | 'abajo'

/** Las piezas de la portada que hay en esta cubierta, en el orden del estilo. */
export function movibles(c: CubiertaCompuesta): readonly { readonly que: QuePieza; readonly caja: CubiertaCompuesta['codigo'] }[] {
  return c.piezas.filter((p): p is { que: QuePieza; caja: CubiertaCompuesta['codigo'] } => (PIEZAS_PORTADA as readonly string[]).includes(p.que))
}

/** La pieza bajo un punto de la hoja (en puntos), con 2 mm de holgura; si hay dos, la mas pequeña. */
export function piezaEn(c: CubiertaCompuesta, x: number, y: number, holgura = 2 * MM): QuePieza | null {
  let mejor: { que: QuePieza; area: number } | null = null
  for (const p of movibles(c)) {
    const k = p.caja
    if (x < k.x - holgura || x > k.x + k.ancho + holgura || y < k.y - holgura || y > k.y + k.alto + holgura) continue
    const area = k.ancho * k.alto
    if (!mejor || area < mejor.area) mejor = { que: p.que, area }
  }
  return mejor?.que ?? null
}

/** Lo movido hasta ahora de una pieza (cero si no se movio). */
export const movidaDe = (c: CubiertaCompuesta, que: QuePieza): Punto => c.movidas[que] ?? { x: 0, y: 0 }

/** Arrastrar desde `desde` hasta `hasta` (puntos de la hoja) a partir de `base`. */
export function arrastrada(c: CubiertaCompuesta, base: Punto, desde: { x: number; y: number }, hasta: { x: number; y: number }): Punto {
  const A = c.medidas.portada.ancho
  return { x: base.x + (hasta.x - desde.x) / A, y: base.y + (hasta.y - desde.y) / A }
}

/** Un paso con las flechas: `mm` milimetros en esa direccion. */
export function paso(c: CubiertaCompuesta, que: QuePieza, d: Direccion, mm: number): Punto {
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
