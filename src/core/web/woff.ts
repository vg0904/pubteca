/**
 * TrueType -> WOFF (version 1), para las letras del libro web.
 *
 * WOFF es la misma fuente con cada tabla comprimida con zlib: los navegadores
 * la leen todos y pesa bastante menos que el TTF. No se toca ni un byte de las
 * tablas (ni la cmap, ni el kerning, ni las ligaduras), asi que la letra se
 * pinta exactamente igual. WOFF2 comprimiria algo mas, pero necesita Brotli y
 * transformar tablas; esto se escribe con lo que ya hay (fflate) y es
 * determinista.
 *
 * Especificacion: https://www.w3.org/TR/WOFF/
 */
import { zlibSync } from 'fflate'

const alinear4 = (n: number): number => (n + 3) & ~3

interface Tabla {
  readonly etiqueta: number
  readonly suma: number
  readonly desde: number
  readonly largo: number
}

/** Lanza si los bytes no son una fuente TrueType u OpenType que se pueda leer. */
export function aWoff(ttf: Uint8Array): Uint8Array {
  if (ttf.length < 12) throw new Error('No es una fuente: demasiado corta.')
  const dv = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength)
  const sabor = dv.getUint32(0)
  // 0x00010000 TrueType, 'OTTO' OpenType con CFF, 'true' TrueType de Apple.
  if (sabor !== 0x00010000 && sabor !== 0x4f54544f && sabor !== 0x74727565) throw new Error('No es una fuente TrueType ni OpenType.')
  const n = dv.getUint16(4)
  if (12 + 16 * n > ttf.length) throw new Error('El directorio de tablas no cabe en el archivo.')

  const tablas: Tabla[] = []
  for (let i = 0; i < n; i++) {
    const r = 12 + 16 * i
    const t = { etiqueta: dv.getUint32(r), suma: dv.getUint32(r + 4), desde: dv.getUint32(r + 8), largo: dv.getUint32(r + 12) }
    if (t.desde + t.largo > ttf.length) throw new Error('Una tabla se sale del archivo.')
    tablas.push(t)
  }
  // El directorio del WOFF va ordenado por etiqueta, como el de la fuente.
  tablas.sort((a, b) => a.etiqueta - b.etiqueta)

  const datos = tablas.map((t) => {
    const original = ttf.subarray(t.desde, t.desde + t.largo)
    const comprimida = zlibSync(original, { level: 9 })
    // Si comprimir no gana nada, la tabla va tal cual: lo dice la especificacion.
    return comprimida.length < original.length ? comprimida : original
  })

  const cabecera = 44
  const directorio = 20 * n
  let desplazamiento = cabecera + directorio
  const posiciones = datos.map((d) => {
    const p = desplazamiento
    desplazamiento += alinear4(d.length)
    return p
  })
  // Lo que mide la fuente descomprimida: cabecera, directorio y tablas alineadas.
  const tamanoSfnt = 12 + 16 * n + tablas.reduce((s, t) => s + alinear4(t.largo), 0)
  // Con relleno tambien detras de la ultima tabla: sin el, Chrome (su
  // validador, OTS) rechaza la fuente entera («table overruns end of file»).
  const total = desplazamiento

  const salida = new Uint8Array(total)
  const ov = new DataView(salida.buffer)
  ov.setUint32(0, 0x774f4646) // 'wOFF'
  ov.setUint32(4, sabor)
  ov.setUint32(8, total)
  ov.setUint16(12, n)
  ov.setUint16(14, 0)
  ov.setUint32(16, tamanoSfnt)
  // Version de la fuente, metadatos y bloque privado: nada.
  for (const [i, t] of tablas.entries()) {
    const r = cabecera + 20 * i
    const d = datos[i] as Uint8Array
    ov.setUint32(r, t.etiqueta)
    ov.setUint32(r + 4, posiciones[i] as number)
    ov.setUint32(r + 8, d.length)
    ov.setUint32(r + 12, t.largo)
    ov.setUint32(r + 16, t.suma)
    salida.set(d, posiciones[i] as number)
  }
  return salida
}
