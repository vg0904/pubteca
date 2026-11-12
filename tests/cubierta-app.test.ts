import 'fake-indexeddb/auto'
import { readdirSync, readFileSync } from 'node:fs'
import { crc32 as crcDeNode } from 'node:zlib'
import { zlibSync } from 'fflate'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archivosDeZip, leerCopia } from '../src/app/abrir-copia'
import { abrirAlmacen, guardarProyecto, leerProyecto } from '../src/app/almacen'
import { zipDeCopia } from '../src/app/copia'
import { avisosDeCubierta } from '../src/app/cubierta/avisos'
import { colorMedio, luminanciasDe } from '../src/app/cubierta/medir'
import { CIFRAS_MUESTRA, GRIS_MUESTRA, codigoSuelto, muestraDelCodigo } from '../src/app/cubierta/codigo'
import { pintarCubierta, pintarSueltas, trazosDeCubierta, type PincelCubierta } from '../src/app/cubierta/pintar'
import { motivoIsbn } from '../src/app/isbn'
import { arrastrada, direccionDeTecla, movibles, movidaDe, paso, piezaEn } from '../src/app/cubierta/mover'
import { ALTO_EBOOK, medidasDelEbook, pintarEbook } from '../src/app/cubierta/epub'
import { controlEan } from '../src/core/impreso/ean13'
import { conPpi, pixelesPorMetro } from '../src/core/png'
import { ui as es } from '../src/i18n/es'
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

describe('el codigo en la pantalla: la muestra y el codigo suelto', () => {
  const f = fuentesCubiertaDelRepo()
  const rotulos = { sinIsbn: 'MUESTRA · FALTA EL ISBN', kdp: 'AQUÍ PONE KDP EL SUYO' }
  const dentro = (o: { x: number; y: number }, c: { x: number; y: number; ancho: number; alto: number }): boolean => o.x >= c.x - 1e-6 && o.x <= c.x + c.ancho + 1e-6 && o.y >= c.y - 1e-6 && o.y <= c.y + c.alto + 1e-6

  it('con el codigo de verdad no hay muestra; sin ISBN, o con la caja para KDP, si, en gris y con su rotulo', () => {
    expect(muestraDelCodigo(cubiertaDePrueba(), rotulos, f)).toEqual([])
    const sin = cubiertaDePrueba({}, { isbn: '' })
    const m = muestraDelCodigo(sin, rotulos, f)
    expect(m.length).toBeGreaterThan(20)
    for (const o of m) expect(dentro(o, sin.codigo)).toBe(true)
    expect(m.filter((o) => o.op === 'rect' && o.gris !== 1).every((o) => o.gris === GRIS_MUESTRA)).toBe(true)
    // Sin cifras debajo: el unico texto es el rotulo, encima de las barras.
    const textos = m.filter((o) => o.op === 'texto')
    const glifos = textos.flatMap((o) => (o.op === 'texto' ? o.glifos : []))
    expect(glifos.length).toBe(f.jost.formar(rotulos.sinIsbn.replace(/ /gu, '')).glifos.length)
    const kdp = muestraDelCodigo(cubiertaDePrueba({ codigo: 'kdp' }), rotulos, f)
    expect(kdp.filter((o) => o.op === 'texto').flatMap((o) => (o.op === 'texto' ? o.glifos : [])).length).toBe(f.jost.formar(rotulos.kdp.replace(/ /gu, '')).glifos.length)
  })

  it('las barras de la muestra no las acepta ningun lector: su digito de control esta mal', () => {
    expect(controlEan(CIFRAS_MUESTRA.slice(0, 12))).not.toBe(Number(CIFRAS_MUESTRA[12]))
  })

  it('la muestra va en gris medio: se ve que esta, y que no es el codigo de verdad (negro)', () => {
    expect(GRIS_MUESTRA).toBeGreaterThanOrEqual(0.35)
    expect(GRIS_MUESTRA).toBeLessThanOrEqual(0.65)
  })

  it('la muestra solo se pinta si se pide: ni el PDF ni el PNG la llevan', () => {
    const c = cubiertaDePrueba({}, { isbn: '' })
    const m = muestraDelCodigo(c, rotulos, f)
    const pinta = (extra?: typeof m) => {
      const fills: unknown[][] = []
      const ctx = { setTransform: () => undefined, fillRect: (...a: number[]) => void fills.push(a), strokeRect: () => undefined, fill: () => undefined, drawImage: () => undefined, setLineDash: () => undefined, save: () => undefined, restore: () => undefined } as unknown as PincelCubierta
      pintarCubierta(ctx, c, 1, { fuentes: f, trazo: trazosDeCubierta(f, (d) => ({ d }) as unknown as Path2D), imagen: () => null }, { capas: false, texto: true, ...(extra ? { extra } : {}) })
      return fills
    }
    const barras = m.filter((o) => o.op === 'rect' && o.gris === GRIS_MUESTRA)
    expect(pinta(m).length - pinta().length).toBe(barras.length + 1)
  })

  it('el codigo suelto: en el origen, en su caja de KDP, y nada si el ISBN no vale', () => {
    expect(codigoSuelto('978-84-09-12345-3', f)).toBeNull()
    expect(codigoSuelto('', f)).toBeNull()
    const s = codigoSuelto('978-84-09-12345-2', f)
    if (!s) throw new Error('sin codigo')
    expect(s.cifras).toBe('9788409123452')
    expect(s.caja).toMatchObject({ x: 0, y: 0, ancho: 144 })
    expect(s.caja.alto).toBeCloseTo(86.4, 9)
    expect(s.svg).toContain('<title>ISBN 978-84-09-12345-2</title>')
    // Se pinta desde su esquina, a 300 ppi: 600 × 360 pixeles de blanco y luego las barras.
    const llamadas: number[][] = []
    const ctx = { setTransform: () => undefined, fillRect: (...a: number[]) => void llamadas.push(a), fill: () => undefined } as unknown as PincelCubierta
    pintarSueltas(ctx, s.ops, s.caja, 300 / 72, { fuentes: f, trazo: trazosDeCubierta(f, (d) => ({ d }) as unknown as Path2D) })
    expect(llamadas[0]).toEqual([0, 0, 600, 360])
  })

  it('lo que falla de un ISBN, dicho al autor', () => {
    const t = es.impreso.creditos.isbnMal
    expect(motivoIsbn('', t)).toBeNull()
    expect(motivoIsbn('978-84-09-12345-2', t)).toBeNull()
    expect(motivoIsbn('4006381333931', t)).toBe(t.prefijo)
    expect(motivoIsbn('978-84-09-12345-3', t)).toBe(t.control('2'))
    expect(motivoIsbn('97884', t)).toBe(t.forma)
  })
})

describe('la resolucion de los PNG (pHYs)', () => {
  const bloque = (tipo: string, datos: Uint8Array): Uint8Array => {
    const r = new Uint8Array(12 + datos.length)
    const v = new DataView(r.buffer)
    v.setUint32(0, datos.length)
    r.set([...tipo].map((c) => c.charCodeAt(0)), 4)
    r.set(datos, 8)
    v.setUint32(8 + datos.length, crcDeNode(r.subarray(4, 8 + datos.length)))
    return r
  }
  // Un PNG de 1 × 1 pixel gris, hecho a mano.
  const ihdr = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0])
  const png = (...extra: Uint8Array[]): Uint8Array => {
    const partes = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', ihdr), ...extra, bloque('IDAT', zlibSync(new Uint8Array([0, 128]))), bloque('IEND', new Uint8Array())]
    const r = new Uint8Array(partes.reduce((n, p) => n + p.length, 0))
    let o = 0
    for (const p of partes) {
      r.set(p, o)
      o += p.length
    }
    return r
  }
  const bloques = (b: Uint8Array): { tipo: string; datos: Uint8Array; crcBien: boolean }[] => {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
    const r: { tipo: string; datos: Uint8Array; crcBien: boolean }[] = []
    for (let i = 8; i < b.length; ) {
      const n = v.getUint32(i)
      r.push({ tipo: String.fromCharCode(...b.subarray(i + 4, i + 8)), datos: b.subarray(i + 8, i + 8 + n), crcBien: v.getUint32(i + 8 + n) === crcDeNode(b.subarray(i + 4, i + 8 + n)) })
      i += 12 + n
    }
    return r
  }

  it('300 ppi son 11 811 pixeles por metro, en los dos ejes, justo despues de IHDR y con su CRC', () => {
    expect(pixelesPorMetro(300)).toBe(11811)
    const r = bloques(conPpi(png(), 300))
    expect(r.map((x) => x.tipo)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND'])
    expect(r.every((x) => x.crcBien)).toBe(true)
    const d = new DataView((r[1] as (typeof r)[number]).datos.slice().buffer)
    expect([d.getUint32(0), d.getUint32(4), d.getUint8(8)]).toEqual([11811, 11811, 1])
  })

  it('si ya traia uno, se cambia: nunca dos', () => {
    const viejo = bloque('pHYs', new Uint8Array([0, 0, 11, 19, 0, 0, 11, 19, 1]))
    const r = bloques(conPpi(png(viejo), 150))
    expect(r.filter((x) => x.tipo === 'pHYs')).toHaveLength(1)
    expect(new DataView((r[1] as (typeof r)[number]).datos.slice().buffer).getUint32(0)).toBe(5906)
  })

  it('lo que no es un PNG no se toca', () => {
    expect(() => conPpi(new Uint8Array(40), 300)).toThrow()
  })
})

describe('las piezas movidas a mano y la portada del ebook, en el modelo', () => {
  const e0: Estado = reducir(ESTADO_INICIAL, { tipo: 'abrir', proyecto: libroDeLaApp(), imagenes: [] })
  const mover = (e: Estado, pieza: 'titulo' | 'autor' | 'sello', a: { x: number; y: number } | null, ahora: number, estilo: 'papiro' | 'clasico' = 'clasico'): Estado =>
    reducir(e, { tipo: 'moverPieza', estilo, pieza, a, ahora })

  it('mover una pieza la apunta en su estilo, y el libro pasa a formato 5 (un 4 la perderia al normalizar)', () => {
    const e = mover(e0, 'titulo', { x: 0.1, y: -0.05 }, 1000)
    expect(e.proyecto?.cubierta?.mover).toEqual({ clasico: { titulo: { x: 0.1, y: -0.05 } } })
    expect(versionNecesaria(e.proyecto as Proyecto)).toBe(5)
    // A su sitio: no queda nada movido, y vuelve a bastar el formato 4.
    const sin = mover(e, 'titulo', null, 5000)
    expect(sin.proyecto?.cubierta?.mover).toEqual({})
    expect(versionNecesaria(sin.proyecto as Proyecto)).toBe(4)
  })

  it('un arrastre es un paso de deshacer; mover otra pieza, otro', () => {
    let e = mover(e0, 'titulo', { x: 0.01, y: 0 }, 1000)
    e = mover(e, 'titulo', { x: 0.02, y: 0 }, 1016)
    e = mover(e, 'titulo', { x: 0.03, y: 0 }, 1032)
    expect(e.pasado.length - e0.pasado.length).toBe(1)
    e = mover(e, 'autor', { x: 0, y: 0.02 }, 1048)
    expect(e.pasado.length - e0.pasado.length).toBe(2)
    expect(reducir(e, { tipo: 'deshacer' }).proyecto?.cubierta?.mover).toEqual({ clasico: { titulo: { x: 0.03, y: 0 } } })
    // Lo de otro estilo no se toca.
    expect(mover(e, 'sello', { x: 0.1, y: 0 }, 2000, 'papiro').proyecto?.cubierta?.mover).toMatchObject({ clasico: { titulo: { x: 0.03, y: 0 }, autor: { x: 0, y: 0.02 } }, papiro: { sello: { x: 0.1, y: 0 } } })
  })

  it('la portada en los EPUB tambien pide formato 5', () => {
    const e = reducir(e0, { tipo: 'cubierta', cambios: { enEpub: true }, ahora: 0 })
    expect(versionNecesaria(e.proyecto as Proyecto)).toBe(5)
  })

  it('la copia (.zip) devuelve lo movido y la portada en los EPUB, con su formato 5', () => {
    const p: Proyecto = { ...libroDeLaApp(), cubierta: { ...CONFIG_CUBIERTA_POR_DEFECTO, enEpub: true, mover: { franja: { autor: { x: -0.2, y: 0.1 } } } } }
    const e = exportar(p, new Map(), new Map())
    const zip = zipDeCopia(e, p, new Map(), new Date('2026-11-11T12:00:00Z'))
    const r = leerCopia(archivosDeZip(zip) as Map<string, Uint8Array>, nuevoId)
    if (!r.ok) throw new Error(r.error)
    expect(r.copia.proyecto.version).toBe(5)
    expect(r.copia.proyecto.cubierta).toMatchObject({ enEpub: true, mover: { franja: { autor: { x: -0.2, y: 0.1 } } } })
  })

  it('IndexedDB: se guarda como 5 y se lee entero', async () => {
    const db = await abrirAlmacen()
    const p = { ...libroDeLaApp(), cubierta: { ...CONFIG_CUBIERTA_POR_DEFECTO, mover: { cartel: { titulo: { x: 0, y: 0.3 } } } } }
    await guardarProyecto(db, p, 2)
    const leido = await leerProyecto(db, p.id)
    expect(leido?.version).toBe(5)
    expect(leido?.cubierta?.mover).toEqual({ cartel: { titulo: { x: 0, y: 0.3 } } })
    db.close()
  })
})

describe('mover con el raton, el dedo o las flechas', () => {
  const c = cubiertaDePrueba({ estilo: 'clasico' })
  const A = c.medidas.portada.ancho
  const centro = (que: string) => {
    const k = c.piezas.find((p) => p.que === que)?.caja
    if (!k) throw new Error(que)
    return { x: k.x + k.ancho / 2, y: k.y + k.alto / 2 }
  }

  it('las piezas que se mueven son las de la portada: ni el lomo ni la contraportada', () => {
    expect(movibles(c).map((p) => p.que).sort()).toEqual(['autor', 'sello', 'titulo'])
  })

  it('bajo el dedo: la pieza que hay, con 2 mm de holgura; fuera de las piezas, ninguna', () => {
    const t = centro('titulo')
    expect(piezaEn(c, t.x, t.y)).toBe('titulo')
    const k = c.piezas.find((p) => p.que === 'autor')?.caja as { x: number; y: number; ancho: number; alto: number }
    expect(piezaEn(c, k.x - 1.5 * (72 / 25.4), k.y)).toBe('autor')
    expect(piezaEn(c, k.x - 3 * (72 / 25.4), k.y - 3 * (72 / 25.4))).toBeNull()
    expect(piezaEn(c, c.medidas.contra.x + 20, c.medidas.contra.y + 20)).toBeNull()
  })

  it('si dos piezas se pisan, se coge la mas pequeña: la grande no la tapa', () => {
    const t = c.piezas.find((p) => p.que === 'titulo')?.caja as { x: number; y: number; ancho: number; alto: number }
    const au = c.piezas.find((p) => p.que === 'autor')?.caja as { x: number; y: number; ancho: number; alto: number }
    // El autor, movido al centro del titulo.
    const dy = (t.y + t.alto / 2 - (au.y + au.alto / 2)) / A
    const encima = cubiertaDePrueba({ estilo: 'clasico', mover: { clasico: { autor: { x: 0, y: dy } } } })
    const k = encima.piezas.find((p) => p.que === 'autor')?.caja as { x: number; y: number; ancho: number; alto: number }
    expect(piezaEn(encima, k.x + k.ancho / 2, k.y + k.alto / 2)).toBe('autor')
  })

  it('arrastrar: lo que se mueve el puntero, en fracciones de A, desde lo que de verdad estaba movido', () => {
    expect(arrastrada(c, { x: 0.1, y: 0 }, { x: 100, y: 100 }, { x: 100 + A / 4, y: 100 - A / 10 })).toEqual({ x: 0.35, y: -0.1 })
    const movida = cubiertaDePrueba({ estilo: 'clasico', mover: { clasico: { titulo: { x: 9, y: 0 } } } })
    // Se pidio de mas: se parte de lo que se movio, no de lo pedido.
    expect(movidaDe(movida, 'titulo').x).toBeLessThan(1)
    expect(movidaDe(c, 'titulo')).toEqual({ x: 0, y: 0 })
  })

  it('las flechas: 1 mm (o los que se pidan) en su direccion', () => {
    const mm = (72 / 25.4) / A
    expect(paso(c, 'autor', 'derecha', 1).x).toBeCloseTo(mm, 12)
    expect(paso(c, 'autor', 'arriba', 5).y).toBeCloseTo(-5 * mm, 12)
    expect(paso(c, 'autor', 'izquierda', 1).x).toBeCloseTo(-mm, 12)
    expect(paso(c, 'autor', 'abajo', 1)).toEqual({ x: 0, y: expect.closeTo(mm, 12) })
    expect(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].map(direccionDeTecla)).toEqual(['izquierda', 'derecha', 'arriba', 'abajo', null])
  })
})

describe('la portada del ebook', () => {
  const f = fuentesCubiertaDelRepo()
  it('por su corte, sin sangrado, a 2560 px de alto: 6 × 9 in da 1707 × 2560', () => {
    const c = cubiertaDePrueba()
    expect(medidasDelEbook(c)).toMatchObject({ ancho: 1707, alto: ALTO_EBOOK })
    const llamadas: number[][] = []
    const strokes: number[][] = []
    const ctx = { setTransform: (...a: number[]) => void llamadas.push(a), fillRect: () => undefined, strokeRect: (...a: number[]) => void strokes.push(a), fill: () => undefined, drawImage: () => undefined, setLineDash: () => undefined, save: () => undefined, restore: () => undefined } as unknown as PincelCubierta
    pintarEbook(ctx, c, { fuentes: f, trazo: trazosDeCubierta(f, (d) => ({ d }) as unknown as Path2D), imagen: () => null })
    const k = ALTO_EBOOK / c.medidas.portada.alto
    // Las capas, desde la esquina del corte de la portada; ni guias ni marcos.
    expect(llamadas).toContainEqual([k, 0, 0, k, -c.medidas.portada.x * k, -c.medidas.portada.y * k])
    expect(strokes).toEqual([])
  })

  it('el marco de la pieza elegida solo se pinta si se pide', () => {
    const c = cubiertaDePrueba()
    const caja = c.piezas.find((p) => p.que === 'autor')?.caja as { x: number; y: number; ancho: number; alto: number }
    const strokes: number[][] = []
    const ctx = { setTransform: () => undefined, fillRect: () => undefined, strokeRect: (...a: number[]) => void strokes.push(a), fill: () => undefined, drawImage: () => undefined, setLineDash: () => undefined, save: () => undefined, restore: () => undefined } as unknown as PincelCubierta
    pintarCubierta(ctx, c, 1, { fuentes: f, trazo: trazosDeCubierta(f, (d) => ({ d }) as unknown as Path2D), imagen: () => null }, { capas: false, texto: false, marcar: caja })
    expect(strokes).toHaveLength(2)
    expect(strokes[0]).toEqual([caja.x - 3, caja.y - 3, caja.ancho + 6, caja.alto + 6])
  })
})
