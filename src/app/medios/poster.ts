/**
 * El poster de un video: la imagen que Apple Books enseña antes de que se
 * reproduzca. Apple la exige, del MISMO tamaño y proporcion que el video.
 *
 * Sale de un fotograma del propio video (el autor elige cual con un
 * deslizador) o de una imagen que suba, recortada a la proporcion del video.
 * Siempre JPEG: es una foto, y PNG pesaria cinco veces mas.
 */
import { mediabunny } from './inspeccionar'

/** Donde se toma el poster si el autor no elige: no en el negro del principio. */
export function momentoPorDefecto(segundos: number): number {
  if (!(segundos > 0)) return 0
  return Math.min(Math.max(segundos * 0.1, Math.min(0.5, segundos / 2)), Math.max(0, segundos - 0.1))
}

async function aJpeg(lienzo: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in lienzo) return lienzo.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No pude sacar el fotograma.'))), 'image/jpeg', 0.9),
  )
}

/** Un fotograma del video, ya girado y a su tamaño en pantalla, en JPEG. */
export async function fotograma(video: Blob, segundos: number): Promise<{ readonly jpeg: Blob; readonly ancho: number; readonly alto: number }> {
  const mb = await mediabunny()
  const input = new mb.Input({ source: new mb.BlobSource(video), formats: mb.FORMATOS })
  try {
    const v = await input.getPrimaryVideoTrack()
    if (!v) throw new Error('No tiene video.')
    const c = await new mb.CanvasSink(v).getCanvas(segundos)
    if (!c) throw new Error('No pude sacar el fotograma.')
    return { jpeg: await aJpeg(c.canvas), ancho: c.canvas.width, alto: c.canvas.height }
  } finally {
    input.dispose()
  }
}

/** Como recortar una imagen para que llene `ancho` x `alto` sin deformarse. */
export function recorteQueLlena(
  origen: { readonly ancho: number; readonly alto: number },
  destino: { readonly ancho: number; readonly alto: number },
): { readonly x: number; readonly y: number; readonly ancho: number; readonly alto: number } {
  const escala = Math.max(destino.ancho / origen.ancho, destino.alto / origen.alto)
  const ancho = destino.ancho / escala
  const alto = destino.alto / escala
  return { x: (origen.ancho - ancho) / 2, y: (origen.alto - alto) / 2, ancho, alto }
}

/** Una imagen subida, recortada al centro y llevada al tamaño del video. */
export async function posterDeImagen(imagen: Blob, ancho: number, alto: number): Promise<Blob> {
  const bmp = await createImageBitmap(imagen)
  try {
    const r = recorteQueLlena({ ancho: bmp.width, alto: bmp.height }, { ancho, alto })
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('Este navegador no deja dibujar en un lienzo.')
    // Fondo blanco por si la imagen trae transparencia: un JPEG no la guarda.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.drawImage(bmp, r.x, r.y, r.ancho, r.alto, 0, 0, ancho, alto)
    return aJpeg(lienzo)
  } finally {
    bmp.close()
  }
}
