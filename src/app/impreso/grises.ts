/**
 * Las imagenes del interior, preparadas para el PDF: en gris, aplanadas sobre
 * blanco y a la resolucion que pide la imprenta.
 *
 * Lo hace la app porque decodificar es del navegador (el core solo lee bytes),
 * y el core las guarda tal cual, en DeviceGray con Flate (plan.md). Un JPEG de
 * lienzo siempre trae tres canales: no sirve para un interior en blanco y
 * negro, asi que aqui salen pixeles, no un archivo.
 *
 * El tamaño: 300 ppi al tamaño impreso, que es lo que piden KDP e IngramSpark.
 * Mas no se ve en papel y engorda el PDF; menos no se inventa (no se amplia
 * nunca: una imagen pequeña sale con los pixeles que tiene, y el aviso de
 * resolucion ya lo dice).
 */
import type { ImagenGris } from '../../core/impreso/pdf'
import type { PaginaCompuesta } from '../../core/impreso/tipos'

export const PPI_IMPRESO = 300

/** El mayor tamaño al que se imprime cada imagen, en puntos (una imagen puede salir en dos sitios). */
export function tamanosImpresos(paginas: readonly PaginaCompuesta[]): Map<string, { ancho: number; alto: number }> {
  const r = new Map<string, { ancho: number; alto: number }>()
  for (const p of paginas) {
    for (const o of p.ops) {
      if (o.op !== 'imagen') continue
      const ya = r.get(o.id)
      if (!ya || o.ancho * o.alto > ya.ancho * ya.alto) r.set(o.id, { ancho: o.ancho, alto: o.alto })
    }
  }
  return r
}

/** Los pixeles que hacen falta: los de 300 ppi a ese tamaño, sin pasar nunca de los que tiene. */
export function pixelesDestino(original: { ancho: number; alto: number }, impreso: { ancho: number; alto: number }): { ancho: number; alto: number } {
  // La proporcion impresa es la de la imagen (el compositor no la deforma): con el eje que mas pida vale.
  const escala = Math.min(1, Math.max(((impreso.ancho / 72) * PPI_IMPRESO) / original.ancho, ((impreso.alto / 72) * PPI_IMPRESO) / original.alto))
  return { ancho: Math.max(1, Math.round(original.ancho * escala)), alto: Math.max(1, Math.round(original.alto * escala)) }
}

/**
 * De RGBA a gris, con la transparencia aplanada sobre blanco. Luma de BT.601
 * (la de la television de siempre y la de casi todos los programas de
 * fotografia al pasar a gris).
 */
export function aGris(rgba: Uint8ClampedArray | Uint8Array, ancho: number, alto: number): ImagenGris {
  const pixeles = new Uint8Array(ancho * alto)
  for (let i = 0, j = 0; j < pixeles.length; i += 4, j++) {
    const a = (rgba[i + 3] as number) / 255
    const l = 0.299 * (rgba[i] as number) + 0.587 * (rgba[i + 1] as number) + 0.114 * (rgba[i + 2] as number)
    pixeles[j] = Math.round(l * a + 255 * (1 - a))
  }
  return { ancho, alto, pixeles }
}

/** Decodifica, reduce y pasa a gris. Con el lienzo del navegador. */
export async function imagenEnGris(blob: Blob, destino: { ancho: number; alto: number }): Promise<ImagenGris> {
  const bmp = await createImageBitmap(blob)
  try {
    const { ancho, alto } = destino
    const lienzo: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(ancho, alto) : Object.assign(document.createElement('canvas'), { width: ancho, height: alto })
    const ctx = lienzo.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) throw new Error('Este navegador no deja dibujar la imagen.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, ancho, alto)
    // Sin pintar el blanco antes: los pixeles transparentes salen con su alfa, y aGris los aplana.
    return aGris(ctx.getImageData(0, 0, ancho, alto).data, ancho, alto)
  } finally {
    bmp.close()
  }
}
