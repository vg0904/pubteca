import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { escribirEpub, mereceComprimir } from '../src/core/zip'

/** Bytes que no se pueden comprimir, como los de un PNG o un JPEG ya comprimidos. Deterministas. */
function incompresible(n: number): Uint8Array {
  const b = new Uint8Array(n)
  let x = 0x9e3779b9
  for (let i = 0; i < n; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    b[i] = x & 0xff
  }
  return b
}

/** Bytes muy comprimibles, como un PNG de colores planos exportado sin comprimir. */
const plano = (n: number): Uint8Array => new Uint8Array(n).fill(7)

/** Metodo de compresion de cada entrada, leido de las cabeceras locales. */
function metodos(zip: Uint8Array): Record<string, 'STORE' | 'DEFLATE'> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const salida: Record<string, 'STORE' | 'DEFLATE'> = {}
  let i = 0
  while (dv.getUint32(i, true) === 0x04034b50) {
    const metodo = dv.getUint16(i + 8, true)
    const tamano = dv.getUint32(i + 18, true)
    const largoNombre = dv.getUint16(i + 26, true)
    const largoExtra = dv.getUint16(i + 28, true)
    const nombre = new TextDecoder().decode(zip.subarray(i + 30, i + 30 + largoNombre))
    salida[nombre] = metodo === 0 ? 'STORE' : 'DEFLATE'
    i += 30 + largoNombre + largoExtra + tamano
  }
  return salida
}

describe('que se comprime dentro del EPUB', () => {
  it('una imagen que ya viene comprimida no merece deflate', () => {
    expect(mereceComprimir(incompresible(500_000))).toBe(false)
  })

  it('una que viene casi sin comprimir si', () => {
    expect(mereceComprimir(plano(500_000))).toBe(true)
  })

  it('decide con el cuerpo de la imagen, no con sus metadatos', () => {
    // Un JPEG puede llevar delante decenas de KB de perfil de color o de EXIF,
    // que se comprimen bien, y detras la imagen, que no.
    const b = incompresible(400_000)
    b.fill(0, 0, 80_000)
    expect(mereceComprimir(b)).toBe(false)
  })

  it('una imagen pequeña se comprime siempre, como en el Python', () => {
    // Cuesta milisegundos, y lo que se gana suele estar en los metadatos del
    // principio, que el trozo del centro no ve: una portada JPEG real de 155 KB
    // baja un 16 %.
    expect(mereceComprimir(incompresible(200_000))).toBe(true)
    expect(mereceComprimir(new Uint8Array())).toBe(true)
  })

  it('EL CAMBIO: las imagenes ya comprimidas van tal cual; todo lo demas, comprimido', () => {
    const zip = escribirEpub(
      [
        { ruta: 'OEBPS/texto/cap01.xhtml', datos: plano(10_000) },
        { ruta: 'OEBPS/imagenes/procreate.png', datos: incompresible(600_000) },
        { ruta: 'OEBPS/imagenes/foto.jpg', datos: incompresible(600_000) },
        { ruta: 'OEBPS/imagenes/plana.png', datos: plano(600_000) },
        { ruta: 'OEBPS/imagenes/pequena.png', datos: incompresible(100_000) },
        // Una fuente se comprime siempre, aunque esta no ganara nada.
        { ruta: 'OEBPS/fuentes/letra.ttf', datos: incompresible(600_000) },
      ],
      new Date('2026-01-01T00:00:00Z'),
    )
    expect(metodos(zip)).toEqual({
      mimetype: 'STORE',
      'OEBPS/texto/cap01.xhtml': 'DEFLATE',
      'OEBPS/imagenes/procreate.png': 'STORE',
      'OEBPS/imagenes/foto.jpg': 'STORE',
      'OEBPS/imagenes/plana.png': 'DEFLATE',
      'OEBPS/imagenes/pequena.png': 'DEFLATE',
      'OEBPS/fuentes/letra.ttf': 'DEFLATE',
    })
    // Y el contenido es el mismo, vaya como vaya.
    const dentro = unzipSync(zip)
    expect(dentro['OEBPS/imagenes/procreate.png']).toEqual(incompresible(600_000))
    expect(dentro['OEBPS/imagenes/plana.png']).toEqual(plano(600_000))
  })
})
