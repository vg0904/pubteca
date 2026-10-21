/**
 * Subir una imagen: primero los BYTES, luego (si acaso) el canvas.
 *
 * El orden no es negociable. En cuanto una imagen pasa por `<img>`,
 * `createImageBitmap` o un canvas, el navegador ya la convirtio a RGB y se
 * perdieron el perfil ICC y el CMYK, que es justo lo que hay que detectar
 * (Procreate exporta en Display P3, y las imprentas mandan portadas en CMYK).
 * Las cabeceras estan al principio del archivo, asi que bastan los primeros
 * 256 kB y la comprobacion es instantanea aunque la imagen pese 30 MB.
 */
import { inspeccionarImagen, type FormatoImpostor, type InfoImagen } from '../core/imagen-inspeccion'

export const BYTES_CABECERA = 256 * 1024

export type Lectura =
  | { readonly ok: true; readonly info: InfoImagen; readonly tipo: 'png' | 'jpeg' }
  | { readonly ok: false; readonly motivo: FormatoImpostor | 'truncada' | 'ilegible' }

/** Inspecciona el archivo por sus bytes. No decodifica nada. */
export async function inspeccionarArchivo(archivo: Blob): Promise<Lectura> {
  const cabecera = new Uint8Array(await archivo.slice(0, BYTES_CABECERA).arrayBuffer())
  let info = inspeccionarImagen(cabecera)
  // Si la cabecera no basto (un JPEG con un EXIF enorme antes del SOF, o un
  // PNG con un perfil que se corta en el limite), se lee entero.
  const corta = cabecera.length < archivo.size
  if (corta && ((info.tipo === 'jpeg' && info.ancho === 0) || info.truncada)) {
    info = inspeccionarImagen(new Uint8Array(await archivo.arrayBuffer()))
  } else if (corta) {
    info = { ...info, truncada: false }
  }
  info = { ...info, bytes: archivo.size }
  if (info.tipo === null) return { ok: false, motivo: info.impostor ?? 'desconocido' }
  if (info.truncada) return { ok: false, motivo: 'truncada' }
  return { ok: true, info, tipo: info.tipo }
}

/**
 * Comprueba que el navegador la puede pintar. Va DESPUES de inspeccionar: aqui
 * ya da igual que se pierda el perfil, solo se mira si decodifica. Un archivo
 * copiado a medias tiene cabeceras perfectas y no se puede abrir.
 */
export async function decodifica(archivo: Blob): Promise<boolean> {
  if (typeof createImageBitmap !== 'function') return true
  try {
    const bmp = await createImageBitmap(archivo)
    bmp.close()
    return true
  } catch {
    return false
  }
}

/**
 * La version del logo para el modo oscuro: el mismo dibujo, en blanco.
 *
 * Se pinta el logo y encima un rectangulo blanco con `source-in`, que solo
 * pinta donde el logo ya tenia tinta y conserva el alfa de cada pixel (el
 * suavizado de los bordes incluido). Por eso exige fondo transparente: con un
 * fondo opaco, el resultado seria un rectangulo blanco.
 */
export async function logoEnBlanco(logo: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(logo)
  const lienzo = document.createElement('canvas')
  lienzo.width = bmp.width
  lienzo.height = bmp.height
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('Este navegador no deja dibujar en un lienzo.')
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No pude generar el logo blanco.'))), 'image/png')
  })
}
