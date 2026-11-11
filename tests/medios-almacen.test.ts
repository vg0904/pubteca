import 'fake-indexeddb/auto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { leerCopia, leerZip } from '../src/app/abrir-copia'
import {
  abrirAlmacen,
  borrarProyecto,
  GRACIA_IMAGEN,
  guardarProyecto,
  leerMedio,
  limpiarMedios,
  mediosDelProyecto,
  type Almacen,
} from '../src/app/almacen'
import { segmentosDeCopia } from '../src/app/copia'
import { LIMITE_APPLE, pesoDeMedios, RECOMENDADO_APPLE } from '../src/app/entrega'
import { exportar } from '../src/app/exportar'
import { blobDeSegmentos, blobsDeHuecos } from '../src/app/generar'
import { DATOS_POR_DEFECTO, type Bloque, type Imagen, type Medio, type Proyecto } from '../src/app/modelo'
import { crcDeBlob, Repositorio } from '../src/app/repositorio'
import { revisar } from '../src/app/revision'
import { crc32 } from '../src/core/crc32'

/**
 * El almacen de audio y video, la copia (.zip) con medios/ y el peso del
 * libro (hito M2). Los videos nunca se cargan enteros: se guardan como Blob,
 * se meten en la copia como Blob, y la copia se vuelve a abrir cortando el
 * archivo, sin leerlo.
 */

const MEDIOS = join(import.meta.dirname, 'fixtures', 'libro-medios', 'medios')
const leer = (n: string): Uint8Array<ArrayBuffer> => new Uint8Array(readFileSync(join(MEDIOS, n)))
const bytesDe = async (b: Blob | Uint8Array): Promise<Uint8Array> => (b instanceof Uint8Array ? b : new Uint8Array(await b.arrayBuffer()))

let db: Almacen
let n = 0
const nuevoId = (prefijo: string): string => `${prefijo}-${++n}`

beforeEach(async () => {
  if (db) db.close()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('pubteca')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  db = await abrirAlmacen()
  n = 0
})

const video: Bloque = { id: 'b-v', tipo: 'video', medioId: 'm-video', posterId: 'i-poster', alt: 'El muelle', decorativa: false }
const audio: Bloque = { id: 'b-a', tipo: 'audio', medioId: 'm-audio', alt: 'Una sirena', decorativa: false }

function libro(bloques: readonly Bloque[] = [video, audio]): Proyecto {
  return {
    id: 'libro',
    version: 2,
    datos: { ...DATOS_POR_DEFECTO, titulo: 'La voz del faro', autor: 'Ana Ruiz' },
    capitulos: [
      { id: 'c1', etiqueta: 'Capítulo 1', titulo: [{ texto: 'La cinta', marcas: [] }], aperturas: [], bloques: [{ id: 'p', tipo: 'parrafo', tramos: [{ texto: 'Texto.', marcas: [] }] }, ...bloques] },
    ],
    extras: [],
    laminas: [],
    portada: {},
  }
}

const poster = leer('cap01-v01.jpg')
const imagenes = new Map<string, Imagen>([['i-poster', { id: 'i-poster', nombreOriginal: 'poster.jpg', tipo: 'jpeg', bytes: poster.length, ancho: 160, alto: 90 }]])

describe('el almacen de medios', () => {
  it('guarda el Blob, saca el CRC por trozos y lo devuelve al abrir el libro', async () => {
    const repo = new Repositorio(db, 'libro')
    const datos = leer('cap01-v01.m4v')
    const m = await repo.anadirMedio('m-video', 'IMG_0001.mov', new Blob([datos]), { tipo: 'm4v', segundos: 1 }, 1000)
    expect(m).toEqual({ id: 'm-video', nombreOriginal: 'IMG_0001.mov', tipo: 'm4v', bytes: datos.length, crc32: crc32(datos), segundos: 1 })
    expect((await leerMedio(db, 'm-video'))?.proyectoId).toBe('libro')

    const { repo: otra } = await Repositorio.abrir(db, 'libro')
    expect(otra.medios().get('m-video')).toEqual(m)
    expect(await bytesDe(otra.blobMedio('m-video') as Blob)).toEqual(datos)
  })

  it('el CRC por trozos es el del archivo entero, sea cual sea el trozo', async () => {
    const datos = leer('cap01-a01.m4a')
    for (const trozo of [1, 7, 4096, 1_000_000]) expect(await crcDeBlob(new Blob([datos]), trozo)).toBe(crc32(datos))
  })

  it('limpiar quita los que el libro ya no usa, pasada la gracia; borrar el libro los quita todos', async () => {
    const repo = new Repositorio(db, 'libro')
    await repo.anadirMedio('m-viejo', 'viejo.m4a', new Blob([leer('cap01-a01.m4a')]), { tipo: 'm4a', segundos: 1 }, 0)
    await repo.anadirMedio('m-recien', 'recien.m4a', new Blob([leer('cap02-a01.m4a')]), { tipo: 'm4a', segundos: 1 }, GRACIA_IMAGEN)
    await repo.anadirMedio('m-audio', 'usado.m4a', new Blob([leer('cap02-a01.m4a')]), { tipo: 'm4a', segundos: 1 }, 0)
    expect(await limpiarMedios(db, 'libro', new Set(['m-audio']), GRACIA_IMAGEN + 1)).toBe(1)
    expect((await mediosDelProyecto(db, 'libro')).map((m) => m.id).sort()).toEqual(['m-audio', 'm-recien'])
    await guardarProyecto(db, libro(), 1)
    await borrarProyecto(db, 'libro')
    expect(await mediosDelProyecto(db, 'libro')).toEqual([])
  })

  it('una base de la version anterior se abre, conserva lo suyo y gana el almacen de medios', async () => {
    db.close()
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('pubteca')
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    })
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('pubteca', 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('proyectos', { keyPath: 'id' }).put({ ...libro([]), version: 1, modificado: 5 })
        req.result.createObjectStore('imagenes', { keyPath: 'id' }).createIndex('porProyecto', 'proyectoId')
      }
      req.onsuccess = () => {
        req.result.close()
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
    db = await abrirAlmacen()
    expect([...db.objectStoreNames].sort()).toEqual(['imagenes', 'medios', 'proyectos'])
    expect((await db.get('proyectos', 'libro'))?.modificado).toBe(5)
  })
})

describe('la copia (.zip) con medios, ida y vuelta', () => {
  async function copiaDe(): Promise<{ blob: Blob; medios: Map<string, Medio>; blobs: Map<string, Blob> }> {
    const repo = new Repositorio(db, 'libro')
    await repo.anadirMedio('m-video', 'IMG_0001.mov', new Blob([leer('cap01-v01.m4v')]), { tipo: 'm4v', segundos: 1 }, 0)
    await repo.anadirMedio('m-audio', 'Nota de voz.m4a', new Blob([leer('cap01-a01.m4a')]), { tipo: 'm4a', segundos: 2 }, 0)
    const medios = new Map(repo.medios())
    // Sin los bytes de los medios: van como ficha, y se rellenan con su Blob.
    const e = exportar(libro(), imagenes, new Map([['i-poster', poster]]), [], medios)
    const segmentos = segmentosDeCopia(e, libro(), imagenes, new Date('2026-11-11T12:00:00Z'), medios)
    const blob = blobDeSegmentos(segmentos, blobsDeHuecos(e.rutasMedios, (id) => repo.blobMedio(id)), 'application/zip')
    return { blob, medios, blobs: new Map([['m-video', repo.blobMedio('m-video') as Blob], ['m-audio', repo.blobMedio('m-audio') as Blob]]) }
  }

  it('es un zip correcto (unzip -t) con medios/ y el LEEME lo dice', async () => {
    const { blob } = await copiaDe()
    const dir = mkdtempSync(join(tmpdir(), 'pubteca-copia-'))
    try {
      writeFileSync(join(dir, 'c.zip'), new Uint8Array(await blob.arrayBuffer()))
      const salida = execFileSync('unzip', ['-t', join(dir, 'c.zip')], { encoding: 'utf8' })
      expect(salida).toMatch(/No errors detected/u)
      expect(salida).toMatch(/medios\/cap01-v01\.m4v/u)
      expect(execFileSync('unzip', ['-p', join(dir, 'c.zip'), 'LEEME.txt'], { encoding: 'utf8' })).toMatch(/medios\//u)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('al abrirla, los medios NO se leen: son un trozo del archivo', async () => {
    const { blob } = await copiaDe()
    const z = await leerZip(blob)
    expect([...(z?.grandes.keys() ?? [])].sort()).toEqual(['medios/cap01-a01.m4a', 'medios/cap01-v01.m4v'])
    expect(z?.archivos.has('medios/cap01-v01.m4v')).toBe(false)
    expect(z?.archivos.has('medios/cap01-v01.jpg')).toBe(true)
  })

  it('devuelve el libro identico: los bloques, los datos de cada medio y sus bytes', async () => {
    const { blob, medios, blobs } = await copiaDe()
    const z = await leerZip(blob)
    if (!z) throw new Error('no se leyo el zip')
    const r = leerCopia(z.archivos, nuevoId, z.grandes)
    if (!r.ok) throw new Error(r.error)
    expect(r.copia.origen).toBe('pubteca')
    expect(r.copia.avisos).toEqual([])

    const [v, a] = r.copia.proyecto.capitulos[0]?.bloques.slice(1) ?? []
    const porId = new Map(r.copia.medios.map((m) => [m.id, m]))
    const imagenNueva = r.copia.imagenes.find((i) => v?.tipo === 'video' && i.id === v.posterId)
    expect(v?.tipo === 'video' && { ...v, id: '', medioId: '', posterId: '' }).toEqual({ ...video, id: '', medioId: '', posterId: '' })
    expect(a?.tipo === 'audio' && { ...a, id: '', medioId: '' }).toEqual({ ...audio, id: '', medioId: '' })
    expect(imagenNueva?.bytes).toEqual(poster)

    for (const [bloque, viejo] of [[v, 'm-video'], [a, 'm-audio']] as const) {
      const m = bloque && (bloque.tipo === 'video' || bloque.tipo === 'audio') ? porId.get(bloque.medioId) : undefined
      const antes = medios.get(viejo) as Medio
      expect(m && { nombreOriginal: m.nombreOriginal, tipo: m.tipo, segundos: m.segundos, tamano: m.tamano, crc32: m.crc32 }).toEqual({
        nombreOriginal: antes.nombreOriginal,
        tipo: antes.tipo,
        segundos: antes.segundos,
        tamano: antes.bytes,
        crc32: antes.crc32,
      })
      expect(await bytesDe((m as { datos: Blob }).datos)).toEqual(await bytesDe(blobs.get(viejo) as Blob))
    }
  })

  it('un medio que falta en la copia se avisa, y su bloque se queda', async () => {
    const e = exportar(libro(), imagenes, new Map([['i-poster', poster]]), [], new Map())
    const segmentos = segmentosDeCopia(e, libro(), imagenes, new Date('2026-11-11T12:00:00Z'))
    const z = await leerZip(new Blob(segmentos.map((s) => s as Uint8Array<ArrayBuffer>)))
    const r = leerCopia(z?.archivos ?? new Map(), nuevoId, z?.grandes)
    if (!r.ok) throw new Error(r.error)
    expect(r.copia.avisos.map((x) => x.clave)).toEqual(['faltaMedio', 'faltaMedio'])
    expect(r.copia.proyecto.capitulos[0]?.bloques.map((b) => b.tipo)).toEqual(['parrafo', 'video', 'audio'])
  })

  it('una copia sin medios sale en un solo trozo, como siempre', () => {
    const p = libro([])
    const segmentos = segmentosDeCopia(exportar(p, new Map(), new Map()), p, new Map(), new Date())
    expect(segmentos).toHaveLength(1)
  })
})

describe('el peso del audio y el video', () => {
  const medio = (bytes: number): Medio => ({ id: 'm', nombreOriginal: 'x', tipo: 'm4v', bytes, crc32: 0, segundos: 1 })
  const p = libro([{ ...video, medioId: 'm' }])

  it('hasta 500 MB, nada; mas, aviso; mas de 2 GB, bloquea la generacion', () => {
    expect(pesoDeMedios(p, new Map([['m', medio(RECOMENDADO_APPLE - poster.length)]]), imagenes).nivel).toBe('ok')
    expect(pesoDeMedios(p, new Map([['m', medio(RECOMENDADO_APPLE)]]), imagenes).nivel).toBe('aviso')
    expect(pesoDeMedios(p, new Map([['m', medio(LIMITE_APPLE)]]), imagenes).nivel).toBe('bloquea')
    expect(revisar(p, imagenes, new Map([['m', medio(LIMITE_APPLE)]])).map((x) => [x.clave, x.nivel])).toEqual([['mediosPasanLimite', 'bloquea']])
    expect(revisar(p, imagenes, new Map([['m', medio(RECOMENDADO_APPLE)]])).map((x) => [x.clave, x.nivel])).toEqual([['mediosPesan', 'aviso']])
  })

  it('las imagenes cuentan para el limite: van tal cual en Apple Books', () => {
    const grande = new Map([['i-poster', { ...(imagenes.get('i-poster') as Imagen), bytes: RECOMENDADO_APPLE }]])
    expect(pesoDeMedios(p, new Map([['m', medio(1)]]), grande).nivel).toBe('aviso')
  })

  it('un libro sin medios no tiene nada que pesar, aunque sus imagenes pesen mucho', () => {
    const grande = new Map([['i-poster', { ...(imagenes.get('i-poster') as Imagen), bytes: LIMITE_APPLE * 2 }]])
    expect(pesoDeMedios(libro([]), new Map(), grande).nivel).toBe('ok')
  })

  it('un medio que el libro usa y no esta en este navegador es un error', () => {
    expect(revisar(p, imagenes, new Map()).map((x) => [x.clave, x.nivel])).toEqual([['faltaMedio', 'error']])
  })

  it('armar el EPUB con un medio que no mide lo que dice su cabecera falla, no da un archivo roto', () => {
    expect(() => blobDeSegmentos([{ medio: 'medios/x.m4v', tamano: 10 }], () => new Blob([new Uint8Array(9)]), 'x')).toThrow(/espera 10/u)
    expect(() => blobDeSegmentos([{ medio: 'medios/x.m4v', tamano: 10 }], () => undefined, 'x')).toThrow(/no está/u)
  })
})
