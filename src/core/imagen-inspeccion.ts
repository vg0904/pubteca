/**
 * Inspeccion de bytes de PNG y JPEG. Port de generar_epub.py 122-186.
 *
 * REGLA DE ORO: esto corre sobre los bytes ORIGINALES del archivo, nunca sobre
 * un canvas. En cuanto una imagen pasa por <img>, createImageBitmap o canvas,
 * el navegador ya la convirtio a RGB y se pierden para siempre el perfil ICC y
 * la informacion de CMYK, que es justo lo que hay que detectar.
 *
 * Solo lee cabeceras, asi que en el navegador basta con los primeros 256 kB
 * del File y la validacion es casi instantanea.
 */
import { unzlibSync } from 'fflate'

export const EXT_IMAGEN = ['.png', '.jpg', '.jpeg'] as const

/**
 * Marcadores SOF del JPEG. Son exactamente estos trece: faltan a proposito
 * 0xC4 (que es DHT, no SOF), 0xC8 y 0xCC.
 */
const SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Texto ASCII a bytes, y a bytes UTF-16BE (que es ASCII con un 0 delante). */
function marca(s: string): Uint8Array[] {
  const ascii = new Uint8Array(s.length)
  const utf16 = new Uint8Array(s.length * 2)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    ascii[i] = c
    utf16[i * 2] = 0
    utf16[i * 2 + 1] = c
  }
  return [ascii, utf16]
}

/**
 * Las cuatro marcas que busca el Python: «Display P3» y «DCI-P3», cada una en
 * ASCII y en UTF-16BE.
 *
 * TRAMPA: hay que buscar SUBSECUENCIAS DE BYTES, no decodificar a string. Un
 * TextDecoder('utf-8') sobre un perfil ICC binario sustituye los bytes
 * invalidos por U+FFFD y destruye la coincidencia.
 */
const MARCAS_P3: Uint8Array[] = [...marca('Display P3'), ...marca('DCI-P3')]

/** Busca una subsecuencia de bytes. */
function contiene(donde: Uint8Array, que: Uint8Array): boolean {
  if (que.length === 0 || que.length > donde.length) return false
  const primero = que[0] as number
  for (let i = 0; i <= donde.length - que.length; i++) {
    if (donde[i] !== primero) continue
    let j = 1
    while (j < que.length && donde[i + j] === que[j]) j++
    if (j === que.length) return true
  }
  return false
}

function esP3(datos: Uint8Array): boolean {
  return MARCAS_P3.some((m) => contiene(datos, m))
}

export type TipoImagen = 'png' | 'jpeg'

/** Formatos que NO sirven dentro del EPUB pero que llegan con la extension mintiendo. */
export type FormatoImpostor = 'webp' | 'heic' | 'tiff' | 'gif' | 'bmp' | 'desconocido'

export interface InfoImagen {
  readonly bytes: number
  readonly tipo: TipoImagen | null
  readonly ancho: number
  readonly alto: number
  readonly alfa: boolean
  readonly cmyk: boolean
  readonly p3: boolean
  /**
   * Cuando `tipo` es null, lo que el archivo parece ser de verdad. El Python no
   * lo distingue (dice «HEIC, WebP o un archivo renombrado»); aqui se detecta
   * para que la interfaz pueda decirle al autor QUE subio. No cambia ningun
   * mensaje de paridad.
   */
  readonly impostor: FormatoImpostor | null
  /** true si los bytes se acabaron antes de lo que decian las cabeceras. */
  readonly truncada: boolean
}

function detectarImpostor(b: Uint8Array): FormatoImpostor {
  const t = (i: number, s: string): boolean => {
    for (let k = 0; k < s.length; k++) if (b[i + k] !== s.charCodeAt(k)) return false
    return true
  }
  if (b.length >= 12 && t(0, 'RIFF') && t(8, 'WEBP')) return 'webp'
  if (b.length >= 12 && t(4, 'ftyp') && (t(8, 'heic') || t(8, 'heix') || t(8, 'mif1'))) return 'heic'
  if (b.length >= 4 && (t(0, 'II*') || t(0, 'MM\0*'))) return 'tiff'
  if (b.length >= 6 && t(0, 'GIF8')) return 'gif'
  if (b.length >= 2 && t(0, 'BM')) return 'bmp'
  return 'desconocido'
}

const VACIA: Omit<InfoImagen, 'bytes' | 'impostor'> = {
  tipo: null,
  ancho: 0,
  alto: 0,
  alfa: false,
  cmyk: false,
  p3: false,
  truncada: false,
}

/**
 * Lee las cabeceras y devuelve lo que el Python pone en su dict `info`.
 *
 * DIVERGENCIA DELIBERADA: el Python hace `struct.unpack(">IIBB", b[16:26])`
 * sin comprobar el limite, asi que un PNG truncado lanza struct.error SIN
 * capturar y el generador entero aborta con un traceback. Un autor con una
 * imagen copiada a medias no recibe un libro, recibe un error de Python.
 * Aqui eso devuelve `tipo: null` y `truncada: true`, que acaba en el mismo
 * mensaje de error que cualquier otro archivo que no es una imagen de verdad.
 */
export function inspeccionarImagen(b: Uint8Array): InfoImagen {
  const base = { ...VACIA, bytes: b.length }

  // PNG
  if (b.length >= 8 && FIRMA_PNG.every((x, i) => b[i] === x)) {
    if (b.length < 26) return { ...base, impostor: null, truncada: true }
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    const ancho = dv.getUint32(16)
    const alto = dv.getUint32(20)
    const tipoColor = b[25] as number
    let alfa = tipoColor === 4 || tipoColor === 6
    let p3 = false
    let truncada = false

    let i = 8
    while (i + 8 <= b.length) {
      const largo = dv.getUint32(i)
      const tipo = String.fromCharCode(
        b[i + 4] as number,
        b[i + 5] as number,
        b[i + 6] as number,
        b[i + 7] as number,
      )
      if (i + 8 + largo > b.length) {
        truncada = true
        break
      }
      const datos = b.subarray(i + 8, i + 8 + largo)

      if (tipo === 'tRNS') {
        alfa = true
      } else if (tipo === 'iCCP') {
        const cero = datos.indexOf(0)
        const nombre = cero === -1 ? datos : datos.subarray(0, cero)
        // El resto empieza por el byte de metodo de compresion: hay que
        // saltarlo. Y es un flujo ZLIB, no deflate crudo: unzlibSync, no
        // inflateSync. Equivocarse hace desaparecer en silencio el aviso de
        // Display P3, que es uno de los problemas reales del autor.
        let perfil = new Uint8Array(0)
        try {
          perfil = unzlibSync(datos.subarray(cero + 2))
        } catch {
          perfil = new Uint8Array(0)
        }
        // El Python ASIGNA aqui (no acumula), al contrario que en la rama JPEG.
        p3 = esP3(nombre) || esP3(perfil)
      } else if (tipo === 'IDAT' || tipo === 'IEND') {
        break
      }
      i += 12 + largo
    }

    return { bytes: b.length, tipo: 'png', ancho, alto, alfa, cmyk: false, p3, impostor: null, truncada }
  }

  // JPEG
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    let ancho = 0
    let alto = 0
    let cmyk = false
    let p3 = false

    let i = 2
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) {
        i += 1
        continue
      }
      const m = b[i + 1] as number
      if (m === 0xff) {
        i += 1
        continue
      }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
        i += 2
        continue
      }
      if (m === 0xd9 || m === 0xda) break

      const largo = dv.getUint16(i + 2)
      const seg = b.subarray(i + 4, Math.min(i + 2 + largo, b.length))

      if (SOF.has(m) && seg.length >= 6) {
        alto = (seg[1] as number) * 256 + (seg[2] as number)
        ancho = (seg[3] as number) * 256 + (seg[4] as number)
        cmyk = seg[5] === 4
      } else if (m === 0xe2 && contiene(seg.subarray(0, 12), marca('ICC_PROFILE\0')[0] as Uint8Array)) {
        // Aqui el Python SI acumula: info["p3"] = info["p3"] or es_p3(seg)
        p3 = p3 || esP3(seg)
      }
      i += 2 + largo
    }

    return { bytes: b.length, tipo: 'jpeg', ancho, alto, alfa: false, cmyk, p3, impostor: null, truncada: false }
  }

  return { ...base, impostor: detectarImpostor(b) }
}

/** `media_type()`: el tipo MIME para el manifiesto del OPF. */
export function mediaType(tipo: TipoImagen): string {
  return tipo === 'png' ? 'image/png' : 'image/jpeg'
}
