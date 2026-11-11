import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32 as crcDeNode } from 'node:zlib'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { construir } from '../src/core/construir'
import { crc32 } from '../src/core/crc32'
import { esFicha, ficha, type Proyecto } from '../src/core/proyecto'
import {
  archivosDeSegmentos,
  escribirZipSegmentado,
  esHueco,
  tamanoDe,
  unirSegmentos,
  type Segmento,
} from '../src/core/zip'
import { abrirEpub, documentoDePagina } from '../src/app/vista-previa'
import { leerProyecto } from '../scripts/leer-proyecto'

/**
 * El EPUB y la copia en SEGMENTOS (hito M2): el motor escribe todo menos los
 * bytes de cada audio o video, y deja un hueco con su tamaño. Lo que aqui se
 * fija es que el archivo que sale al rellenar los huecos es un zip correcto
 * —lo comprueba `unzip -t`, que SI verifica cada CRC— y que es exactamente el
 * mismo que si el motor hubiera tenido los bytes.
 */

const FIXTURE = join(import.meta.dirname, 'fixtures', 'libro-medios')
const AHORA = new Date('2026-11-11T12:00:00Z')

/** Pasa el zip por `unzip -t`: lee cada entrada y comprueba su CRC. */
function unzipT(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), 'pubteca-zip-'))
  try {
    const ruta = join(dir, 'x.zip')
    writeFileSync(ruta, bytes)
    return execFileSync('unzip', ['-t', ruta], { encoding: 'utf8' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** El proyecto del fixture con los medios como FICHA: sin sus bytes. */
function conFichas(p: Proyecto): Proyecto {
  return {
    ...p,
    medios: (p.medios ?? []).map((a) =>
      esFicha(a) || /\.(jpe?g|png)$/u.test(a.nombre) ? a : ficha(a.ruta, a.bytes.length, crc32(a.bytes)),
    ),
  }
}

describe('el CRC-32', () => {
  it('es el de zip: el vector de siempre y el de zlib con datos al azar', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const datos = new Uint8Array(100_003).map((_, i) => (i * 2654435761) >>> 24)
    expect(crc32(datos)).toBe(crcDeNode(datos))
  })

  it('se puede calcular por trozos: asi se saca el de un video sin cargarlo', () => {
    const datos = new Uint8Array(50_000).map((_, i) => (i * 7919) & 0xff)
    let c = 0
    for (let i = 0; i < datos.length; i += 777) c = crc32(datos.subarray(i, i + 777), c)
    expect(c).toBe(crc32(datos))
  })
})

describe('el zip en segmentos', () => {
  const medio = new Uint8Array(70_000).map((_, i) => (i * 31) & 0xff)
  const segmentos = escribirZipSegmentado(
    [
      { ruta: 'a.txt', datos: new TextEncoder().encode('hola '.repeat(200)) },
      { ruta: 'medios/v.m4v', hueco: { medio: 'medios/v.m4v', tamano: medio.length, crc32: crc32(medio) } },
      { ruta: 'b/ñandú.txt', datos: new TextEncoder().encode('después del video') },
      { ruta: 'medios/a.m4a', hueco: { medio: 'medios/a.m4a', tamano: 3, crc32: crc32(new Uint8Array([1, 2, 3])) } },
    ],
    AHORA,
    () => 6,
  )
  const relleno = (ruta: string): Uint8Array => (ruta === 'medios/v.m4v' ? medio : new Uint8Array([1, 2, 3]))

  it('deja un hueco por medio, y la cabecera de cada uno cierra el trozo anterior', () => {
    expect(segmentos.map((s) => (esHueco(s) ? `hueco:${s.medio}:${s.tamano}` : 'bytes'))).toEqual([
      'bytes',
      'hueco:medios/v.m4v:70000',
      'bytes',
      'hueco:medios/a.m4a:3',
      'bytes',
    ])
    expect(tamanoDe(segmentos)).toBe(unirSegmentos(segmentos, relleno).length)
  })

  it('rellenado, es un zip correcto: unzip -t comprueba cada CRC', () => {
    const salida = unzipT(unirSegmentos(segmentos, relleno))
    expect(salida).toMatch(/No errors detected/u)
    const z = unzipSync(unirSegmentos(segmentos, relleno))
    expect(z['medios/v.m4v']).toEqual(medio)
    expect(new TextDecoder().decode(z['b/ñandú.txt'])).toBe('después del video')
  })

  it('un hueco mal rellenado no pasa: mas vale un error que un zip roto', () => {
    expect(() => unirSegmentos(segmentos, () => new Uint8Array(5))).toThrow(/espera 70000/u)
  })

  it('se lee sin tocar los huecos: lo que la vista previa necesita', () => {
    const { archivos, huecos } = archivosDeSegmentos(segmentos)
    expect([...archivos.keys()].sort()).toEqual(['a.txt', 'b/ñandú.txt'])
    expect([...huecos]).toEqual([
      ['medios/v.m4v', 'medios/v.m4v'],
      ['medios/a.m4a', 'medios/a.m4a'],
    ])
  })

  it('sin ZIP64: pasar de 4 GiB es un error, no un zip corrupto', () => {
    expect(() =>
      escribirZipSegmentado([{ ruta: 'v.m4v', hueco: { medio: 'v', tamano: 0xffffffff, crc32: 0 } }], AHORA, () => 0),
    ).toThrow(/4 GB/u)
  })
})

describe('el EPUB con los medios como ficha', () => {
  const conBytes = construir(leerProyecto(FIXTURE), { ahora: AHORA })
  const sinBytes = construir(conFichas(leerProyecto(FIXTURE)), { ahora: AHORA })
  const apple = sinBytes.resultados.find((r) => r.tienda === 'AppleBooks')
  const original = (ruta: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURE, ruta)))

  it('el motor no tiene el EPUB entero de Apple Books: tiene sus trozos y sus huecos', () => {
    expect(apple?.bytes).toBeNull()
    expect(apple?.segmentos.filter(esHueco).map((h) => h.medio)).toEqual([
      'medios/cap01-v01.m4v',
      'medios/cap01-a01.m4a',
      'medios/cap02-a01.m4a',
    ])
  })

  it('rellenado, es EXACTAMENTE el mismo EPUB que si el motor hubiera tenido los bytes', () => {
    const rellenado = unirSegmentos(apple?.segmentos ?? [], original)
    expect(rellenado).toEqual(conBytes.resultados.find((r) => r.tienda === 'AppleBooks')?.bytes)
    expect(apple?.tamano).toBe(rellenado.length)
    expect(unzipT(rellenado)).toMatch(/No errors detected/u)
  })

  it('el de Kindle no tiene huecos, y es el de siempre', () => {
    const k = sinBytes.resultados.find((r) => r.tienda === 'Kindle')
    expect(k?.segmentos).toHaveLength(1)
    expect(k?.bytes).toEqual(conBytes.resultados.find((r) => r.tienda === 'Kindle')?.bytes)
  })

  it('el mimetype va primero, sin comprimir y sin campos extra (PKG-005 y PKG-006)', () => {
    const primero = apple?.segmentos[0] as Uint8Array
    const dv = new DataView(primero.buffer, primero.byteOffset, primero.byteLength)
    expect(dv.getUint32(0, true)).toBe(0x04034b50)
    expect(dv.getUint16(8, true)).toBe(0)
    expect(dv.getUint16(28, true)).toBe(0)
    expect(new TextDecoder().decode(primero.subarray(30, 38))).toBe('mimetype')
    expect(new TextDecoder().decode(primero.subarray(38, 58))).toBe('application/epub+zip')
  })

  it('la vista previa lo abre sin los videos, y los reproduce desde donde le digan', () => {
    const epub = abrirEpub(apple?.segmentos as readonly Segmento[])
    expect(epub.huecos.get('OEBPS/medios/cap01-v01.m4v')).toBe('medios/cap01-v01.m4v')
    expect(epub.archivos.has('OEBPS/medios/cap01-v01.m4v')).toBe(false)
    const doc = documentoDePagina(epub, 'OEBPS/texto/cap01.xhtml', (r) => `blob:${r}`, 'claro')
    expect(doc).toContain('<video src="blob:OEBPS/medios/cap01-v01.m4v" poster="blob:OEBPS/imagenes/cap01-v01.jpg"')
    expect(doc).toContain('<audio src="blob:OEBPS/medios/cap01-a01.m4a"')
  })
})
