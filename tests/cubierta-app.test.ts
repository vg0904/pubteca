import 'fake-indexeddb/auto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archivosDeZip, leerCopia } from '../src/app/abrir-copia'
import { abrirAlmacen, guardarProyecto, leerProyecto } from '../src/app/almacen'
import { zipDeCopia } from '../src/app/copia'
import { avisosDeCubierta } from '../src/app/cubierta/avisos'
import { colorMedio, luminanciasDe } from '../src/app/cubierta/medir'
import { pintarCubierta, trazosDeCubierta, type PincelCubierta } from '../src/app/cubierta/pintar'
import { configCubiertaDe, datosDeCubierta } from '../src/app/cubierta/preparar'
import { ESTADO_INICIAL, reducir, type Accion, type Estado } from '../src/app/estado'
import { exportar } from '../src/app/exportar'
import { versionNecesaria, type Imagen, type Proyecto } from '../src/app/modelo'
import { CONFIG_IMPRESO_POR_DEFECTO } from '../src/core/impreso/config'
import { CONFIG_CUBIERTA_POR_DEFECTO } from '../src/core/impreso/cubierta-config'
import { construir } from '../src/core/construir'
import { FIXTURE } from '../scripts/impreso-prueba'
import { cubiertaDePrueba, fuentesCubiertaDelRepo } from '../scripts/cubierta-prueba'

// La cubierta en la app: lo que se le pasa al core, las opciones en el modelo
// (deshacer, version 4, almacen y copia), las imagenes del sello, el pintor que
// pinta las capas y el texto, y lo que se mide de los dibujos.

let n = 0
const nuevoId = (prefijo: string): string => `${prefijo}-${++n}`

function libroDeLaApp(): Proyecto {
  const archivos = new Map<string, Uint8Array>([['libro.txt', new Uint8Array(readFileSync(join(FIXTURE, 'libro.txt')))]])
  for (const carpeta of ['capitulos', 'extras']) {
    for (const nombre of readdirSync(join(FIXTURE, carpeta))) archivos.set(`${carpeta}/${nombre}`, new Uint8Array(readFileSync(join(FIXTURE, carpeta, nombre))))
  }
  const r = leerCopia(archivos, nuevoId)
  if (!r.ok) throw new Error(r.error)
  return r.copia.proyecto
}

const img = (id: string, ancho: number, alto: number): Imagen => ({ id, nombreOriginal: `${id}.png`, tipo: 'png', bytes: 10, ancho, alto, alfa: true })
const IMAGENES = new Map([
  ['img-arte', img('img-arte', 1838, 2775)],
  ['img-sello', img('img-sello', 900, 300)],
  ['img-sello-claro', img('img-sello-claro', 900, 300)],
  ['img-iso', img('img-iso', 300, 300)],
])
const conImagenes = (p: Proyecto): Proyecto => ({ ...p, portada: { portada: 'img-arte', sello: 'img-sello', selloBlanco: 'img-sello-claro', isotipo: 'img-iso' } })

describe('del libro de la app a la cubierta', () => {
  it('el ISBN, el papel, el destino y el corte salen del impreso; las paginas, del interior compuesto', () => {
    const p: Proyecto = { ...conImagenes(libroDeLaApp()), impreso: { ...CONFIG_IMPRESO_POR_DEFECTO, isbn: '978-84-09-12345-2', papel: 'blanco', destino: 'ingram', corte: '5.5x8.5' } }
    const d = datosDeCubierta(p, IMAGENES, 212, { portada: { luz: { ancho: 1, alto: 1, valores: [0.3] }, borde: '#102030' } })
    expect([d.isbn, d.papel, d.destino, d.corte, d.paginas]).toEqual(['978-84-09-12345-2', 'blanco', 'ingram', { ancho: 396, alto: 612 }, 212])
    expect(d.titulo).toBe('El faro de las mareas quietas')
    expect(d.imagenes.portada).toEqual({ ancho: 1838, alto: 2775, luz: { ancho: 1, alto: 1, valores: [0.3] } })
    expect(d.imagenes.sello).toEqual({ ancho: 900, alto: 300 })
    expect(d.imagenes.isotipo).toEqual({ ancho: 300, alto: 300 })
    expect(d.bordePortada).toBe('#102030')
  })

  it('un libro sin tocar la cubierta usa la de por defecto', () => {
    expect(configCubiertaDe(libroDeLaApp())).toBe(CONFIG_CUBIERTA_POR_DEFECTO)
  })
})

describe('las opciones de la cubierta y el sello en el modelo', () => {
  const e0: Estado = reducir(ESTADO_INICIAL, { tipo: 'abrir', proyecto: libroDeLaApp(), imagenes: [] })
  const cubierta = (e: Estado, cambios: Extract<Accion, { tipo: 'cubierta' }>['cambios'], ahora = 0): Estado => reducir(e, { tipo: 'cubierta', cambios, ahora })

  it('la primera opcion crea `cubierta`, y el libro pasa a guardarse como formato 4', () => {
    const e1 = cubierta(e0, { estilo: 'cartel' })
    expect(e1.proyecto?.cubierta?.estilo).toBe('cartel')
    expect(versionNecesaria(e0.proyecto as Proyecto)).toBe(1)
    expect(versionNecesaria(e1.proyecto as Proyecto)).toBe(4)
  })

  it('un cambio que no cambia nada no crea nada; el encuadre arrastrado es un solo paso de deshacer', () => {
    expect(cubierta(e0, { estilo: 'papiro' })).toBe(e0)
    let e = cubierta(e0, { encuadre: { x: 0.4, y: 0.5 } }, 1000)
    e = cubierta(e, { encuadre: { x: 0.3, y: 0.5 } }, 1100)
    expect(e.pasado.length - e0.pasado.length).toBe(1)
    expect(reducir(e, { tipo: 'deshacer' }).proyecto?.cubierta).toBeUndefined()
  })

  it('las tintas se suman a las que ya habia', () => {
    const e = cubierta(cubierta(e0, { tintas: { autor: 'clara' } }), { tintas: { titulo: 'oscura' } })
    expect(e.proyecto?.cubierta?.tintas).toEqual({ autor: 'clara', titulo: 'oscura' })
  })

  it('el logo del sello solo ya pide formato 4; quitarlo quita su version clara', () => {
    const e = reducir(e0, { tipo: 'portada', cambios: { sello: 'a', selloBlanco: 'b' } })
    expect(versionNecesaria(e.proyecto as Proyecto)).toBe(4)
    const sin = reducir(e, { tipo: 'portada', cambios: { sello: null } })
    expect(sin.proyecto?.portada).toEqual({})
  })
})

describe('el sello y la cubierta se guardan y viajan en la copia', () => {
  it('IndexedDB: formato 4, y la cubierta se normaliza al leer', async () => {
    const db = await abrirAlmacen()
    const p = libroDeLaApp()
    await db.put('proyectos', { ...p, version: 4, modificado: 1, cubierta: { estilo: 'franja', lomoManual: 999 } } as never)
    const leido = await leerProyecto(db, p.id)
    expect(leido?.cubierta).toEqual({ ...CONFIG_CUBIERTA_POR_DEFECTO, estilo: 'franja', lomoManual: 120 })
    await guardarProyecto(db, { ...p, cubierta: CONFIG_CUBIERTA_POR_DEFECTO }, 2)
    expect((await leerProyecto(db, p.id))?.version).toBe(4)
    db.close()
  })

  it('la copia (.zip) devuelve la cubierta y las cuatro imagenes del sello en su papel', () => {
    const p: Proyecto = { ...conImagenes(libroDeLaApp()), portada: { sello: 'img-sello', selloBlanco: 'img-sello-claro', isotipo: 'img-iso' }, cubierta: { ...CONFIG_CUBIERTA_POR_DEFECTO, estilo: 'esquina', codigo: 'kdp' } }
    const bytes = new Map([...IMAGENES.keys()].map((id, i) => [id, new Uint8Array([0x89, 0x50, 0x4e, 0x47, i])]))
    const e = exportar(p, IMAGENES, bytes)
    expect(e.proyecto.portada.map((a) => a.nombre).sort()).toEqual(['isotipo.png', 'sello-blanco.png', 'sello.png'])
    const zip = zipDeCopia(e, p, IMAGENES, new Date('2026-11-11T12:00:00Z'))
    const r = leerCopia(archivosDeZip(zip) as Map<string, Uint8Array>, nuevoId)
    if (!r.ok) throw new Error(r.error)
    expect(r.copia.proyecto.version).toBe(4)
    expect(r.copia.proyecto.cubierta).toMatchObject({ estilo: 'esquina', codigo: 'kdp' })
    expect(Object.keys(r.copia.proyecto.portada).sort()).toEqual(['isotipo', 'sello', 'selloBlanco'])
  })

  it('las imagenes del sello no entran en ningun EPUB', () => {
    const p = conImagenes(libroDeLaApp())
    const bytes = new Map([...IMAGENES.keys()].map((id) => [id, new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', 'imagenes', 'alfa.png')))]))
    const c = construir(exportar(p, IMAGENES, bytes).proyecto, { ahora: new Date('2026-11-11T12:00:00Z') })
    for (const r of c.resultados) {
      const archivos = archivosDeZip(r.segmentos[0] as Uint8Array)
      expect([...(archivos?.keys() ?? [])].filter((x) => /sello|isotipo/u.test(x)), r.tienda).toEqual([])
    }
  })
})

describe('el pintor de la cubierta', () => {
  const f = fuentesCubiertaDelRepo()

  function pincel() {
    const llamadas: { que: string; args: unknown[] }[] = []
    const ctx: PincelCubierta = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      setTransform: (...args: number[]) => void llamadas.push({ que: 'setTransform', args }),
      fillRect: (...args: number[]) => void llamadas.push({ que: 'fillRect', args }),
      strokeRect: (...args: number[]) => void llamadas.push({ que: 'strokeRect', args }),
      fill: (t: Path2D) => void llamadas.push({ que: 'fill', args: [t] }),
      drawImage: (_i: CanvasImageSource, ...args: number[]) => void llamadas.push({ que: 'drawImage', args }),
      setLineDash: () => undefined,
      save: () => undefined,
      restore: () => undefined,
    }
    return { ctx, llamadas }
  }
  const imagen = { width: 1838, height: 2775 } as unknown as CanvasImageSource & { width: number; height: number }
  const para = { fuentes: f, trazo: trazosDeCubierta(f, (d) => ({ d }) as unknown as Path2D), imagen: () => imagen }

  it('el dibujo, en su caja y con su recorte; el texto girado del lomo, de arriba abajo', () => {
    const c = cubiertaDePrueba()
    const { ctx, llamadas } = pincel()
    pintarCubierta(ctx, c, 2, para, { capas: true, texto: true })
    const arte = c.capas.find((x) => x.que === 'arte')
    if (arte?.que !== 'arte') throw new Error('sin dibujo')
    expect(llamadas.filter((l) => l.que === 'drawImage').map((l) => l.args)).toContainEqual([arte.recorte.x, arte.recorte.y, arte.recorte.ancho, arte.recorte.alto, arte.caja.x, arte.caja.y, arte.caja.ancho, arte.caja.alto])
    const lomo = c.ops.find((o) => o.op === 'texto' && o.giro === 90)
    if (lomo?.op !== 'texto') throw new Error('sin lomo')
    const k = (lomo.cuerpo / f[lomo.letra === 'libro' ? 'jost' : lomo.letra].upm) * 2
    expect(llamadas.filter((l) => l.que === 'setTransform').map((l) => l.args)).toContainEqual([0, k, k, 0, lomo.x * 2, lomo.y * 2])
  })

  it('las guias solo cuando se piden, y una region se pinta desde su esquina', () => {
    const c = cubiertaDePrueba()
    const sin = pincel()
    pintarCubierta(sin.ctx, c, 1, para, { capas: true, texto: true })
    expect(sin.llamadas.some((l) => l.que === 'strokeRect')).toBe(false)
    const con = pincel()
    pintarCubierta(con.ctx, c, 1, para, { capas: false, texto: false, guias: true })
    expect(con.llamadas.filter((l) => l.que === 'strokeRect').map((l) => l.args)).toContainEqual([c.codigo.x, c.codigo.y, c.codigo.ancho, c.codigo.alto])
    const r = pincel()
    pintarCubierta(r.ctx, c, 1, para, { capas: true, texto: false, region: c.medidas.portada })
    expect(r.llamadas.filter((l) => l.que === 'setTransform').map((l) => l.args)).toContainEqual([1, 0, 0, 1, -c.medidas.portada.x, -c.medidas.portada.y])
  })
})

describe('lo que se mide de los dibujos', () => {
  it('la luminancia de WCAG por pixel: blanco 1, negro 0', () => {
    const l = luminanciasDe([255, 255, 255, 255, 0, 0, 0, 255], 2, 1)
    expect(Number(l.valores[0])).toBeCloseTo(1, 6)
    expect(Number(l.valores[1])).toBe(0)
  })

  it('el color del borde: la media de las primeras columnas, desde la fila que se diga', () => {
    // Dos filas: arriba blanco, abajo azul. La parte baja da el azul.
    const rgba = [255, 255, 255, 255, 255, 255, 255, 255, 16, 32, 64, 255, 16, 32, 64, 255]
    expect(colorMedio(rgba, 2, 2, 1, 1)).toBe('#102040')
    expect(colorMedio(rgba, 2, 2, 1)).toBe('#8890a0')
  })
})

describe('los avisos de la cubierta', () => {
  it('sin el de color (va siempre arriba), sin repetidos, y los avisos antes que las notas', () => {
    const r = avisosDeCubierta([{ codigo: 'colorRgb' }, { codigo: 'codigoKdp' }, { codigo: 'sinPortada' }, { codigo: 'codigoKdp' }])
    expect(r.map((x) => [x.aviso.codigo, x.nivel])).toEqual([
      ['sinPortada', 'aviso'],
      ['codigoKdp', 'nota'],
    ])
  })
})
