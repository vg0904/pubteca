import 'fake-indexeddb/auto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { archivosDeZip, leerCopia } from '../src/app/abrir-copia'
import { abrirAlmacen, guardarProyecto, leerProyecto } from '../src/app/almacen'
import { zipDeCopia } from '../src/app/copia'
import { ESTADO_INICIAL, reducir, type Accion, type Estado } from '../src/app/estado'
import { exportar } from '../src/app/exportar'
import { agruparAvisos } from '../src/app/impreso/avisos'
import { aGris, pixelesDestino, tamanosImpresos } from '../src/app/impreso/grises'
import { ColaDeComposicion } from '../src/app/impreso/hilo'
import { cacheDeTrazos, pintarPagina, type Pincel } from '../src/app/impreso/lienzo'
import { MotorImpreso, type PedidoComponer, type RespuestaImpreso } from '../src/app/impreso/motor'
import { configDe, extrasDelImpreso, prepararImpreso } from '../src/app/impreso/preparar'
import { versionNecesaria, type Proyecto } from '../src/app/modelo'
import { CONFIG_IMPRESO_POR_DEFECTO } from '../src/core/impreso/config'
import { familia } from '../src/core/impreso/familias'
import { componerImpreso } from '../src/core/impreso/plan'
import type { AvisoImpreso, Cara, PaginaCompuesta } from '../src/core/impreso/tipos'
import { contenidoDePrueba, FIXTURE } from '../scripts/impreso-prueba'
import { fuentes } from './impreso/ayuda'

// La app del libro impreso: del libro de la app al compositor (por el mismo
// camino que el EPUB), las opciones en el modelo (deshacer, guardado, copia),
// el hilo que compone, el lienzo que pinta lo mismo que el PDF y las imagenes
// en gris. Lo que necesita un navegador de verdad (Worker, createImageBitmap)
// se probo a mano en Chromium: ver plan.md, M6.

let n = 0
const nuevoId = (prefijo: string): string => `${prefijo}-${++n}`

/** El libro inventado del impreso abierto en la app, como si se soltara su carpeta. */
function libroDeLaApp(): Proyecto {
  const archivos = new Map<string, Uint8Array>([['libro.txt', new Uint8Array(readFileSync(join(FIXTURE, 'libro.txt')))]])
  for (const carpeta of ['capitulos', 'extras']) {
    for (const nombre of readdirSync(join(FIXTURE, carpeta))) archivos.set(`${carpeta}/${nombre}`, new Uint8Array(readFileSync(join(FIXTURE, carpeta, nombre))))
  }
  const r = leerCopia(archivos, nuevoId)
  if (!r.ok) throw new Error(r.error)
  return r.copia.proyecto
}

const textoDe = (p: PaginaCompuesta): string => p.ops.flatMap((o) => (o.op === 'texto' ? o.glifos.map((g) => g.texto) : [])).join('')

function conLibro(p: Proyecto): Estado {
  return reducir(ESTADO_INICIAL, { tipo: 'abrir', proyecto: p, imagenes: [] })
}
const impreso = (e: Estado, cambios: Extract<Accion, { tipo: 'impreso' }>['cambios'], ahora = 0): Estado => reducir(e, { tipo: 'impreso', cambios, ahora })

describe('del libro de la app al compositor, por el camino del EPUB', () => {
  const p = libroDeLaApp()
  const prep = prepararImpreso(p, new Map(), 2026)

  it('lee lo mismo que el script lee de la carpeta: los mismos capitulos, extras y paginas', () => {
    const node = contenidoDePrueba()
    expect(prep.contenido.capitulos.map((c) => [c.numero, c.plano, c.bloques])).toEqual(node.capitulos.map((c) => [c.numero, c.plano, c.bloques]))
    expect(prep.contenido.extras.map((x) => [x.tipo, x.donde, x.plano])).toEqual(node.extras.map((x) => [x.tipo, x.donde, x.plano]))
    const f = fuentes()
    const a = componerImpreso(prep.contenido, CONFIG_IMPRESO_POR_DEFECTO, f)
    const b = componerImpreso(node, CONFIG_IMPRESO_POR_DEFECTO, f)
    expect(a.paginas.map(textoDe)).toEqual(b.paginas.map(textoDe))
  })

  it('el orden de los extras va por los ids de la app y llega al core por el nombre de su archivo', () => {
    const ded = p.extras.find((x) => x.tipo === 'dedicatoria')
    expect(ded).toBeDefined()
    // Como lo hace la interfaz: el que cambia de grupo va al final del nuevo.
    const antes = extrasDelImpreso(p)
    const movida = antes.find((e) => e.id === ded?.id)
    if (!movida) throw new Error('sin dedicatoria')
    const extras = [...antes.filter((e) => e !== movida), { ...movida, donde: 'final' as const }]
    const q: Proyecto = { ...p, impreso: { ...CONFIG_IMPRESO_POR_DEFECTO, extras } }
    const c = prepararImpreso(q, new Map(), 2026).config
    expect(c.extras?.map((e) => [e.id, e.donde])).toEqual([
      ['epigrafe.md', 'inicio'],
      [expect.stringMatching(/^inicio-.*\.md$/u), 'inicio'],
      [expect.stringMatching(/\.md$/u), 'final'],
      ['dedicatoria.md', 'final'],
    ])
    const r = componerImpreso(prepararImpreso(q, new Map(), 2026).contenido, c, fuentes())
    const dedicatoria = r.paginas.find((x) => r.piezas[x.seccion]?.clase === 'dedicatoria') as PaginaCompuesta
    expect(dedicatoria.numero).toBeGreaterThan(Math.max(...r.paginas.filter((x) => r.piezas[x.seccion]?.clase === 'capitulo').map((x) => x.numero)))
  })

  it('las imagenes llegan con sus medidas, por la clave con que las pide el compositor', () => {
    const img = { id: 'img-faro', nombreOriginal: 'faro.png', tipo: 'png' as const, bytes: 10, ancho: 1800, alto: 1200 }
    const q: Proyecto = { ...p, portada: { logo: 'img-faro' } }
    const r = prepararImpreso(q, new Map([['img-faro', img]]), 2026)
    expect(r.imagenes['logo']).toEqual({ id: 'logo', ancho: 1800, alto: 1200 })
    expect(r.idDeClave.get('logo')).toBe('img-faro')
    expect(r.contenido.portadilla).toEqual({ modo: 'logo', imagen: 'logo' })
  })
})

describe('las opciones del impreso en el modelo', () => {
  const e0 = conLibro(libroDeLaApp())

  it('un libro sin tocar no lleva `impreso` y se guarda como antes; con el, como formato 3', () => {
    expect(e0.proyecto?.impreso).toBeUndefined()
    expect(configDe(e0.proyecto as Proyecto)).toBe(CONFIG_IMPRESO_POR_DEFECTO)
    const e1 = impreso(e0, { cuerpo: 11 })
    expect(e1.proyecto?.impreso?.cuerpo).toBe(11)
    expect(versionNecesaria(e0.proyecto as Proyecto)).toBe(1)
    expect(versionNecesaria(e1.proyecto as Proyecto)).toBe(3)
  })

  it('un cambio que no cambia nada no crea `impreso` ni un paso de deshacer', () => {
    expect(impreso(e0, { cuerpo: CONFIG_IMPRESO_POR_DEFECTO.cuerpo })).toBe(e0)
  })

  it('arrastrar el deslizador es un solo paso de deshacer, y deshacer vuelve a lo de antes', () => {
    let e = impreso(e0, { cuerpo: 10.5 + 0.5 }, 1000)
    e = impreso(e, { cuerpo: 11.5 }, 1100)
    e = impreso(e, { cuerpo: 12 }, 1200)
    expect(e.pasado.length - e0.pasado.length).toBe(1)
    const atras = reducir(e, { tipo: 'deshacer' })
    expect(atras.proyecto?.impreso).toBeUndefined()
  })

  it('lo que llega fuera de rango se recorta, y cambiar de letra arrastra su cuerpo si no se habia tocado', () => {
    expect(impreso(e0, { cuerpo: 99 }).proyecto?.impreso?.cuerpo).toBe(16)
    const garamond = impreso(e0, { fuente: 'eb-garamond' }).proyecto?.impreso
    expect([garamond?.cuerpo, garamond?.interlineado]).toEqual([familia('eb-garamond').cuerpo, familia('eb-garamond').interlineado])
    const tocado = impreso(impreso(e0, { cuerpo: 11 }), { fuente: 'eb-garamond' }).proyecto?.impreso
    expect(tocado?.cuerpo).toBe(11)
  })
})

describe('las opciones del impreso se guardan y viajan en la copia', () => {
  it('IndexedDB: se guarda como formato 3 y al leerlo se normaliza', async () => {
    const db = await abrirAlmacen()
    const p = libroDeLaApp()
    await guardarProyecto(db, { ...p, impreso: { ...CONFIG_IMPRESO_POR_DEFECTO, cuerpo: 11 } }, 1000)
    const leido = await leerProyecto(db, p.id)
    expect(leido?.version).toBe(3)
    expect(leido?.impreso?.cuerpo).toBe(11)
    // Uno escrito a mano o por una version rara: se lee completo y en rango.
    await db.put('proyectos', { ...p, version: 3, modificado: 2000, impreso: { cuerpo: 90, destino: 'ingram' } } as never)
    const raro = await leerProyecto(db, p.id)
    expect(raro?.impreso).toEqual({ ...CONFIG_IMPRESO_POR_DEFECTO, cuerpo: 16, destino: 'ingram' })
    db.close()
  })

  it('la copia (.zip) las devuelve, con el orden de los extras apuntando a los extras NUEVOS', () => {
    const p = libroDeLaApp()
    const ded = p.extras.find((x) => x.tipo === 'dedicatoria')
    const extras = extrasDelImpreso(p).map((e) => (e.id === ded?.id ? { ...e, donde: 'final' as const, incluir: false } : e))
    const q: Proyecto = { ...p, impreso: { ...CONFIG_IMPRESO_POR_DEFECTO, cuerpo: 11, indice: true, extras } }
    const zip = zipDeCopia(exportar(q, new Map(), new Map()), q, new Map(), new Date('2026-11-11T12:00:00Z'))
    const r = leerCopia(archivosDeZip(zip) as Map<string, Uint8Array>, nuevoId)
    if (!r.ok) throw new Error(r.error)
    const vuelta = r.copia.proyecto
    expect(vuelta.version).toBe(3)
    expect(vuelta.impreso?.cuerpo).toBe(11)
    expect(vuelta.impreso?.indice).toBe(true)
    // Los ids son otros, pero apuntan a los mismos extras, en el mismo orden y con lo mismo.
    const tipoDe = (pp: Proyecto, id: string): string | undefined => pp.extras.find((x) => x.id === id)?.tipo
    expect(vuelta.impreso?.extras?.map((e) => [tipoDe(vuelta, e.id), e.donde, e.incluir])).toEqual(extras.map((e) => [tipoDe(q, e.id), e.donde, e.incluir]))
    expect(vuelta.impreso?.extras?.every((e) => vuelta.extras.some((x) => x.id === e.id))).toBe(true)
  })
})

describe('el motor del impreso (lo que corre en su hilo)', () => {
  const p = libroDeLaApp()
  const prep = prepararImpreso(p, new Map(), 2026)
  const bytes = (cara: string): ArrayBuffer => {
    const b = readFileSync(join(import.meta.dirname, '..', 'public', 'fuentes', 'impreso', `SourceSerif4-${cara}.ttf`))
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  }
  const pedido: PedidoComponer = {
    tipo: 'componer',
    id: 1,
    contenido: prep.contenido,
    config: prep.config,
    imagenes: prep.imagenes,
    fuente: { id: 'source-serif-4', caras: { regular: bytes('Regular'), cursiva: bytes('Italic'), negrita: bytes('Bold'), negritaCursiva: bytes('BoldItalic') } },
  }

  it('compone, y escribe el PDF de ESA composicion sin volver a componer', () => {
    const m = new MotorImpreso()
    const r = m.atender(pedido)
    if (r.tipo !== 'componer') throw new Error(r.tipo)
    const pdf = m.atender({ tipo: 'pdf', componer: pedido, pixeles: {}, titulo: 'T', autor: 'A', fecha: Date.UTC(2026, 10, 11) })
    if (pdf.tipo !== 'pdf') throw new Error(pdf.tipo === 'error' ? pdf.error : pdf.tipo)
    expect(new TextDecoder().decode(pdf.pdf.slice(0, 8))).toBe('%PDF-1.3')
    // La misma composicion, el mismo objeto: no se recompuso.
    const otra = m.atender(pedido)
    expect(otra.tipo === 'componer' && otra.impreso).toBe(r.impreso)
  })

  it('un error vuelve como error, con su id, y no rompe el hilo', () => {
    const m = new MotorImpreso()
    const roto = { ...pedido, id: 7, fuente: { id: 'rota', caras: { ...pedido.fuente.caras, regular: new ArrayBuffer(8) } } }
    const r = m.atender(roto)
    expect(r.tipo).toBe('error')
    expect(r.id).toBe(7)
    expect(m.atender(pedido).tipo).toBe('componer')
  })

  it('mientras compone, de lo que llega solo espera el ultimo', async () => {
    const pendientes: ((r: RespuestaImpreso) => void)[] = []
    const vistos: number[] = []
    const cola = new ColaDeComposicion((p) => {
      vistos.push(p.id)
      return new Promise((resolver) => pendientes.push(resolver))
    })
    const uno = cola.componer({ ...pedido, id: 1 })
    const dos = cola.componer({ ...pedido, id: 2 })
    const tres = cola.componer({ ...pedido, id: 3 })
    expect(await dos).toBeNull()
    expect(vistos).toEqual([1])
    pendientes[0]?.({ tipo: 'error', id: 1, error: 'x' })
    expect((await uno)?.id).toBe(1)
    await Promise.resolve()
    expect(vistos).toEqual([1, 3])
    pendientes[1]?.({ tipo: 'error', id: 3, error: 'x' })
    expect((await tres)?.id).toBe(3)
  })

  it('un pedido que falla no deja la cola parada: se dice el error y el siguiente sale', async () => {
    let veces = 0
    const cola = new ColaDeComposicion((p) => (veces++ === 0 ? Promise.reject(new Error('no se pudo mandar')) : Promise.resolve({ tipo: 'error', id: p.id, error: 'ok' })))
    expect(await cola.componer({ ...pedido, id: 1 })).toEqual({ tipo: 'error', id: 1, error: 'no se pudo mandar' })
    expect((await cola.componer({ ...pedido, id: 2 }))?.id).toBe(2)
  })

  it('si el hilo no acepta un pedido, se hace aqui y nadie se queda con la respuesta de otro', async () => {
    vi.resetModules()
    const mandados: unknown[] = []
    class HiloFalso {
      private oyentes: ((e: { data: unknown }) => void)[] = []
      addEventListener(tipo: string, f: (e: { data: unknown }) => void): void {
        if (tipo === 'message') this.oyentes.push(f)
      }
      postMessage(m: { tipo: string; id: number }): void {
        if (m.id === 1) throw new DOMException('ArrayBuffer detached', 'DataCloneError')
        mandados.push(m.id)
        // El hilo contesta en orden, con el id de lo que le llego.
        queueMicrotask(() => this.oyentes.forEach((f) => f({ data: { tipo: 'error', id: m.id, error: 'del hilo' } })))
      }
      terminate(): void {}
    }
    vi.stubGlobal('Worker', HiloFalso)
    try {
      const { pedirAlImpreso } = await import('../src/app/impreso/hilo')
      const roto = { ...pedido, id: 1, fuente: { id: 'no-existe', caras: pedido.fuente.caras } }
      const [uno, dos] = await Promise.all([pedirAlImpreso(roto), pedirAlImpreso({ ...pedido, id: 2 })])
      expect(mandados).toEqual([2])
      expect(uno.id).toBe(1)
      expect(dos).toEqual({ tipo: 'error', id: 2, error: 'del hilo' })
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})

describe('el lienzo pinta las mismas operaciones que el PDF', () => {
  const f = fuentes()
  const r = componerImpreso(contenidoDePrueba(), CONFIG_IMPRESO_POR_DEFECTO, f, (n) => (n === 'cap02-01' ? { id: n, ancho: 3000, alto: 2000 } : null))

  /** Un lienzo que apunta lo que se le pide. */
  function pincel() {
    const llamadas: { que: string; args: unknown[] }[] = []
    const ctx: Pincel = {
      fillStyle: '',
      setTransform: (...args: number[]) => void llamadas.push({ que: 'setTransform', args }),
      fillRect: (...args: number[]) => void llamadas.push({ que: 'fillRect', args }),
      fill: (t: Path2D) => void llamadas.push({ que: 'fill', args: [t] }),
      drawImage: (_i: CanvasImageSource, ...args: number[]) => void llamadas.push({ que: 'drawImage', args }),
    }
    return { ctx, llamadas }
  }
  const trazos = (): ((cara: Cara, g: number) => Path2D | null) => cacheDeTrazos(f, (d) => ({ d }) as unknown as Path2D)

  it('cada glifo con contorno, en su sitio: el origen de cada operacion y su avance', () => {
    const pagina = r.paginas.find((p) => p.tipo === 'texto') as PaginaCompuesta
    const { ctx, llamadas } = pincel()
    pintarPagina(ctx, pagina, r.formato.ancho, r.formato.alto, 2, { fuentes: f, trazo: trazos(), imagen: () => null })
    const conContorno = pagina.ops.reduce((s, o) => s + (o.op === 'texto' ? o.glifos.filter((g) => f[o.cara].contorno(g.id)).length : 0), 0)
    expect(llamadas.filter((l) => l.que === 'fill')).toHaveLength(conContorno)
    // El primer glifo de cada operacion de texto va a (x, y) por la escala, con la y volteada.
    const primeros = pagina.ops.flatMap((o) => (o.op === 'texto' && f[o.cara].contorno(o.glifos[0]?.id ?? 0) ? [[(o.cuerpo / f[o.cara].upm) * 2, 0, 0, -(o.cuerpo / f[o.cara].upm) * 2, o.x * 2, o.y * 2]] : []))
    const transformaciones = llamadas.filter((l) => l.que === 'setTransform').map((l) => l.args)
    for (const t of primeros) expect(transformaciones).toContainEqual(t)
    // Y el segundo glifo de una linea, un avance mas alla.
    const op = pagina.ops.find((o) => o.op === 'texto' && o.glifos.length > 2 && o.glifos.every((g) => f[o.cara].contorno(g.id)))
    if (op?.op !== 'texto') throw new Error('sin linea')
    const k = op.cuerpo / f[op.cara].upm
    expect(transformaciones).toContainEqual([k * 2, 0, 0, -k * 2, (op.x + (op.glifos[0]?.avance ?? 0) * k) * 2, op.y * 2])
  })

  it('la imagen en su caja; si todavia no esta, un recuadro gris del mismo tamaño', () => {
    const pagina = r.paginas.find((p) => p.tipo === 'ilustracion') as PaginaCompuesta
    const op = pagina.ops[0]
    if (op?.op !== 'imagen') throw new Error('no es una imagen')
    const con = pincel()
    pintarPagina(con.ctx, pagina, r.formato.ancho, r.formato.alto, 1, { fuentes: f, trazo: trazos(), imagen: () => ({}) as CanvasImageSource })
    expect(con.llamadas.find((l) => l.que === 'drawImage')?.args).toEqual([op.x, op.y, op.ancho, op.alto])
    const sin = pincel()
    pintarPagina(sin.ctx, pagina, r.formato.ancho, r.formato.alto, 1, { fuentes: f, trazo: trazos(), imagen: () => null })
    expect(sin.llamadas.filter((l) => l.que === 'fillRect').map((l) => l.args)).toContainEqual([op.x, op.y, op.ancho, op.alto])
  })

  it('cada trazo se hace una vez y se reutiliza', () => {
    let hechos = 0
    const t = cacheDeTrazos(f, (d) => {
      hechos++
      return { d } as unknown as Path2D
    })
    const g = f.regular.glifo(0x61)
    expect(t('regular', g)).toBe(t('regular', g))
    expect(t('regular', f.regular.glifo(0x20))).toBeNull()
    expect(hechos).toBe(1)
  })
})

describe('las imagenes, en gris y a 300 ppi', () => {
  it('lo transparente se aplana sobre blanco, y el color pasa a gris con la luma de BT.601', () => {
    const rgba = new Uint8Array([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 128, 255, 255, 255, 255])
    expect([...aGris(rgba, 2, 2).pixeles]).toEqual([255, 76, 127, 255])
  })

  it('reduce hasta 300 ppi al tamaño impreso y nunca amplia', () => {
    // 4,5 in de ancho a 300 ppi son 1350 pixeles.
    expect(pixelesDestino({ ancho: 1800, alto: 1200 }, { ancho: 4.5 * 72, alto: 3 * 72 })).toEqual({ ancho: 1350, alto: 900 })
    expect(pixelesDestino({ ancho: 600, alto: 400 }, { ancho: 4.5 * 72, alto: 3 * 72 })).toEqual({ ancho: 600, alto: 400 })
  })

  it('una imagen que sale en dos sitios se prepara para el mas grande', () => {
    const pagina = (ancho: number): PaginaCompuesta => ({ numero: 1, folio: null, tipo: 'ilustracion', seccion: 0, renglones: [], ops: [{ op: 'imagen', id: 'a', x: 0, y: 0, ancho, alto: ancho / 2 }] })
    expect(tamanosImpresos([pagina(100), pagina(300), pagina(200)]).get('a')).toEqual({ ancho: 300, alto: 150 })
  })
})

describe('los avisos del impreso, agrupados', () => {
  it('uno por clase con todos sus casos, sin repetir, y los avisos antes que las notas', () => {
    const avisos: AvisoImpreso[] = [
      { codigo: 'sinIsbn' },
      { codigo: 'resolucionBaja', nombre: 'a', ppi: 120 },
      { codigo: 'margenSubido', lado: 'interior', elegido: 6, usado: 12.7, porque: 'medianil' },
      { codigo: 'resolucionBaja', nombre: 'b', ppi: 200 },
      { codigo: 'resolucionBaja', nombre: 'a', ppi: 120 },
    ]
    expect(agruparAvisos(avisos).map((g) => [g.codigo, g.nivel, g.casos.length])).toEqual([
      ['resolucionBaja', 'aviso', 2],
      ['sinIsbn', 'nota', 1],
      ['margenSubido', 'nota', 1],
    ])
  })
})
