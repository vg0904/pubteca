/**
 * La resolucion de impresion de un PNG: el bloque pHYs, en pixeles por metro.
 *
 * El lienzo del navegador escribe PNG sin el, y entonces Canva, Affinity o
 * Word suponen 72 ppi: un codigo de 600 px pensado para 300 ppi (2 in) lo
 * colocan a 8,3 in. Con el bloque, se coloca a su tamaño.
 *
 * Sincrono y puro: lo usa la app con los bytes que le da el lienzo.
 */
import { crc32 } from './crc32'

const FIRMA = [137, 80, 78, 71, 13, 10, 26, 10]

const tipoEn = (b: Uint8Array, i: number): string => String.fromCharCode(b[i] as number, b[i + 1] as number, b[i + 2] as number, b[i + 3] as number)

/** Los pixeles por metro de una resolucion en ppi (300 ppi son 11 811). */
export const pixelesPorMetro = (ppi: number): number => Math.round(ppi / 0.0254)

/** El PNG con su pHYs a `ppi` (en los dos ejes), justo despues de IHDR; si ya tenia uno, se cambia. */
export function conPpi(png: Uint8Array, ppi: number): Uint8Array {
  if (png.length < 33 || FIRMA.some((v, i) => png[i] !== v) || tipoEn(png, 12) !== 'IHDR') throw new Error('No es un PNG.')
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength)
  // Los bloques, sin el pHYs que traiga.
  const trozos: Uint8Array[] = []
  let i = 8
  let trasIhdr = 0
  while (i + 12 <= png.length) {
    const largo = v.getUint32(i)
    const fin = i + 12 + largo
    if (fin > png.length) throw new Error('PNG cortado.')
    const tipo = tipoEn(png, i + 4)
    if (tipo !== 'pHYs') trozos.push(png.subarray(i, fin))
    if (tipo === 'IHDR') trasIhdr = trozos.length
    i = fin
    if (tipo === 'IEND') break
  }
  const ppm = pixelesPorMetro(ppi)
  const bloque = new Uint8Array(21)
  const b = new DataView(bloque.buffer)
  b.setUint32(0, 9)
  bloque.set([0x70, 0x48, 0x59, 0x73], 4) // pHYs
  b.setUint32(8, ppm)
  b.setUint32(12, ppm)
  bloque[16] = 1 // la unidad es el metro
  b.setUint32(17, crc32(bloque.subarray(4, 17)))
  trozos.splice(trasIhdr, 0, bloque)
  const r = new Uint8Array(8 + trozos.reduce((n, t) => n + t.length, 0))
  r.set(FIRMA, 0)
  let o = 8
  for (const t of trozos) {
    r.set(t, o)
    o += t.length
  }
  return r
}
