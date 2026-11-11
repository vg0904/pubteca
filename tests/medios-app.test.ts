import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { archivosDeZip, leerCopia } from '../src/app/abrir-copia'
import { zipDeCopia } from '../src/app/copia'
import { exportar } from '../src/app/exportar'
import { bloquesDelModelo } from '../src/app/html'
import { capituloDesdeDialecto } from '../src/app/importar/dialecto'
import {
  DATOS_POR_DEFECTO,
  idsDeImagenes,
  idsDeMedios,
  versionNecesaria,
  type Bloque,
  type Capitulo,
  type Imagen,
  type Medio,
  type Proyecto,
} from '../src/app/modelo'
import { serializarCapitulo } from '../src/app/serializar'
import { construir } from '../src/core/construir'
import { parsear } from '../src/core/parser'

/**
 * Audio y video en el modelo de la app (hito M1): del bloque al dialecto, del
 * dialecto al motor y de vuelta, y la version con la que se guarda.
 */

const MEDIOS = join(import.meta.dirname, 'fixtures', 'libro-medios', 'medios')
const leer = (n: string): Uint8Array => new Uint8Array(readFileSync(join(MEDIOS, n)))
const utf8 = (b: Uint8Array | undefined): string => new TextDecoder('utf-8').decode(b)

const video: Bloque = { id: 'b-v', tipo: 'video', medioId: 'm-video', posterId: 'i-poster', alt: 'El muelle al amanecer', decorativa: false }
const audio: Bloque = { id: 'b-a', tipo: 'audio', medioId: 'm-audio', alt: 'Una sirena lejana', decorativa: false }
const par = (id: string, texto: string): Bloque => ({ id, tipo: 'parrafo', tramos: [{ texto, marcas: [] }] })

const capitulo: Capitulo = {
  id: 'c1',
  etiqueta: 'Capítulo 1',
  titulo: [{ texto: 'La cinta', marcas: [] }],
  aperturas: [],
  bloques: [par('p1', 'Encontró la cámara.'), video, par('p2', 'Duraba un segundo.'), audio],
}

function libro(bloques = capitulo.bloques): { p: Proyecto; imagenes: Map<string, Imagen>; medios: Map<string, Medio>; bytes: Map<string, Uint8Array> } {
  const p: Proyecto = {
    id: 'libro',
    version: 2,
    datos: { ...DATOS_POR_DEFECTO, titulo: 'La voz del faro', autor: 'Ana Ruiz' },
    capitulos: [{ ...capitulo, bloques }],
    extras: [],
    laminas: [],
    portada: {},
  }
  const poster = leer('cap01-v01.jpg')
  const imagenes = new Map<string, Imagen>([['i-poster', { id: 'i-poster', nombreOriginal: 'poster.jpg', tipo: 'jpeg', bytes: poster.length, ancho: 160, alto: 90 }]])
  const medios = new Map<string, Medio>([
    ['m-video', { id: 'm-video', nombreOriginal: 'IMG_0001.mov', tipo: 'm4v', bytes: 1, segundos: 1 }],
    ['m-audio', { id: 'm-audio', nombreOriginal: 'Nota de voz.m4a', tipo: 'm4a', bytes: 1, segundos: 1 }],
  ])
  const bytes = new Map([
    ['i-poster', poster],
    ['m-video', leer('cap01-v01.m4v')],
    ['m-audio', leer('cap01-a01.m4a')],
  ])
  return { p, imagenes, medios, bytes }
}

describe('del bloque al dialecto y de vuelta', () => {
  it('se escriben como marcas, con el nombre que les dio la exportacion', () => {
    const s = serializarCapitulo(capitulo, '* * *', (id) => id, (id) => (id === 'm-video' ? 'cap01-v01' : 'cap01-a01'))
    expect(s.avisos).toEqual([])
    expect(s.texto).toContain('\n[video: cap01-v01 | El muelle al amanecer]\n')
    expect(s.texto).toContain('\n[audio: cap01-a01 | Una sirena lejana]\n')
  })

  it('el motor lee exactamente lo que el modelo significa', () => {
    const s = serializarCapitulo(capitulo, '* * *')
    expect(parsear(s.texto).bloques).toEqual(bloquesDelModelo(capitulo.bloques))
  })

  it('una descripcion con «]» o con barras no rompe la marca', () => {
    const raro: Bloque = { ...audio, alt: 'a\\b ]c' }
    const s = serializarCapitulo({ ...capitulo, bloques: [raro] }, '* * *')
    expect(s.avisos.map((a) => a.que)).toEqual(['Descripción de un audio: «a\\b ]c»'])
    expect(parsear(s.texto).bloques).toEqual([{ tipo: 'medio', clase: 'audio', nombre: 'm-audio', alt: 'a\\b c' }])
  })

  it('al importar el dialecto vuelven como bloques de video y audio, con el poster del mismo nombre', () => {
    const c = capituloDesdeDialecto('Capítulo 1: La cinta\n\n[video: cap01-v01 | El muelle]\n\n[audio: cap01-a01]\n')
    expect(c?.bloques.map((b) => ({ ...b, id: '' }))).toEqual([
      { id: '', tipo: 'video', medioId: 'cap01-v01', posterId: 'cap01-v01', alt: 'El muelle', decorativa: false },
      { id: '', tipo: 'audio', medioId: 'cap01-a01', alt: '', decorativa: false },
    ])
  })
})

describe('la exportacion al motor', () => {
  it('pone los medios en medios/, con el poster al lado y con el mismo nombre', () => {
    const { p, imagenes, medios, bytes } = libro()
    const e = exportar(p, imagenes, bytes, [], medios)
    expect(e.proyecto.medios?.map((a) => a.ruta)).toEqual(['medios/cap01-v01.m4v', 'medios/cap01-v01.jpg', 'medios/cap01-a01.m4a'])
    expect(utf8(e.proyecto.capitulos[0]?.bytes)).toContain('[video: cap01-v01 | El muelle al amanecer]')
    expect(e.rutasMedios.get('m-video')).toBe('medios/cap01-v01.m4v')
    expect(e.rutas.get('i-poster')).toBe('medios/cap01-v01.jpg')
  })

  it('un libro sin medios no lleva la carpeta: el proyecto del motor es el de siempre', () => {
    const { p, imagenes, medios, bytes } = libro([par('p1', 'Solo texto.')])
    expect('medios' in exportar(p, imagenes, bytes, [], medios).proyecto).toBe(false)
  })

  it('de punta a punta: Apple Books recibe el video y el audio, Kindle no', () => {
    const { p, imagenes, medios, bytes } = libro()
    const c = construir(exportar(p, imagenes, bytes, [], medios).proyecto, { ahora: new Date('2026-11-11T12:00:00Z') })
    expect(c.diagnosticos.errores).toEqual([])
    const apple = unzipSync(c.resultados.find((r) => r.tienda === 'AppleBooks')?.bytes as Uint8Array)
    const kindle = unzipSync(c.resultados.find((r) => r.tienda === 'Kindle')?.bytes as Uint8Array)
    expect(apple['OEBPS/medios/cap01-v01.m4v']).toEqual(bytes.get('m-video'))
    expect(apple['OEBPS/medios/cap01-a01.m4a']).toEqual(bytes.get('m-audio'))
    expect(utf8(apple['OEBPS/texto/cap01.xhtml'])).toContain('poster="../imagenes/cap01-v01.jpg"')
    expect(Object.keys(kindle).filter((k) => k.includes('medios/') || k.includes('cap01-v01'))).toEqual([])
  })

  it('un video sin poster todavia: el motor lo dice como error', () => {
    const { p, imagenes, medios, bytes } = libro([{ ...video, posterId: null } as Bloque])
    const c = construir(exportar(p, imagenes, bytes, [], medios).proyecto, { ahora: new Date('2026-11-11T12:00:00Z') })
    expect(c.diagnosticos.errores.join('\n')).toMatch(/no tiene póster/u)
  })
})

describe('la version con la que se guarda', () => {
  it('1 sin medios, 2 con un video o un audio, este en un capitulo o en una pagina', () => {
    const { p } = libro()
    expect(versionNecesaria(p)).toBe(2)
    expect(versionNecesaria({ capitulos: [{ ...capitulo, bloques: [par('p', 'x')] }], extras: [] })).toBe(1)
    expect(versionNecesaria({ capitulos: [{ ...capitulo, bloques: [audio] }], extras: [] })).toBe(2)
    expect(
      versionNecesaria({ capitulos: [], extras: [{ id: 'x', donde: 'final', tipo: 'conTitulo', titulo: [], bloques: [video], nombreArchivo: 'x' }] }),
    ).toBe(2)
  })

  it('los ids: el poster es una imagen, el video y el audio son medios', () => {
    const { p } = libro()
    expect([...idsDeImagenes(p)]).toEqual(['i-poster'])
    expect([...idsDeMedios(p)].sort()).toEqual(['m-audio', 'm-video'])
  })
})

describe('la copia (.zip) conserva los bloques', () => {
  let n = 0
  const nuevoId = (prefijo: string): string => `${prefijo}-${++n}`
  beforeEach(() => {
    n = 0
  })

  it('el json dice formato 2, y al abrirla vuelven el video y el audio con su descripcion', () => {
    const { p, imagenes, medios, bytes } = libro()
    const zip = zipDeCopia(exportar(p, imagenes, bytes, [], medios), p, imagenes, new Date('2026-11-11T12:00:00Z'))
    const archivos = archivosDeZip(zip) as Map<string, Uint8Array>
    expect(JSON.parse(utf8(archivos.get('proyecto.json'))).version).toBe(2)
    const r = leerCopia(archivos, nuevoId)
    if (!r.ok) throw new Error(r.error)
    const bloques = r.copia.proyecto.capitulos[0]?.bloques ?? []
    expect(bloques.filter((b) => b.tipo === 'video' || b.tipo === 'audio').map((b) => [b.tipo, b.alt])).toEqual([
      ['video', 'El muelle al amanecer'],
      ['audio', 'Una sirena lejana'],
    ])
    expect(r.copia.proyecto.version).toBe(2)
  })

  it('un libro sin medios sigue saliendo como formato 1', () => {
    const { p, imagenes, medios, bytes } = libro([par('p1', 'Solo texto.')])
    const zip = zipDeCopia(exportar(p, imagenes, bytes, [], medios), p, imagenes, new Date('2026-11-11T12:00:00Z'))
    const json = JSON.parse(utf8((archivosDeZip(zip) as Map<string, Uint8Array>).get('proyecto.json')))
    expect([json.version, json.proyecto.version]).toEqual([1, 1])
  })
})
