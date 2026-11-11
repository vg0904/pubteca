/**
 * Pintar una pagina compuesta en un lienzo: las MISMAS operaciones que
 * escribe el PDF (plan.md, decision «lista de dibujo»). Cada glifo se pinta con
 * su contorno, sacado de la fuente por el core, en su sitio y con su avance:
 * lo que se ve en la vista previa es lo que se imprime, sin depender de que el
 * navegador cargue la letra ni de como la componga el.
 *
 * Las imagenes se pintan tal cual; la miniatura entera va en gris por CSS
 * (`filter: grayscale(1)`), que es como saldran en un interior en blanco y
 * negro. El lienzo de Safari 16.4 no tiene `ctx.filter`.
 *
 * El contexto se recibe por su interfaz minima: los tests le pasan uno que
 * apunta lo que se le pide.
 */
import type { Cara, Fuentes, PaginaCompuesta } from '../../core/impreso/tipos'

export interface Pincel {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  fill(trazo: Path2D): void
  drawImage(imagen: CanvasImageSource, x: number, y: number, w: number, h: number): void
}

export interface ParaPintar {
  readonly fuentes: Fuentes
  /** El trazo de un glifo (lo guarda quien llama: se reutiliza en todas las paginas). */
  readonly trazo: (cara: Cara, glifo: number) => Path2D | null
  /** La imagen ya decodificada, o null si todavia no esta (se pinta un recuadro gris). */
  readonly imagen: (clave: string) => CanvasImageSource | null
}

/** Pinta la pagina con `escala` pixeles por punto, desde la esquina superior izquierda. */
export function pintarPagina(ctx: Pincel, pagina: PaginaCompuesta, ancho: number, alto: number, escala: number, p: ParaPintar): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ancho * escala, alto * escala)
  for (const op of pagina.ops) {
    if (op.op === 'imagen') {
      ctx.setTransform(escala, 0, 0, escala, 0, 0)
      const img = p.imagen(op.id)
      if (img) ctx.drawImage(img, op.x, op.y, op.ancho, op.alto)
      else {
        ctx.fillStyle = '#d8d8d8'
        ctx.fillRect(op.x, op.y, op.ancho, op.alto)
      }
      continue
    }
    ctx.fillStyle = '#000000'
    const f = p.fuentes[op.cara]
    const k = op.cuerpo / f.upm
    let x = op.x
    for (const g of op.glifos) {
      const t = p.trazo(op.cara, g.id)
      // La fuente tiene la y hacia arriba; el lienzo, hacia abajo.
      if (t) {
        ctx.setTransform(escala * k, 0, 0, -escala * k, escala * x, escala * op.y)
        ctx.fill(t)
      }
      x += g.avance * k
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** Una cache de trazos por familia: un Path2D por glifo, hecho la primera vez que se pinta. */
export function cacheDeTrazos(fuentes: Fuentes, crear: (d: string) => Path2D = (d) => new Path2D(d)): (cara: Cara, glifo: number) => Path2D | null {
  const cache = new Map<string, Path2D | null>()
  return (cara, glifo) => {
    const clave = `${cara}|${glifo}`
    let t = cache.get(clave)
    if (t === undefined) {
      const d = fuentes[cara].contorno(glifo)
      t = d ? crear(d) : null
      cache.set(clave, t)
    }
    return t
  }
}
