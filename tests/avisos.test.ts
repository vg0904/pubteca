import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { construir } from '../src/core/construir'
import { Diagnosticos } from '../src/core/mensajes'
import { agrupar, cuentas, porTienda, tiendasDe, TIENDAS, type ClaveGrupo } from '../src/app/avisos'
import { exportar } from '../src/app/exportar'
import {
  DATOS_POR_DEFECTO,
  VERSION_PROYECTO,
  type Bloque,
  type Imagen,
  type Proyecto,
} from '../src/app/modelo'
import {
  bloquea,
  cambioDeIdentidad,
  etiquetaReconocida,
  nombresLegibles,
  revisar,
} from '../src/app/revision'
import { identificador } from '../src/core/identificador'

/**
 * Los avisos AGRUPADOS. Treinta ilustraciones de Procreate daban una pared de
 * mensajes, y esa pared es la principal causa de abandono. Estos tests miden
 * la pared con un libro de verdad pasado por el motor.
 */

const IMAGENES = join(import.meta.dirname, 'fixtures', 'imagenes')
const leer = (nombre: string): Uint8Array => new Uint8Array(readFileSync(join(IMAGENES, nombre)))

/** Un libro con N ilustraciones: la mitad con transparencia y la otra mitad en P3. */
function libroIlustrado(n: number): { p: Proyecto; imagenes: Map<string, Imagen>; bytes: Map<string, Uint8Array> } {
  const imagenes = new Map<string, Imagen>()
  const bytes = new Map<string, Uint8Array>()
  const bloques: Bloque[] = [{ id: 'b0', tipo: 'parrafo', tramos: [{ texto: 'Había una vez.', marcas: [] }] }]
  for (let i = 0; i < n; i++) {
    const id = `img-${i}`
    const archivo = i % 2 === 0 ? 'alfa.png' : 'p3-perfil.png'
    const datos = leer(archivo)
    bytes.set(id, datos)
    imagenes.set(id, { id, nombreOriginal: `dibujo-${i}.png`, tipo: 'png', bytes: datos.length, ancho: 1600, alto: 2400 })
    bloques.push({ id: `i${i}`, tipo: 'ilustracion', imagenId: id, alt: '', decorativa: false })
  }
  const p: Proyecto = {
    id: 'p',
    version: VERSION_PROYECTO,
    datos: { ...DATOS_POR_DEFECTO, titulo: 'Ilustrado', autor: 'Ana' },
    capitulos: [{ id: 'c1', etiqueta: 'Capítulo 1', titulo: [{ texto: 'Uno', marcas: [] }], aperturas: [], bloques }],
    extras: [],
    laminas: [],
    portada: {},
  }
  return { p, imagenes, bytes }
}

describe('treinta ilustraciones de Procreate', () => {
  const { p, imagenes, bytes } = libroIlustrado(30)
  const exp = exportar(p, imagenes, bytes)
  const c = construir(exp.proyecto, { ahora: new Date('2026-01-01T00:00:00Z') })
  const grupos = agrupar(c.diagnosticos)

  it('el motor dice treinta y tantas cosas', () => {
    expect(cuentas(grupos).mensajes).toBeGreaterThanOrEqual(31)
  })

  it('agrupadas son un punado de renglones', () => {
    expect(grupos.map((g) => `${g.nivel}:${g.clave}`)).toEqual([
      'aviso:sinPortada',
      'aviso:transparencia',
      'aviso:p3',
      'nota:sinDescripcion',
    ])
  })

  it('cada renglon sabe a cuales afecta, sin repetir', () => {
    const trans = grupos.find((g) => g.clave === 'transparencia')
    expect(trans?.elementos).toHaveLength(15)
    expect(new Set(trans?.elementos).size).toBe(15)
    expect(grupos.find((g) => g.clave === 'sinDescripcion')?.elementos).toHaveLength(30)
  })

  it('y se pueden nombrar como las ve el autor', () => {
    const nombres = nombresLegibles(p, imagenes, exp.nombres)
    const trans = grupos.find((g) => g.clave === 'transparencia') as { elementos: readonly string[] }
    expect(nombres.get(trans.elementos[0] as string)).toBe('Capítulo 1: Uno · ilustración 1 (dibujo-0.png)')
    const desc = grupos.find((g) => g.clave === 'sinDescripcion') as { elementos: readonly string[] }
    expect(nombres.get(desc.elementos[1] as string)).toBe('Capítulo 1: Uno · ilustración 2 (dibujo-1.png)')
  })

  it('no se pierde ni un mensaje del motor', () => {
    const dg = c.diagnosticos
    expect(grupos.flatMap((g) => g.mensajes).sort()).toEqual([...dg.errores, ...dg.avisos, ...dg.notas].sort())
  })
})

describe('agrupar', () => {
  it('un mensaje desconocido no se pierde: forma su propio renglon', () => {
    const dg = new Diagnosticos()
    dg.aviso('Algo nuevo que dice el motor.')
    dg.aviso('Otra cosa nueva.')
    const g = agrupar(dg)
    expect(g.map((x) => x.clave)).toEqual(['otro', 'otro'])
    expect(g.map((x) => x.mensajes[0])).toEqual(['Algo nuevo que dice el motor.', 'Otra cosa nueva.'])
  })

  it('los errores van antes que los avisos y las notas', () => {
    const dg = new Diagnosticos()
    dg.nota('x.png: es horizontal; en pantallas verticales se mostrará reducida.')
    dg.error('y.png: no es un PNG ni un JPG de verdad (¿HEIC, WebP o un archivo renombrado?). No la incluí.')
    expect(agrupar(dg).map((g) => g.nivel)).toEqual(['error', 'nota'])
  })

  it('los pixeles de mas no se confunden con la resolucion baja', () => {
    const dg = new Diagnosticos()
    dg.aviso('a.png: 4000×3000 px = 12.0 millones de píxeles; Apple Books admite hasta 5.6. Redúcela.')
    dg.aviso('b.png: mide 800×1200 px; lo recomendado es 1600×2400 (mínimo 1200×1800). Se verá borrosa en pantallas grandes.')
    expect(agrupar(dg).map((g) => g.clave)).toEqual(['pixeles', 'resolucion'])
  })
})

describe('revision antes de generar', () => {
  const base = (): Proyecto => libroIlustrado(0).p

  it('un libro con titulo y texto no bloquea', () => {
    expect(bloquea(revisar(base(), new Map()))).toBe(false)
  })

  it('sin titulo bloquea', () => {
    const p = base()
    expect(revisar({ ...p, datos: { ...p.datos, titulo: ' ' } }, new Map()).map((x) => x.clave)).toContain('sinTitulo')
  })

  it('un capitulo sin titulo ni etiqueta bloquea y dice donde ir', () => {
    // El motor tomaria su primer parrafo como titulo: el libro diria otra cosa
    // que la pantalla.
    const p = base()
    const cap = { ...(p.capitulos[0] as Proyecto['capitulos'][number]), etiqueta: '', titulo: [] }
    const r = revisar({ ...p, capitulos: [cap] }, new Map())
    expect(r).toContainEqual(expect.objectContaining({ clave: 'capituloSinTitulo', nivel: 'bloquea', ir: { capitulo: 'c1' } }))
  })

  it('una ilustracion sin imagen avisa pero no bloquea', () => {
    const { p } = libroIlustrado(1)
    const r = revisar(p, new Map())
    expect(r.map((x) => `${x.nivel}:${x.clave}`)).toEqual(['error:faltaImagen'])
    expect(bloquea(r)).toBe(false)
  })

  it('cambiar el titulo despues de descargar avisa: para las tiendas es otro libro', () => {
    const p = base()
    const uid = identificador(p.datos.titulo, p.datos.autor, p.datos.isbn)
    const descargado = { ...p, descargado: { uid, titulo: p.datos.titulo, autor: p.datos.autor, cuando: 1 } }
    expect(cambioDeIdentidad(descargado)).toBeNull()
    const cambiado = { ...descargado, datos: { ...p.datos, titulo: 'Otro título' } }
    expect(cambioDeIdentidad(cambiado)).toEqual({ antes: { titulo: 'Ilustrado', autor: 'Ana' } })
    // Con ISBN la identidad es el ISBN, y el titulo se puede corregir.
    const conIsbn = { ...cambiado, datos: { ...cambiado.datos, isbn: '978-84-0000-000-0' } }
    const uidIsbn = identificador('x', 'y', '978-84-0000-000-0')
    expect(cambioDeIdentidad({ ...conIsbn, descargado: { ...descargado.descargado, uid: uidIsbn } })).toBeNull()
  })

  it('etiquetaReconocida: el motor solo separa las etiquetas que conoce', () => {
    for (const e of ['', 'Capítulo 3', 'CAPÍTULO UNO', 'Cap. 7', 'Prólogo', 'Epílogo', 'Interludio']) {
      expect(etiquetaReconocida(e)).toBe(true)
    }
    for (const e of ['Parte uno', 'Libro I', '3']) expect(etiquetaReconocida(e)).toBe(false)
  })
})

/**
 * El reparto por tienda. La tarjeta de una imagen los enseñaba todos juntos y
 * el autor no sabia que cada cosa era de una tienda distinta.
 */
describe('a que tienda le importa cada aviso', () => {
  it('cada aviso le importa al menos a una tienda', () => {
    const claves: ClaveGrupo[] = [
      'noEsImagen', 'faltaImagen', 'recursoAusente', 'transparencia', 'cmyk', 'p3', 'pixeles',
      'portadaLadoCorto', 'portadaBaja', 'resolucion', 'horizontal', 'proporcion', 'peso',
      'logoOpaco', 'sinLogoBlanco', 'sinPortada', 'capituloVacio', 'sinDescripcion', 'otro',
    ]
    for (const c of claves) {
      const t = tiendasDe(c)
      expect(t.length, `${c} no le importa a ninguna tienda`).toBeGreaterThan(0)
      for (const x of t) expect(TIENDAS).toContain(x)
    }
  })

  it('la tienda sale del motivo que da el motor, no de una opinion', () => {
    // «Kindle la convierte en blanco»: en Apple Books la transparencia se respeta.
    expect(tiendasDe('transparencia')).toEqual(['kindle'])
    // La tarifa de entrega por MB es de Amazon; Apple no cobra por el tamaño.
    expect(tiendasDe('peso')).toEqual(['kindle'])
    // Los 5,6 millones de pixeles son el limite de Apple Books.
    expect(tiendasDe('pixeles')).toEqual(['apple'])
    // El logo solo viaja en el EPUB de Apple: en Kindle el titulo va en texto.
    expect(tiendasDe('logoOpaco')).toEqual(['apple'])
    expect(tiendasDe('sinLogoBlanco')).toEqual(['apple'])
    // Un color mal se ve igual de mal en las dos.
    expect(tiendasDe('cmyk')).toEqual(['apple', 'kindle'])
    expect(tiendasDe('p3')).toEqual(['apple', 'kindle'])
  })

  it('una imagen con transparencia y peso esta lista para Apple y no para Kindle', () => {
    const dg = new Diagnosticos()
    dg.aviso('x.png: tiene transparencia. Kindle la convierte en blanco; aplánala sobre su fondo.')
    dg.nota('x.png: pesa 2.5 MB; considera comprimirla (la tarifa de entrega de Kindle se cobra por MB).')
    const r = porTienda(agrupar(dg))
    expect(r.apple).toEqual([])
    expect(r.kindle.map((g) => g.clave)).toEqual(['transparencia', 'peso'])
  })

  it('lo que afecta a las dos sale en las dos: cada columna contesta entera', () => {
    const dg = new Diagnosticos()
    dg.nota('x.png: proporción 1:1.10 (lo recomendado es 1:1.5); en algunas pantallas quedará con franjas vacías.')
    const r = porTienda(agrupar(dg))
    expect(r.apple.map((g) => g.clave)).toEqual(['proporcion'])
    expect(r.kindle.map((g) => g.clave)).toEqual(['proporcion'])
  })

  it('sin avisos, las dos tiendas quedan vacias: la tarjeta dira «lista»', () => {
    const r = porTienda([])
    expect(r).toEqual({ apple: [], kindle: [] })
  })
})
