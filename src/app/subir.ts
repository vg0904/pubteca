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
 * Que parte de los pixeles deja ver el fondo: alfa por debajo de 250.
 *
 * Es lo que decide si se puede hacer la version blanca, y NO basta con mirar
 * si el PNG tiene canal alfa: Procreate y Canva exportan casi siempre con
 * canal alfa y el fondo pintado, y entonces todos los pixeles son opacos.
 */
export function porcionTransparente(rgba: ArrayLike<number>): number {
  let transparentes = 0
  let total = 0
  for (let i = 3; i < rgba.length; i += 4) {
    total += 1
    if ((rgba[i] as number) < 250) transparentes += 1
  }
  return total === 0 ? 0 : transparentes / total
}

/**
 * Por debajo de esto no hay version blanca que hacer. Un logo sobre fondo
 * transparente deja ver el fondo en buena parte de la imagen; uno con el fondo
 * pintado, en ninguna (o solo en el suavizado de una esquina).
 */
export const MINIMO_TRANSPARENTE = 0.02

/**
 * El mismo dibujo en blanco: cada pixel pasa a blanco y CONSERVA su alfa, el
 * suavizado de los bordes incluido.
 */
export function enBlanco(rgba: ArrayLike<number>): Uint8ClampedArray<ArrayBuffer> {
  const salida = new Uint8ClampedArray(rgba.length)
  salida.set(rgba)
  for (let i = 0; i < salida.length; i += 4) {
    salida[i] = 255
    salida[i + 1] = 255
    salida[i + 2] = 255
  }
  return salida
}

/**
 * La version del logo para el modo oscuro, o `null` si el logo no tiene fondo
 * transparente: pintado de blanco saldria un rectangulo blanco, que es justo lo
 * que pasaba antes con un PNG de Procreate.
 *
 * El lienzo solo decodifica y vuelve a codificar; lo que se decide y lo que se
 * pinta esta en funciones puras, con sus tests.
 */
export async function logoEnBlanco(logo: Blob): Promise<Blob | null> {
  const bmp = await createImageBitmap(logo)
  const lienzo = document.createElement('canvas')
  lienzo.width = bmp.width
  lienzo.height = bmp.height
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('Este navegador no deja dibujar en un lienzo.')
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const pixeles = ctx.getImageData(0, 0, lienzo.width, lienzo.height)
  if (porcionTransparente(pixeles.data) < MINIMO_TRANSPARENTE) return null
  ctx.putImageData(new ImageData(enBlanco(pixeles.data), lienzo.width, lienzo.height), 0, 0)
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No pude generar el logo blanco.'))), 'image/png')
  })
}
