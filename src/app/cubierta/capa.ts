/**
 * La capa de encima de la vista: lo que ayuda a colocar y nunca se imprime.
 * Va en su propio lienzo, sobre el de la cubierta, para que pasar el raton o
 * dibujar una guia no obligue a repintar la cubierta (con la prueba de CMYK,
 * repintarla cuesta).
 *
 *   - con el raton dentro de la vista, el contorno punteado de cada pieza que
 *     se mueve (asi se ve que se mueven); la de debajo del raton, mas marcada;
 *   - la elegida, con su marco, su nombre y, si es de la contraportada, las
 *     cuatro asas para cambiarle el tamaño;
 *   - al arrastrar, las guias a las que se ha pegado (en magenta) y el borde
 *     de lo seguro si lo toca (en naranja, a trazos).
 *
 * Todo se mide en pixeles de pantalla (`dpr` por pixel CSS): las rayas y las
 * asas tienen el mismo grueso con cualquier tamaño de vista.
 */
import type { Caja, CubiertaCompuesta } from '../../core/impreso/cubierta'
import { ESQUINAS, type Guia } from './iman'
import { esDeContra, movibles, type PiezaMovible } from './mover'

export type PincelCapa = Pick<
  CanvasRenderingContext2D,
  'setTransform' | 'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'strokeRect' | 'fillRect' | 'fillText' | 'measureText' | 'setLineDash'
> & {
  lineWidth: number
  strokeStyle: string | CanvasGradient | CanvasPattern
  fillStyle: string | CanvasGradient | CanvasPattern
  font: string
  textBaseline: CanvasTextBaseline
}

export interface EstadoCapa {
  /** El raton esta sobre la vista: se ven los contornos. */
  readonly dentro: boolean
  /** La pieza bajo el raton. */
  readonly sobre: PiezaMovible | null
  readonly elegida: PiezaMovible | null
  /** El nombre de la elegida, para la etiqueta del marco. */
  readonly nombre: string
  readonly guias: readonly Guia[]
  readonly arrastrando: boolean
}

export const COLOR_GUIA = '#e5197e'
export const COLOR_LIMITE = '#e8590c'
export const COLOR_MARCO = '#1a73e8'
/** El lado de un asa, en pixeles CSS. */
export const ASA = 9

/** Pinta la capa entera. `escala`: pixeles del lienzo por punto de la hoja; `dpr`: pixeles del lienzo por pixel CSS. */
export function pintarCapa(ctx: PincelCapa, c: CubiertaCompuesta, escala: number, dpr: number, e: EstadoCapa, ancho: number, alto: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ancho, alto)
  const px = (k: Caja): [number, number, number, number] => [k.x * escala, k.y * escala, k.ancho * escala, k.alto * escala]
  const aire = 3 * dpr

  // Los contornos: con el raton dentro, mientras no se arrastra.
  if (e.dentro && !e.arrastrando) {
    for (const p of movibles(c)) {
      if (p.que === e.elegida) continue
      const [x, y, w, h] = px(p.caja)
      const fuerte = p.que === e.sobre
      ctx.setLineDash([])
      ctx.lineWidth = (fuerte ? 3 : 2) * dpr
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.strokeRect(x - aire, y - aire, w + 2 * aire, h + 2 * aire)
      ctx.lineWidth = (fuerte ? 1.5 : 1) * dpr
      ctx.setLineDash(fuerte ? [] : [4 * dpr, 3 * dpr])
      ctx.strokeStyle = COLOR_MARCO
      ctx.strokeRect(x - aire, y - aire, w + 2 * aire, h + 2 * aire)
    }
  }

  // Las guias.
  for (const g of e.guias) {
    const limite = g.tipo === 'limite'
    ctx.lineWidth = 1 * dpr
    ctx.setLineDash(limite ? [5 * dpr, 4 * dpr] : [])
    ctx.strokeStyle = limite ? COLOR_LIMITE : COLOR_GUIA
    ctx.beginPath()
    if (g.eje === 'x') {
      ctx.moveTo(g.en * escala, g.desde * escala)
      ctx.lineTo(g.en * escala, g.hasta * escala)
    } else {
      ctx.moveTo(g.desde * escala, g.en * escala)
      ctx.lineTo(g.hasta * escala, g.en * escala)
    }
    ctx.stroke()
  }
  ctx.setLineDash([])

  // La elegida: marco, nombre y asas.
  const elegida = e.elegida ? movibles(c).find((p) => p.que === e.elegida) : undefined
  if (!elegida) return
  const [x, y, w, h] = px(elegida.caja)
  ctx.lineWidth = 3 * dpr
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.strokeRect(x - aire, y - aire, w + 2 * aire, h + 2 * aire)
  ctx.lineWidth = 1.5 * dpr
  ctx.strokeStyle = COLOR_MARCO
  ctx.strokeRect(x - aire, y - aire, w + 2 * aire, h + 2 * aire)
  if (e.nombre) {
    ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(e.nombre).width
    const ea = 18 * dpr
    // Encima del marco; si no cabe arriba, debajo.
    const ey = y - aire - ea - 2 * dpr >= 0 ? y - aire - ea - 2 * dpr : y + h + aire + 2 * dpr
    ctx.fillStyle = COLOR_MARCO
    ctx.fillRect(x - aire, ey, tw + 12 * dpr, ea)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(e.nombre, x - aire + 6 * dpr, ey + ea / 2)
  }
  if (!esDeContra(elegida.que) || e.arrastrando) return
  const lado = ASA * dpr
  for (const q of ESQUINAS) {
    const cx = q.endsWith('o') ? x - aire : x + w + aire
    const cy = q.startsWith('n') ? y - aire : y + h + aire
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cx - lado / 2, cy - lado / 2, lado, lado)
    ctx.lineWidth = 1.5 * dpr
    ctx.strokeStyle = COLOR_MARCO
    ctx.strokeRect(cx - lado / 2, cy - lado / 2, lado, lado)
  }
}

/** El cursor para cada esquina: diagonal hacia donde crece. */
export const cursorDeEsquina = (q: string): string => (q === 'no' || q === 'se' ? 'nwse-resize' : 'nesw-resize')
