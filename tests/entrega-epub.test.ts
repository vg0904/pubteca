/**
 * Los dos EPUB con imagenes DISTINTAS, de punta a punta.
 *
 * Es lo unico en Pubteca donde las dos tiendas dejan de salir del mismo
 * proyecto: cuando el autor pide comprimir para Kindle, el motor corre dos
 * veces y de cada vuelta se queda un libro. Eso puede fallar de una forma que
 * no se ve mirando ninguna de las dos piezas por separado: que el EPUB de
 * Kindle lleve un `<img src="...png">` apuntando a un archivo que entro como
 * `.jpg`, o que la portada de Apple Books salga comprimida.
 *
 * Asi que aqui se genera de verdad — el libro de prueba, el modelo, el motor
 * tal como corre en su hilo — con un codificador de mentira en lugar del
 * lienzo, que es lo unico que pide un navegador. Se abren los dos EPUB con el
 * mismo lector que usa la vista previa y se comprueba lo que recibe cada tienda.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { leerCopia } from '../src/app/abrir-copia'
import { generarLibros, type Generado } from '../src/app/generar'
import type { Codificador } from '../src/app/entrega'
import type { Imagen, Proyecto } from '../src/app/modelo'
import { Repositorio } from '../src/app/repositorio'
import { abrirEpub, resolver } from '../src/app/vista-previa'

const LIBRO = join(import.meta.dirname, 'fixtures', 'libro-prueba')
const AHORA = new Date('2026-03-01T09:30:00Z')

function carpeta(raiz: string): Map<string, Uint8Array> {
  const salida = new Map<string, Uint8Array>()
  const recorrer = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const ruta = join(dir, e)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else salida.set(relative(raiz, ruta).split('\\').join('/'), new Uint8Array(readFileSync(ruta)))
    }
  }
  recorrer(raiz)
  return salida
}

/**
 * Un codificador de mentira: no hay lienzo en node. Devuelve unos bytes que
 * empiezan por la firma de un JPEG, para que el motor los reconozca como tal al
 * volver a inspeccionarlos (es lo que decide el `media-type` del manifiesto).
 */
/** Unos bytes que empiezan como un JPEG de esas medidas: SOI, APP0 «JFIF» y un SOF0. */
function falsoJpeg(ancho: number, alto: number, n = 64): Uint8Array {
  const bytes = new Uint8Array(n)
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00], 0)
  bytes.set([0xff, 0xc0, 0x00, 0x11, 0x08, (alto >> 8) & 0xff, alto & 0xff, (ancho >> 8) & 0xff, ancho & 0xff, 0x03], 11)
  return bytes
}

const falso: Codificador = (origen, _imagen, ajuste) => {
  const n = Math.max(32, Math.round(origen.length / 4))
  const bytes = new Uint8Array(n)
  // SOI + APP0 «JFIF», y un SOF0 con las medidas: lo que lee la inspeccion.
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00], 0)
  const alto = ajuste.alto
  const ancho = ajuste.ancho
  bytes.set(
    [0xff, 0xc0, 0x00, 0x11, 0x08, (alto >> 8) & 0xff, alto & 0xff, (ancho >> 8) & 0xff, ancho & 0xff, 0x03],
    11,
  )
  return Promise.resolve({ bytes, ancho, alto, tipo: 'jpeg' })
}

/** El libro de prueba, abierto en la app, con su repositorio en memoria. */
async function libroDePrueba(): Promise<{ proyecto: Proyecto; imagenes: Map<string, Imagen>; repo: Repositorio }> {
  let n = 0
  const r = leerCopia(carpeta(LIBRO), (p) => `${p}-${++n}`)
  if (!r.ok) throw new Error(r.error)
  // Sin IndexedDB: el repositorio funciona en memoria, que es lo que hace en
  // una ventana privada de Safari.
  const repo = new Repositorio(null, r.copia.proyecto.id)
  const imagenes = new Map<string, Imagen>()
  for (const i of r.copia.imagenes) {
    if (i.info.tipo === null) continue
    const img = await repo.anadir(i.id, i.nombreOriginal, new Blob([i.bytes as Uint8Array<ArrayBuffer>]), i.info, i.info.tipo)
    imagenes.set(i.id, img)
  }
  return { proyecto: r.copia.proyecto, imagenes, repo }
}

function epub(g: Generado, tienda: 'Kindle' | 'AppleBooks') {
  const r = g.motor.resultados.find((x) => x.tienda === tienda)
  if (!r) throw new Error(`no salio el EPUB de ${tienda}`)
  return abrirEpub(r.segmentos)
}

/**
 * Los `src` de las imagenes de todas las paginas, ya resueltos a rutas del zip.
 * Se usa el mismo `resolver` que la vista previa.
 */
function referencias(archivos: ReadonlyMap<string, Uint8Array>): string[] {
  const salida: string[] = []
  const texto = new TextDecoder('utf-8')
  for (const [ruta, bytes] of archivos) {
    if (!ruta.endsWith('.xhtml')) continue
    for (const m of texto.decode(bytes).matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gu)) {
      salida.push(resolver(ruta, m[1] as string))
    }
  }
  return salida
}

/** Las imagenes que de verdad entraron al paquete, por su nombre. */
const imagenesDe = (archivos: ReadonlyMap<string, Uint8Array>): string[] =>
  [...archivos.keys()].filter((r) => r.startsWith('OEBPS/imagenes/')).sort()

describe('sin comprimir, los dos EPUB llevan las mismas imagenes', () => {
  it('las imagenes de las dos tiendas son las mismas, byte a byte', async () => {
    const { proyecto, imagenes, repo } = await libroDePrueba()
    const g = await generarLibros(proyecto, imagenes, repo, AHORA, falso)
    expect(g.kindle).toBeNull()
    const k = epub(g, 'Kindle')
    const a = epub(g, 'AppleBooks')
    for (const ruta of imagenesDe(k.archivos)) {
      expect(k.archivos.get(ruta), ruta).toEqual(a.archivos.get(ruta))
    }
    // Y nada se convirtio a JPEG por su cuenta.
    expect(imagenesDe(k.archivos).filter((r) => r.endsWith('.jpg'))).toEqual([])
  })
})

describe('comprimiendo para Kindle', () => {
  const comprimiendo = async (): Promise<Generado> => {
    const { proyecto, imagenes, repo } = await libroDePrueba()
    return generarLibros(
      { ...proyecto, kindle: { comprimir: true, calidad: 70, grises: false } },
      imagenes,
      repo,
      AHORA,
      falso,
    )
  }

  it('Kindle recibe JPEG y Apple Books se queda con los originales', async () => {
    const g = await comprimiendo()
    const k = imagenesDe(epub(g, 'Kindle').archivos)
    const a = imagenesDe(epub(g, 'AppleBooks').archivos)
    expect(k.length).toBeGreaterThan(0)
    expect(k.every((r) => r.endsWith('.jpg'))).toBe(true)
    // El libro de prueba tiene PNG: Apple Books los conserva.
    expect(a.some((r) => r.endsWith('.png'))).toBe(true)
  })

  it('el EPUB de Kindle pesa menos', async () => {
    const g = await comprimiendo()
    const k = g.motor.resultados.find((x) => x.tienda === 'Kindle')
    const sin = await (async () => {
      const { proyecto, imagenes, repo } = await libroDePrueba()
      const r = await generarLibros(proyecto, imagenes, repo, AHORA, falso)
      return r.motor.resultados.find((x) => x.tienda === 'Kindle')
    })()
    expect(k?.tamano).toBeLessThan(sin?.tamano ?? 0)
  })

  /**
   * El fallo que no se ve mirando una pieza sola: el nombre del archivo cambia
   * de extension al comprimir, asi que las paginas de Kindle tienen que
   * referenciar el `.jpg`. Si una se quedara apuntando al `.png`, EPUBCheck
   * rechaza el libro y el autor no se entera hasta KDP.
   */
  it('ninguna pagina de Kindle apunta a un archivo que no entro', async () => {
    const g = await comprimiendo()
    for (const tienda of ['Kindle', 'AppleBooks'] as const) {
      const { archivos } = epub(g, tienda)
      const presentes = new Set(archivos.keys())
      const faltan = referencias(archivos).filter((r) => !presentes.has(r))
      expect(faltan, tienda).toEqual([])
    }
  })

  it('el manifiesto de Kindle declara image/jpeg', async () => {
    const g = await comprimiendo()
    const { archivos } = epub(g, 'Kindle')
    const opf = new TextDecoder('utf-8').decode(archivos.get('OEBPS/content.opf') as Uint8Array)
    expect(opf).toContain('media-type="image/jpeg"')
    expect(opf).not.toContain('media-type="image/png"')
  })

  it('el reporte y la revision hablan de las imagenes que subio el autor', async () => {
    const g = await comprimiendo()
    // El motor inspecciona de nuevo los bytes al construir. Las notas de peso y
    // de proporcion salen de la PRIMERA vuelta, la de los originales: son las
    // imagenes del autor las que tiene que arreglar, no las copias de Kindle.
    const sin = await (async () => {
      const { proyecto, imagenes, repo } = await libroDePrueba()
      return generarLibros(proyecto, imagenes, repo, AHORA, falso)
    })()
    expect(g.motor.diagnosticos.avisos).toEqual(sin.motor.diagnosticos.avisos)
    expect(g.motor.diagnosticos.notas).toEqual(sin.motor.diagnosticos.notas)
    expect(g.motor.reporte).toBe(sin.motor.reporte)
  })

  it('se dice lo que pesaban y lo que pesan', async () => {
    const g = await comprimiendo()
    expect(g.kindle).not.toBeNull()
    expect(g.kindle?.ahora).toBeLessThan(g.kindle?.antes ?? 0)
  })

  it('las dos vueltas dan el mismo identificador: es el mismo libro', async () => {
    const g = await comprimiendo()
    const { proyecto, imagenes, repo } = await libroDePrueba()
    const sin = await generarLibros(proyecto, imagenes, repo, AHORA, falso)
    expect(g.motor.uid).toBe(sin.motor.uid)
  })

  it('el orden de lectura es el mismo en las dos tiendas que sin comprimir', async () => {
    const g = await comprimiendo()
    const { proyecto, imagenes, repo } = await libroDePrueba()
    const sin = await generarLibros(proyecto, imagenes, repo, AHORA, falso)
    expect(epub(g, 'Kindle').paginas.map((p) => p.ruta)).toEqual(epub(sin, 'Kindle').paginas.map((p) => p.ruta))
    expect(epub(g, 'AppleBooks').paginas.map((p) => p.ruta)).toEqual(epub(sin, 'AppleBooks').paginas.map((p) => p.ruta))
  })
})

describe('la portada con su texto en el EPUB (decision 12)', () => {
  // La portada compuesta, de mentira: sin lienzo en node. Un JPEG que la
  // inspeccion del motor reconoce, con las medidas de la de verdad.
  const compuesta = falsoJpeg(1707, 2560)
  const conTexto = (): Promise<{ imagen: Imagen; bytes: Uint8Array }> =>
    Promise.resolve({ imagen: { id: 'portada-del-ebook', nombreOriginal: 'portada-del-ebook.jpg', tipo: 'jpeg', bytes: compuesta.length, ancho: 1707, alto: 2560, alfa: false }, bytes: compuesta })
  const cubierta = (enEpub: boolean) => ({ estilo: 'papiro', titulo: null, autor: true, sinopsis: true, codigo: 'generar', lomo: 'descendente', lomoManual: 0, encuadre: { x: 0.5, y: 0.5 }, fondo: '', tintas: {}, mover: {}, enEpub }) as const

  it('Apple Books lleva la portada compuesta en vez del dibujo limpio, y se dice; Kindle, como siempre, ninguna', async () => {
    const { proyecto, imagenes, repo } = await libroDePrueba()
    const g = await generarLibros({ ...proyecto, cubierta: cubierta(true) }, imagenes, repo, AHORA, falso, conTexto)
    expect(g.portadaConTexto).toBe('puesta')
    const a = epub(g, 'AppleBooks').archivos
    expect(a.get('OEBPS/imagenes/portada.jpg')).toEqual(compuesta)
    expect(a.has('OEBPS/imagenes/portada.png')).toBe(false)
    // KDP pone la portada que se sube aparte: el EPUB de Kindle no lleva ninguna dentro.
    expect(imagenesDe(epub(g, 'Kindle').archivos).filter((r) => /\/portada\./u.test(r))).toEqual([])
  })

  it('el proyecto no cambia: el dibujo limpio sigue en su papel', async () => {
    const { proyecto, imagenes, repo } = await libroDePrueba()
    const p = { ...proyecto, cubierta: cubierta(true) }
    const antes = JSON.stringify(p)
    await generarLibros(p, imagenes, repo, AHORA, falso, conTexto)
    expect(JSON.stringify(p)).toBe(antes)
    expect(imagenes.has('portada-del-ebook')).toBe(false)
  })

  it('comprimiendo para Kindle, tambien', async () => {
    const { proyecto, imagenes, repo } = await libroDePrueba()
    const g = await generarLibros({ ...proyecto, cubierta: cubierta(true), kindle: { comprimir: true, calidad: 70, grises: false } }, imagenes, repo, AHORA, falso, conTexto)
    expect(epub(g, 'AppleBooks').archivos.get('OEBPS/imagenes/portada.jpg')).toEqual(compuesta)
    expect(imagenesDe(epub(g, 'Kindle').archivos).filter((r) => /\/portada\./u.test(r))).toEqual([])
  })

  it('si no se puede componer, van con el dibujo limpio y se dice', async () => {
    const { proyecto, imagenes, repo } = await libroDePrueba()
    const g = await generarLibros({ ...proyecto, cubierta: cubierta(true) }, imagenes, repo, AHORA, falso, () => Promise.reject(new Error('sin letras')))
    expect(g.portadaConTexto).toBe('fallo')
    expect(epub(g, 'AppleBooks').archivos.has('OEBPS/imagenes/portada.png')).toBe(true)
  })

  it('sin pedirla, ni se compone: los EPUB son los de siempre', async () => {
    const { proyecto, imagenes, repo } = await libroDePrueba()
    let llamadas = 0
    const contar = (): Promise<{ imagen: Imagen; bytes: Uint8Array }> => {
      llamadas++
      return conTexto()
    }
    const sin = await generarLibros({ ...proyecto, cubierta: cubierta(false) }, imagenes, repo, AHORA, falso, contar)
    const nada = await generarLibros(proyecto, imagenes, repo, AHORA, falso, contar)
    expect(llamadas).toBe(0)
    expect(sin.portadaConTexto).toBeNull()
    for (const tienda of ['Kindle', 'AppleBooks'] as const) expect(epub(sin, tienda).archivos).toEqual(epub(nada, tienda).archivos)
  })
})
