/**
 * Pintar la cubierta en un lienzo: las capas del fondo (dibujos con su
 * encuadre, colores, franja, logos, velos) y, encima, las mismas operaciones
 * en vectores que escribe el PDF (texto con los contornos de sus glifos,
 * girado el del lomo; la caja y las barras del codigo).
 *
 * Tres usos: la vista previa (con las guias de corte, lomo y codigo), el PNG
 * que se descarga, y la imagen del fondo del PDF (solo las capas, a 300 ppi:
 * el texto lo pone el PDF en vectores).
 *
 * El contexto se recibe por su interfaz minima: los tests le pasan uno que
 * apunta lo que se le pide.
 */
import type { Caja, CubiertaCompuesta, FuentesCubierta, LetraCubierta, RolCubierta } from '../../core/impreso/cubierta'
import type { Fuente } from '../../core/impreso/sfnt'
import type { Cara } from '../../core/impreso/tipos'

export interface PincelCubierta {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  fillRect(x: number, y: number, w: number, h: number): void
  strokeRect(x: number, y: number, w: number, h: number): void
  fill(trazo: Path2D): void
  drawImage(imagen: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void
  setLineDash(segmentos: number[]): void
  save(): void
  restore(): void
}

export interface ParaPintarCubierta {
  readonly fuentes: FuentesCubierta
  readonly trazo: (letra: LetraCubierta, cara: Cara, glifo: number) => Path2D | null
  /** La imagen ya decodificada de cada papel, o null (se pinta un gris). */
  readonly imagen: (rol: RolCubierta) => (CanvasImageSource & { readonly width: number; readonly height: number }) | null
}

export interface QuePintar {
  readonly capas: boolean
  readonly texto: boolean
  readonly guias?: boolean
  /** Solo un trozo de la hoja (la portada, para las miniaturas de los estilos). */
  readonly region?: Caja
}

export const fuenteDe = (f: FuentesCubierta, letra: LetraCubierta, cara: Cara): Fuente => (letra === 'libro' ? f.libro[cara] : f[letra])

const gris = (g: number): string => {
  const v = Math.round(g * 255)
  return `rgb(${v},${v},${v})`
}

/** Pinta la cubierta con `escala` pixeles por punto. */
export function pintarCubierta(ctx: PincelCubierta, c: CubiertaCompuesta, escala: number, p: ParaPintarCubierta, que: QuePintar): void {
  const r = que.region ?? { x: 0, y: 0, ancho: c.medidas.ancho, alto: c.medidas.alto }
  // Coordenadas de la hoja (puntos) a pixeles del lienzo.
  const base = (a: number, b: number, cc: number, d: number, e: number, f: number): void => ctx.setTransform(a * escala, b * escala, cc * escala, d * escala, (e - r.x) * escala, (f - r.y) * escala)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, r.ancho * escala, r.alto * escala)

  if (que.capas) {
    for (const capa of c.capas) {
      base(1, 0, 0, 1, 0, 0)
      if (capa.que === 'color') {
        ctx.fillStyle = capa.color
        ctx.fillRect(capa.caja.x, capa.caja.y, capa.caja.ancho, capa.caja.alto)
      } else if (capa.que === 'arte') {
        const img = p.imagen(capa.rol)
        if (!img) continue
        // El recorte esta en pixeles de la imagen tal cual se subio, que es como la decodifica el navegador.
        ctx.drawImage(img, capa.recorte.x, capa.recorte.y, capa.recorte.ancho, capa.recorte.alto, capa.caja.x, capa.caja.y, capa.caja.ancho, capa.caja.alto)
      } else if (capa.que === 'logo') {
        const img = p.imagen(capa.rol)
        if (!img) continue
        ctx.drawImage(img, 0, 0, img.width, img.height, capa.caja.x, capa.caja.y, capa.caja.ancho, capa.caja.alto)
      } else {
        // El velo, con los bordes suaves: la sombra de un rectangulo que se pinta fuera de la vista.
        const color = capa.color === 'negro' ? `rgba(0,0,0,${capa.alfa})` : `rgba(255,255,255,${capa.alfa})`
        const lejos = 100_000
        ctx.save()
        ctx.shadowColor = color
        ctx.shadowBlur = Math.max(1, capa.caja.alto * 0.25 * escala)
        ctx.shadowOffsetX = lejos * escala
        ctx.fillStyle = '#000000'
        ctx.fillRect(capa.caja.x - lejos, capa.caja.y, capa.caja.ancho, capa.caja.alto)
        ctx.restore()
      }
    }
  }

  if (que.texto) {
    for (const op of c.ops) {
      if (op.op === 'rect') {
        base(1, 0, 0, 1, 0, 0)
        ctx.fillStyle = gris(op.gris)
        ctx.fillRect(op.x, op.y, op.ancho, op.alto)
        continue
      }
      ctx.fillStyle = gris(op.gris)
      const f = fuenteDe(p.fuentes, op.letra, op.cara)
      const k = op.cuerpo / f.upm
      let a = 0
      for (const g of op.glifos) {
        const t = p.trazo(op.letra, op.cara, g.id)
        if (t) {
          // La fuente mide con la y hacia arriba. Girado 90: la linea va hacia abajo y lo alto de
          // las letras mira a la derecha; -90, hacia arriba y a la izquierda.
          if (op.giro === 90) base(0, k, k, 0, op.x, op.y + a)
          else if (op.giro === -90) base(0, -k, -k, 0, op.x, op.y - a)
          else base(k, 0, 0, -k, op.x + a, op.y)
          ctx.fill(t)
        }
        a += g.avance * k
      }
    }
  }

  if (que.guias) {
    const m = c.medidas
    base(1, 0, 0, 1, 0, 0)
    ctx.lineWidth = 0.6
    ctx.setLineDash([3, 2])
    ctx.strokeStyle = 'rgba(0,170,210,0.95)'
    ctx.strokeRect(m.sangrado, m.sangrado, m.ancho - 2 * m.sangrado, m.alto - 2 * m.sangrado)
    ctx.strokeRect(m.espina.x, 0, m.espina.ancho, m.alto)
    ctx.strokeStyle = 'rgba(230,60,60,0.95)'
    ctx.strokeRect(c.codigo.x, c.codigo.y, c.codigo.ancho, c.codigo.alto)
    ctx.setLineDash([])
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** Un Path2D por glifo y letra, hecho la primera vez que se pinta. */
export function trazosDeCubierta(f: FuentesCubierta, crear: (d: string) => Path2D = (d) => new Path2D(d)): (letra: LetraCubierta, cara: Cara, glifo: number) => Path2D | null {
  const cache = new Map<string, Path2D | null>()
  return (letra, cara, glifo) => {
    const clave = `${letra}|${letra === 'libro' ? cara : ''}|${glifo}`
    let t = cache.get(clave)
    if (t === undefined) {
      const d = fuenteDe(f, letra, cara).contorno(glifo)
      t = d ? crear(d) : null
      cache.set(clave, t)
    }
    return t
  }
}
