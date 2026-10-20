import { describe, expect, it } from 'vitest'
import { construir } from '../src/core/construir'
import { exportar } from '../src/app/exportar'
import {
  DATOS_POR_DEFECTO,
  VERSION_PROYECTO,
  type Bloque,
  type Capitulo,
  type Imagen,
  type Proyecto,
} from '../src/app/modelo'

/**
 * El puente del modelo al motor. Lo que se prueba aqui es sobre todo el
 * NOMBRADO de las imagenes: en el modelo son ids y aqui se convierten en
 * nombres de archivo, y de eso depende que la marca del texto apunte a algo que
 * existe. Equivocarse es un recurso ausente y un EPUB que la tienda rechaza.
 */

const png = (n: number): Uint8Array => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, n])

function imagen(id: string, tipo: Imagen['tipo'] = 'png'): Imagen {
  return { id, nombreOriginal: `${id}.${tipo}`, tipo, bytes: 9, ancho: 1600, alto: 2400 }
}

const ilus = (id: string, imagenId: string, alt = 'x'): Bloque => ({
  id,
  tipo: 'ilustracion',
  imagenId,
  alt,
  decorativa: false,
})
const p = (texto: string): Bloque => ({
  id: `p-${texto}`,
  tipo: 'parrafo',
  tramos: [{ texto, marcas: [] }],
})

function proyecto(capitulos: Capitulo[], extra: Partial<Proyecto> = {}): Proyecto {
  return {
    id: 'p1',
    version: VERSION_PROYECTO,
    datos: { ...DATOS_POR_DEFECTO, titulo: 'Libro', autor: 'Autora' },
    capitulos,
    extras: [],
    laminas: [],
    portada: {},
    ...extra,
  }
}

describe('nombrado de las ilustraciones', () => {
  it('las laminas de APERTURA cuentan al numerar, y van primero', () => {
    // Si no contaran, la primera del cuerpo se llamaria cap01-01 igual que la
    // de apertura y una sobreescribiria a la otra.
    const cap: Capitulo = {
      id: 'c1',
      etiqueta: 'Capítulo 1',
      titulo: [{ texto: 'T', marcas: [] }],
      aperturas: [{ imagenId: 'a', alt: 'lamina' }],
      bloques: [p('uno'), ilus('b1', 'b'), p('dos'), ilus('b2', 'c')],
    }
    const imagenes = new Map([
      ['a', imagen('a')],
      ['b', imagen('b')],
      ['c', imagen('c')],
    ])
    const bytes = new Map([
      ['a', png(1)],
      ['b', png(2)],
      ['c', png(3)],
    ])

    const r = exportar(proyecto([cap]), imagenes, bytes)
    expect(r.nombres.get('a')).toBe('cap01-01.png')
    expect(r.nombres.get('b')).toBe('cap01-02.png')
    expect(r.nombres.get('c')).toBe('cap01-03.png')
    expect(r.proyecto.ilustraciones.map((x) => x.ruta)).toEqual([
      'ilustraciones/cap01-01.png',
      'ilustraciones/cap01-02.png',
      'ilustraciones/cap01-03.png',
    ])

    const md = new TextDecoder().decode(r.proyecto.capitulos[0]?.bytes as Uint8Array)
    // La de apertura va ANTES de la cabecera, y las demas en su sitio.
    expect(md.split('\n').filter((l) => l.startsWith('[ilustraci'))).toEqual([
      '[ilustración: cap01-01 | lamina]',
      '[ilustración: cap01-02 | x]',
      '[ilustración: cap01-03 | x]',
    ])
    expect(md.indexOf('cap01-01')).toBeLessThan(md.indexOf('Capítulo 1: T'))
  })

  it('cada capitulo numera desde 01', () => {
    const cap = (n: number, imagenId: string): Capitulo => ({
      id: `c${n}`,
      etiqueta: `Capítulo ${n}`,
      titulo: [{ texto: 'T', marcas: [] }],
      aperturas: [],
      bloques: [p('x'), ilus(`b${n}`, imagenId)],
    })
    const r = exportar(
      proyecto([cap(1, 'i1'), cap(2, 'i2'), cap(3, 'i3')]),
      new Map([
        ['i1', imagen('i1')],
        ['i2', imagen('i2')],
        ['i3', imagen('i3')],
      ]),
      new Map([
        ['i1', png(1)],
        ['i2', png(2)],
        ['i3', png(3)],
      ]),
    )
    expect([...r.nombres.values()]).toEqual(['cap01-01.png', 'cap02-01.png', 'cap03-01.png'])
    expect(r.proyecto.capitulos.map((c) => c.ruta)).toEqual([
      'capitulos/cap01.md',
      'capitulos/cap02.md',
      'capitulos/cap03.md',
    ])
  })

  it('las laminas a color se llaman color-NN y no se marcan en el texto', () => {
    const cap: Capitulo = {
      id: 'c1',
      etiqueta: '',
      titulo: [{ texto: 'T', marcas: [] }],
      aperturas: [],
      bloques: [p('x')],
    }
    const r = exportar(
      proyecto([cap], { laminas: ['L1', 'L2'] }),
      new Map([
        ['L1', imagen('L1')],
        ['L2', imagen('L2')],
      ]),
      new Map([
        ['L1', png(1)],
        ['L2', png(2)],
      ]),
    )
    expect(r.nombres.get('L1')).toBe('color-01.png')
    expect(r.nombres.get('L2')).toBe('color-02.png')
    const md = new TextDecoder().decode(r.proyecto.capitulos[0]?.bytes as Uint8Array)
    expect(md).not.toContain('color-')
  })

  it('un JPEG se nombra .jpg, como espera el motor', () => {
    const cap: Capitulo = {
      id: 'c1',
      etiqueta: '',
      titulo: [{ texto: 'T', marcas: [] }],
      aperturas: [],
      bloques: [ilus('b', 'i')],
    }
    const r = exportar(
      proyecto([cap]),
      new Map([['i', imagen('i', 'jpeg')]]),
      new Map([['i', png(1)]]),
    )
    expect(r.nombres.get('i')).toBe('cap01-01.jpg')
  })

  it('la misma imagen usada dos veces se escribe UNA vez', () => {
    const cap: Capitulo = {
      id: 'c1',
      etiqueta: '',
      titulo: [{ texto: 'T', marcas: [] }],
      aperturas: [],
      bloques: [ilus('b1', 'i'), p('x'), ilus('b2', 'i')],
    }
    const r = exportar(proyecto([cap]), new Map([['i', imagen('i')]]), new Map([['i', png(1)]]))
    expect(r.proyecto.ilustraciones).toHaveLength(1)
    const md = new TextDecoder().decode(r.proyecto.capitulos[0]?.bytes as Uint8Array)
    expect(md.match(/cap01-01/g)).toHaveLength(2)
  })
})

describe('portada y logos van por su rol', () => {
  it('cada rol se escribe con el nombre que el motor busca', () => {
    const cap: Capitulo = {
      id: 'c1',
      etiqueta: '',
      titulo: [{ texto: 'T', marcas: [] }],
      aperturas: [],
      bloques: [p('x')],
    }
    const r = exportar(
      proyecto([cap], {
        portada: { portada: 'p1', contraportada: 'p2', logo: 'p3', logoBlanco: 'p4' },
      }),
      new Map([
        ['p1', imagen('p1', 'jpeg')],
        ['p2', imagen('p2')],
        ['p3', imagen('p3')],
        ['p4', imagen('p4')],
      ]),
      new Map([
        ['p1', png(1)],
        ['p2', png(2)],
        ['p3', png(3)],
        ['p4', png(4)],
      ]),
    )
    expect(r.proyecto.portada.map((a) => a.ruta).sort()).toEqual([
      'portada/contraportada.png',
      'portada/logo-blanco.png',
      'portada/logo.png',
      'portada/portada.jpg',
    ])
  })
})

describe('los extras se enrutan por su nombre, que es como lee el motor', () => {
  it('dedicatoria, extra de inicio y extra de final', () => {
    const cap: Capitulo = {
      id: 'c1',
      etiqueta: '',
      titulo: [{ texto: 'T', marcas: [] }],
      aperturas: [],
      bloques: [p('x')],
    }
    const r = exportar(
      proyecto([cap], {
        extras: [
          {
            id: 'e1',
            donde: 'inicio',
            tipo: 'dedicatoria',
            titulo: [],
            bloques: [p('Para quien dejo la luz')],
            nombreArchivo: 'dedicatoria',
          },
          {
            id: 'e2',
            donde: 'inicio',
            tipo: 'conTitulo',
            titulo: [{ texto: 'Nota de la edición', marcas: [] }],
            bloques: [p('Texto.')],
            nombreArchivo: 'Nota de la edición',
          },
          {
            id: 'e3',
            donde: 'final',
            tipo: 'conTitulo',
            titulo: [{ texto: 'Agradecimientos', marcas: [] }],
            bloques: [p('Gracias.')],
            nombreArchivo: 'Agradecimientos',
          },
        ],
      }),
      new Map(),
      new Map(),
    )
    expect(r.proyecto.extras.map((a) => a.ruta)).toEqual([
      'extras/dedicatoria.md',
      'extras/inicio-nota-de-la-edicion.md',
      'extras/agradecimientos.md',
    ])
  })

  it('y el motor los coloca donde toca', () => {
    const cap: Capitulo = {
      id: 'c1',
      etiqueta: 'Capítulo 1',
      titulo: [{ texto: 'T', marcas: [] }],
      aperturas: [],
      bloques: [p('x')],
    }
    const r = exportar(
      proyecto([cap], {
        extras: [
          {
            id: 'e1',
            donde: 'inicio',
            tipo: 'dedicatoria',
            titulo: [],
            bloques: [p('Para alguien')],
            nombreArchivo: 'dedicatoria',
          },
          {
            id: 'e3',
            donde: 'final',
            tipo: 'conTitulo',
            titulo: [{ texto: 'Agradecimientos', marcas: [] }],
            bloques: [p('Gracias.')],
            nombreArchivo: 'Agradecimientos',
          },
        ],
      }),
      new Map(),
      new Map(),
    )
    const c = construir(r.proyecto, { ahora: new Date('2026-01-01T00:00:00Z') })
    const paginas = c.libro.paginas.map((x) => `${x.seccion}:${x.href}`)
    expect(paginas).toContain('inicio:texto/extra-dedicatoria.xhtml')
    expect(paginas).toContain('final:texto/extra-agradecimientos.xhtml')
    // El de inicio va antes del capitulo, el de final despues.
    const i = paginas.findIndex((x) => x.includes('dedicatoria'))
    const j = paginas.findIndex((x) => x.includes('cap01'))
    const k = paginas.findIndex((x) => x.includes('agradecimientos'))
    expect(i).toBeLessThan(j)
    expect(j).toBeLessThan(k)
  })
})
