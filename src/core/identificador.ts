/**
 * Identificador unico del libro. Port de generar_epub.py 839-844.
 *
 * Esto es lo mas delicado del port entero. El Python deriva un UUID v5
 * DETERMINISTA de «titulo|autor» para que el identificador NO cambie entre
 * generaciones. Si el port produce otro UUID, un autor que regenere su libro
 * con Pubteca obtiene un EPUB que las tiendas y las bibliotecas tratan como un
 * libro DISTINTO del que ya subio.
 *
 * Por eso el SHA-1 va en JS puro y sincrono en vez de crypto.subtle:
 *   - crypto.subtle.digest es asincrono, y volveria async todo el pipeline
 *     (ver src/core/README.md);
 *   - solo existe en contexto seguro;
 *   - no existe en Node sin importar nada.
 *
 * Los vectores de prueba salen de la salida real de Python (tests/oraculo).
 */

// ---------------------------------------------------------------------------
// SHA-1
// ---------------------------------------------------------------------------

/** SHA-1 de unos bytes. Devuelve los 20 bytes del digest. */
export function sha1(datos: Uint8Array): Uint8Array {
  const bits = datos.length * 8
  // Longitud total: multiplo de 64 que deje sitio al 0x80 y a los 8 bytes de
  // longitud final.
  const total = (((datos.length + 8) >> 6) + 1) << 6
  const b = new Uint8Array(total)
  b.set(datos)
  b[datos.length] = 0x80
  const dv = new DataView(b.buffer)
  dv.setUint32(total - 8, Math.floor(bits / 0x1_0000_0000))
  dv.setUint32(total - 4, bits >>> 0)

  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0])
  const w = new Uint32Array(80)

  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4)
    for (let j = 16; j < 80; j++) {
      const x = w[j - 3]! ^ w[j - 8]! ^ w[j - 14]! ^ w[j - 16]!
      w[j] = (x << 1) | (x >>> 31)
    }

    let a = h[0]!
    let bb = h[1]!
    let c = h[2]!
    let d = h[3]!
    let e = h[4]!

    for (let j = 0; j < 80; j++) {
      let f: number
      let k: number
      if (j < 20) {
        f = (bb & c) | (~bb & d)
        k = 0x5a827999
      } else if (j < 40) {
        f = bb ^ c ^ d
        k = 0x6ed9eba1
      } else if (j < 60) {
        f = (bb & c) | (bb & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = bb ^ c ^ d
        k = 0xca62c1d6
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[j]!) >>> 0
      e = d
      d = c
      c = ((bb << 30) | (bb >>> 2)) >>> 0
      bb = a
      a = t
    }

    h[0] = (h[0]! + a) >>> 0
    h[1] = (h[1]! + bb) >>> 0
    h[2] = (h[2]! + c) >>> 0
    h[3] = (h[3]! + d) >>> 0
    h[4] = (h[4]! + e) >>> 0
  }

  const salida = new Uint8Array(20)
  const sv = new DataView(salida.buffer)
  for (let i = 0; i < 5; i++) sv.setUint32(i * 4, h[i]!)
  return salida
}

// ---------------------------------------------------------------------------
// UUID v5
// ---------------------------------------------------------------------------

/**
 * `uuid.NAMESPACE_URL` de Python.
 *
 * OJO: acaba en **b811**. El NAMESPACE_DNS, que es el que se copia por error,
 * acaba en b810 y da un UUID distinto para la misma semilla.
 */
export const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

function bytesDeUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  const b = new Uint8Array(16)
  for (let i = 0; i < 16; i++) b[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return b
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function formatear(b: Uint8Array): string {
  const hex = Array.from(b.slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/** `uuid.uuid5(espacio, nombre)`: SHA-1 del espacio concatenado con el nombre. */
export function uuid5(espacio: string, nombre: string): string {
  const e = bytesDeUuid(espacio)
  const n = utf8(nombre)
  const entrada = new Uint8Array(e.length + n.length)
  entrada.set(e)
  entrada.set(n, e.length)
  const d = sha1(entrada).slice(0, 16)
  d[6] = (d[6]! & 0x0f) | 0x50 // version 5
  d[8] = (d[8]! & 0x3f) | 0x80 // variante RFC 4122
  return formatear(d)
}

// ---------------------------------------------------------------------------
// El identificador del libro
// ---------------------------------------------------------------------------

/** Prefijo de la semilla. Cambiarlo cambia la identidad de TODOS los libros. */
export const PREFIJO_SEMILLA = 'generador-epub:'

/**
 * `identificador()`: `urn:isbn:` si hay ISBN, y si no un `urn:uuid:`
 * determinista a partir de titulo y autor.
 *
 * Del ISBN se conservan solo digitos y la X (en la caja en que la escribio el
 * autor). Con titulo y autor vacios la semilla es literalmente
 * `generador-epub:|`.
 */
export function identificador(titulo: string, autor: string, isbn: string): string {
  const limpio = isbn.replace(/[^0-9Xx]/g, '')
  if (limpio) return `urn:isbn:${limpio}`
  return `urn:uuid:${uuid5(NAMESPACE_URL, `${PREFIJO_SEMILLA}${titulo}|${autor}`)}`
}
