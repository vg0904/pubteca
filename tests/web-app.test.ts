import 'fake-indexeddb/auto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { archivosDeZip, leerCopia } from '../src/app/abrir-copia'
import { abrirAlmacen, guardarProyecto, leerProyecto } from '../src/app/almacen'
import { zipDeCopia } from '../src/app/copia'
import type { Codificador } from '../src/app/entrega'
import { ESTADO_INICIAL, reducir, type Estado } from '../src/app/estado'
import { exportar } from '../src/app/exportar'
import { versionNecesaria, type Imagen, type Proyecto } from '../src/app/modelo'
import type { Repositorio } from '../src/app/repositorio'
import { generarWeb } from '../src/app/web/generar'
import { ajusteWeb, idsParaLaWeb, LADO_LARGO_WEB, paraLaWeb } from '../src/app/web/imagenes'
import { capitulosPublicados, configParaElCore, configWeb, estadoDeEnlace, partesElegibles } from '../src/app/web/preparar'
import { CONFIG_WEB_POR_DEFECTO, type ConfigWeb } from '../src/core/web/config'

// El libro web en la app: las opciones en el modelo (deshacer, guardado,
// copia), lo que se le pasa al core, las imagenes aligeradas y la generacion
// entera, con un codificador de mentira en vez del lienzo.

const FIXTURE = join(import.meta.dirname, 'fixtures', 'libro-prueba')
let n = 0
const nuevoId = (prefijo: string): string => `${prefijo}-${++n}`

/** El libro de prueba abierto en la app, como si se soltara su carpeta, con sus imagenes. */
function libroDeLaApp(): { p: Proyecto; imagenes: Map<string, Imagen>; bytes: Map<string, Uint8Array> } {
  const archivos = new Map<string, Uint8Array>([['libro.txt', new Uint8Array(readFileSync(join(FIXTURE, 'libro.txt')))]])
  for (const carpeta of ['capitulos', 'extras', 'ilustraciones', 'portada']) {
    for (const nombre of readdirSync(join(FIXTURE, carpeta))) archivos.set(`${carpeta}/${nombre}`, new Uint8Array(readFileSync(join(FIXTURE, carpeta, nombre))))
  }
  const r = leerCopia(archivos, nuevoId)
  if (!r.ok) throw new Error(r.error)
  const imagenes = new Map<string, Imagen>()
  const bytes = new Map<string, Uint8Array>()
  for (const i of r.copia.imagenes) {
    imagenes.set(i.id, { id: i.id, nombreOriginal: i.nombreOriginal, tipo: i.info.tipo ?? 'png', bytes: i.bytes.length, ancho: i.info.ancho, alto: i.info.alto, alfa: i.info.alfa })
    bytes.set(i.id, i.bytes)
  }
  return { p: r.copia.proyecto, imagenes, bytes }
}

const conLibro = (p: Proyecto): Estado => reducir(ESTADO_INICIAL, { tipo: 'abrir', proyecto: p, imagenes: [] })
const web = (e: Estado, cambios: Partial<ConfigWeb>, ahora = 0): Estado => reducir(e, { tipo: 'web', cambios, ahora })

describe('las opciones del libro web en el modelo', () => {
  const { p } = libroDeLaApp()
  const e0 = conLibro(p)

  it('un libro sin tocar no lleva `web` y se guarda como antes; con el, como formato 8', () => {
    expect(e0.proyecto?.web).toBeUndefined()
    expect(versionNecesaria(p)).toBeLessThan(7)
    const e1 = web(e0, { omitidos: [p.capitulos[3]?.id as string] })
    expect(e1.proyecto?.web?.omitidos).toEqual([p.capitulos[3]?.id])
    expect(versionNecesaria(e1.proyecto as Proyecto)).toBe(8)
  })

  it('un cambio que no cambia nada no crea `web` ni un paso de deshacer', () => {
    expect(web(e0, { aligerar: true })).toBe(e0)
    expect(web(e0, { omitidos: [] })).toBe(e0)
  })

  it('escribir un enlace es un solo paso de deshacer, y deshacer vuelve a no tener `web`', () => {
    let e = web(e0, { enlaces: [{ etiqueta: '', url: 'h' }] }, 1000)
    e = web(e, { enlaces: [{ etiqueta: '', url: 'ht' }] }, 1100)
    e = web(e, { enlaces: [{ etiqueta: '', url: 'htt' }] }, 1200)
    expect(e.proyecto?.web?.enlaces).toEqual([{ etiqueta: '', url: 'htt' }])
    const atras = reducir(e, { tipo: 'deshacer' })
    expect(atras.proyecto?.web).toBeUndefined()
  })

  it('lo que llega raro se normaliza al entrar', () => {
    const e = web(e0, { enlaces: [{ etiqueta: 'A\nB', url: 'x.com' }] })
    expect(e.proyecto?.web?.enlaces).toEqual([{ etiqueta: 'A B', url: 'x.com' }])
    expect(web(e0, { letra: 'papyrus' })).toBe(e0)
  })

  it('el modo y la letra se eligen, y cada cambio se deshace', () => {
    const e1 = web(e0, { modo: 'paginas' }, 1000)
    const e2 = web(e1, { letra: 'alegreya' }, 1100)
    expect(e2.proyecto?.web).toMatchObject({ modo: 'paginas', letra: 'alegreya' })
    expect(reducir(e2, { tipo: 'deshacer' }).proyecto?.web).toMatchObject({ modo: 'paginas', letra: 'literata' })
  })
})

describe('las opciones se guardan y viajan en la copia', () => {
  it('IndexedDB: se guardan como formato 8 y al leerlas se normalizan', async () => {
    const db = await abrirAlmacen()
    const { p } = libroDeLaApp()
    const config: ConfigWeb = { ...CONFIG_WEB_POR_DEFECTO, omitidos: [p.capitulos[2]?.id as string], enlaces: [{ etiqueta: 'Amazon', url: 'amazon.com' }], aligerar: false }
    await guardarProyecto(db, { ...p, web: config }, 1000)
    const leido = await leerProyecto(db, p.id)
    expect(leido?.version).toBe(8)
    expect(leido?.web).toEqual(config)
    await db.put('proyectos', { ...p, version: 8, modificado: 2000, web: { omitidos: 'no', aligerar: 'quizá' } } as never)
    expect((await leerProyecto(db, p.id))?.web).toEqual(CONFIG_WEB_POR_DEFECTO)
    db.close()
  })

  it('la copia (.zip) las devuelve, con lo omitido apuntando a los capitulos y extras NUEVOS', () => {
    const { p } = libroDeLaApp()
    const cap = p.capitulos[2]
    const extra = p.extras.find((x) => x.tipo === 'conTitulo' && x.donde === 'final')
    if (!cap || !extra) throw new Error('falta el capitulo o el extra del fixture')
    const q: Proyecto = { ...p, web: { ...CONFIG_WEB_POR_DEFECTO, omitidos: [cap.id, extra.id, 'ya-no-existe'], enlaces: [{ etiqueta: 'Tienda', url: 'https://x.org' }], aligerar: false } }
    const zip = zipDeCopia(exportar(q, new Map(), new Map()), q, new Map(), new Date('2026-11-16T12:00:00Z'))
    const r = leerCopia(archivosDeZip(zip) as Map<string, Uint8Array>, nuevoId)
    if (!r.ok) throw new Error(r.error)
    const vuelta = r.copia.proyecto
    expect(vuelta.version).toBe(8)
    expect(vuelta.web?.enlaces).toEqual(q.web?.enlaces)
    expect(vuelta.web?.aligerar).toBe(false)
    // Otros ids, los mismos capitulos: el tercero y el extra del final. El que no existia se suelta.
    expect(vuelta.web?.omitidos).toHaveLength(2)
    expect(vuelta.web?.omitidos).toContain(vuelta.capitulos[2]?.id)
    expect(vuelta.web?.omitidos).toContain(vuelta.extras.find((x) => x.tipo === 'conTitulo' && x.donde === 'final')?.id)
  })
})

describe('lo que se elige y lo que llega al core', () => {
  const { p } = libroDeLaApp()

  it('las partes elegibles van en el orden de lectura: extras del principio, capitulos, extras del final', () => {
    const partes = partesElegibles(p)
    expect(partes.map((x) => x.clase)).toEqual(['extra', 'extra', 'capitulo', 'capitulo', 'capitulo', 'capitulo', 'extra'])
    expect(partes.every((x) => x.publicada)).toBe(true)
    expect(partes[2]?.nombre).toBe('Capítulo 1: La luz que no tocaba')
  })

  it('lo omitido llega al core por el nombre de su archivo, y lo que ya no existe no llega', () => {
    const cap = p.capitulos[1]
    const extra = p.extras.find((x) => x.tipo === 'dedicatoria')
    const q: Proyecto = { ...p, web: { ...CONFIG_WEB_POR_DEFECTO, omitidos: [cap?.id as string, extra?.id as string, 'borrado'] } }
    expect(configParaElCore(q, exportar(q, new Map(), new Map())).omitidos).toEqual(['capitulos/cap02.md', 'extras/dedicatoria.md'])
    expect(capitulosPublicados(q)).toEqual({ publicados: 3, total: 4 })
    expect(partesElegibles(q).filter((x) => !x.publicada).map((x) => x.id)).toEqual([extra?.id, cap?.id])
  })

  it('un enlace se dice vacio, bien o mal', () => {
    expect(estadoDeEnlace({ etiqueta: 'a', url: '  ' })).toBe('vacio')
    expect(estadoDeEnlace({ etiqueta: 'a', url: 'amazon.com/dp/1' })).toBe('bien')
    expect(estadoDeEnlace({ etiqueta: 'a', url: 'javascript:alert(1)' })).toBe('mal')
  })
})

describe('las imagenes para la web', () => {
  const img = (x: Partial<Imagen>): Imagen => ({ id: 'i', nombreOriginal: 'i.png', tipo: 'png', bytes: 1000, ancho: 1000, alto: 1500, ...x })

  it('lo grande se encoge a 1600 de lado largo; lo opaco va a JPEG; lo transparente sigue en PNG con su alfa', () => {
    expect(ajusteWeb(img({ ancho: 3200, alto: 4800 }))).toMatchObject({ ancho: 1067, alto: LADO_LARGO_WEB, formato: 'jpeg', conservarAlfa: false })
    expect(ajusteWeb(img({ ancho: 4000, alto: 2000, alfa: true }))).toMatchObject({ ancho: LADO_LARGO_WEB, alto: 800, formato: 'png', conservarAlfa: true })
    expect(ajusteWeb(img({}))).toMatchObject({ ancho: 1000, alto: 1500, formato: 'jpeg' })
  })

  it('lo que ya cabe y es JPEG, o transparente, no se toca', () => {
    expect(ajusteWeb(img({ tipo: 'jpeg' }))).toBeNull()
    expect(ajusteWeb(img({ alfa: true }))).toBeNull()
  })

  it('solo se codifica lo que viaja: ni el logo, ni los dibujos de un capitulo omitido', () => {
    const { p } = libroDeLaApp()
    const cap = p.capitulos[1]
    const todos = idsParaLaWeb(p, CONFIG_WEB_POR_DEFECTO)
    expect(todos.has(p.portada.portada as string)).toBe(true)
    expect(todos.has(p.portada.logo as string)).toBe(false)
    const sin = idsParaLaWeb(p, { ...CONFIG_WEB_POR_DEFECTO, omitidos: [cap?.id as string] })
    const suyos = cap?.bloques.flatMap((b) => (b.tipo === 'ilustracion' ? [b.imagenId] : [])) ?? []
    expect(suyos.length).toBeGreaterThan(0)
    for (const id of suyos) expect(sin.has(id)).toBe(false)
  })

  it('lo que sale mas gordo, o falla, se queda como estaba', async () => {
    const { p, imagenes, bytes } = libroDeLaApp()
    const portada = p.portada.portada as string
    const codificar: Codificador = async (origen, _i, a) => {
      if (a.formato === 'png') throw new Error('no')
      return { bytes: new Uint8Array(Math.floor(origen.length / 4)), ancho: a.ancho, alto: a.alto, tipo: 'jpeg' }
    }
    const r = await paraLaWeb(p, CONFIG_WEB_POR_DEFECTO, imagenes, bytes, codificar)
    expect(r.ahora).toBeLessThan(r.antes)
    const ante = imagenes.get(portada)
    if (ante && !ante.alfa) expect(r.imagenes.get(portada)?.tipo).toBe('jpeg')
    // Una transparente que falla al codificar conserva sus bytes.
    for (const [id, i] of imagenes) if (i.alfa) expect(r.bytes.get(id)).toBe(bytes.get(id))
    const gordo: Codificador = async (origen, _i, a) => ({ bytes: new Uint8Array(origen.length + 1), ancho: a.ancho, alto: a.alto, tipo: 'jpeg' })
    const igual = await paraLaWeb(p, CONFIG_WEB_POR_DEFECTO, imagenes, bytes, gordo)
    expect(igual.ahora).toBe(igual.antes)
    for (const [id, b] of bytes) expect(igual.bytes.get(id)).toBe(b)
  })
})

describe('generar el libro web desde la app', () => {
  const recursos = async (): Promise<{ lector: string; leeme: string }> => ({ lector: '/* lector */', leeme: '# LEEME' })
  const DIR_LETRAS = join(import.meta.dirname, '..', 'public', 'fuentes', 'impreso')
  const letras = async (): Promise<Map<string, Uint8Array>> => new Map(readdirSync(DIR_LETRAS).map((x) => [x, new Uint8Array(readFileSync(join(DIR_LETRAS, x)))]))
  const sinLetras = async (): Promise<Map<string, Uint8Array>> => new Map()
  const repo = (bytes: Map<string, Uint8Array>): Repositorio => ({ bytes: async (id: string) => bytes.get(id), medios: () => new Map() }) as unknown as Repositorio

  it('del libro de la app a un .zip con lo publicado, por el mismo exportar() que los EPUB', async () => {
    const { p, imagenes, bytes } = libroDeLaApp()
    const q: Proyecto = { ...p, web: { ...CONFIG_WEB_POR_DEFECTO, omitidos: [p.capitulos[3]?.id as string], enlaces: [{ etiqueta: 'Amazon', url: 'amazon.com' }], aligerar: false } }
    const g = await generarWeb(q, imagenes, repo(bytes), new Date('2026-11-16T12:00:00Z'), 'es', undefined, recursos, sinLetras)
    const r = g.respuesta
    expect(r.bloqueado).toBeNull()
    expect(r.muestra).toBe(true)
    expect(g.imagenes).toBeNull()
    const dentro = unzipSync(r.bytes as Uint8Array)
    expect(new TextDecoder().decode(dentro['lector.js'])).toBe('/* lector */')
    expect(new TextDecoder().decode(dentro['LEEME.md'])).toBe('# LEEME')
    const manifiesto = JSON.parse(new TextDecoder().decode(dentro['libro/libro.json']))
    expect(manifiesto.partes.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(['cap01', 'cap02', 'cap03', 'sigue-leyendo']))
    expect(manifiesto.partes.some((x: { id: string }) => x.id === 'cap04')).toBe(false)
    expect(r.partes).toBe(manifiesto.partes.length)
  })

  it('con aligerar puesto, las imagenes pasan por el codificador y se dice lo que se ahorro', async () => {
    const { p, imagenes, bytes } = libroDeLaApp()
    const codificar: Codificador = async (origen, _i, a) => ({ bytes: origen.subarray(0, Math.floor(origen.length / 2)), ancho: a.ancho, alto: a.alto, tipo: a.formato })
    const g = await generarWeb(p, imagenes, repo(bytes), new Date('2026-11-16T12:00:00Z'), 'en', codificar, recursos, sinLetras)
    expect(configWeb(p).aligerar).toBe(true)
    expect(g.imagenes).not.toBeNull()
    expect(g.imagenes?.ahora).toBeLessThan(g.imagenes?.antes as number)
  })

  it('el modo y la letra que eligio el autor llegan al libro, con las letras dentro', async () => {
    const { p, imagenes, bytes } = libroDeLaApp()
    const q: Proyecto = { ...p, web: { ...CONFIG_WEB_POR_DEFECTO, aligerar: false, modo: 'paginas', letra: 'crimson-pro' } }
    const g = await generarWeb(q, imagenes, repo(bytes), new Date('2026-11-16T12:00:00Z'), 'es', undefined, recursos, letras)
    expect(g.respuesta.letras).toBe(6)
    const dentro = unzipSync(g.respuesta.bytes as Uint8Array)
    const manifiesto = JSON.parse(new TextDecoder().decode(dentro['libro/libro.json']))
    expect(manifiesto.lectura).toEqual({ modo: 'paginas', letra: 'crimson-pro' })
    expect(Object.keys(dentro).filter((x) => x.endsWith('.woff'))).toHaveLength(24)
  })

  it('sin letras (sin conexion) sale igual, con la del aparato, y se dice', async () => {
    const { p, imagenes, bytes } = libroDeLaApp()
    const g = await generarWeb({ ...p, web: { ...CONFIG_WEB_POR_DEFECTO, aligerar: false } }, imagenes, repo(bytes), new Date('2026-11-16T12:00:00Z'), 'es', undefined, recursos, sinLetras)
    expect(g.respuesta.bloqueado).toBeNull()
    expect(g.respuesta.letras).toBe(0)
    const manifiesto = JSON.parse(new TextDecoder().decode(unzipSync(g.respuesta.bytes as Uint8Array)['libro/libro.json']))
    expect(manifiesto.lectura.letra).toBe('sistema')
  })
})
