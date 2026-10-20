import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspeccionarImagen, mediaType } from '../src/core/imagen-inspeccion'
import { revisarImagen, type RolImagen } from '../src/core/imagen-validacion'
import { Diagnosticos } from '../src/core/mensajes'
import { oraculo } from './oraculo'

const CARPETA = join(import.meta.dirname, 'fixtures', 'imagenes')
const leer = (n: string): Uint8Array => new Uint8Array(readFileSync(join(CARPETA, n)))

describe(`inspeccionarImagen (${oraculo.imagenes.length} imagenes del Python)`, () => {
  for (const caso of oraculo.imagenes) {
    it(caso.archivo, () => {
      const info = inspeccionarImagen(leer(caso.archivo))
      expect({
        bytes: info.bytes,
        tipo: info.tipo,
        ancho: info.ancho,
        alto: info.alto,
        alfa: info.alfa,
        cmyk: info.cmyk,
        p3: info.p3,
      }).toEqual({
        bytes: caso.bytes,
        tipo: caso.tipo,
        ancho: caso.ancho,
        alto: caso.alto,
        alfa: caso.alfa,
        cmyk: caso.cmyk,
        p3: caso.p3,
      })
    })

    if (caso.media_type) {
      it(`${caso.archivo}: media type`, () => {
        const info = inspeccionarImagen(leer(caso.archivo))
        expect(info.tipo && mediaType(info.tipo)).toBe(caso.media_type)
      })
    }
  }
})

describe('inspeccionarImagen: las cuatro vias del Display P3', () => {
  it('por el nombre del chunk iCCP', () => {
    expect(inspeccionarImagen(leer('p3-nombre.png')).p3).toBe(true)
  })
  it('por el perfil comprimido, en ASCII', () => {
    expect(inspeccionarImagen(leer('p3-perfil.png')).p3).toBe(true)
  })
  it('por el perfil comprimido, en UTF-16BE', () => {
    // Un TextDecoder sobre el perfil binario destruiria esta coincidencia.
    expect(inspeccionarImagen(leer('p3-utf16.png')).p3).toBe(true)
  })
  it('por DCI-P3, no solo Display P3', () => {
    expect(inspeccionarImagen(leer('dcip3.png')).p3).toBe(true)
  })
  it('un iCCP corrupto no revienta, y cae al nombre del chunk', () => {
    expect(inspeccionarImagen(leer('iccp-corrupto.png')).p3).toBe(false)
    expect(inspeccionarImagen(leer('iccp-corrupto-nombre-p3.png')).p3).toBe(true)
  })
  it('un perfil sRGB explicito no se confunde con P3', () => {
    expect(inspeccionarImagen(leer('srgb-explicito.png')).p3).toBe(false)
  })
  it('en JPEG, por el APP2 ICC_PROFILE, en ASCII y en UTF-16BE', () => {
    expect(inspeccionarImagen(leer('jpeg-p3.jpg')).p3).toBe(true)
    expect(inspeccionarImagen(leer('jpeg-p3-utf16.jpg')).p3).toBe(true)
  })
})

describe('inspeccionarImagen: transparencia por sus dos vias', () => {
  it('por tipo de color 6 (RGBA)', () => {
    expect(inspeccionarImagen(leer('alfa.png')).alfa).toBe(true)
  })
  it('por el chunk tRNS en una imagen sin canal alfa', () => {
    expect(inspeccionarImagen(leer('trns.png')).alfa).toBe(true)
  })
  it('una RGB normal no tiene alfa', () => {
    expect(inspeccionarImagen(leer('buena.png')).alfa).toBe(false)
  })
})

describe('inspeccionarImagen: lo que no es PNG ni JPEG', () => {
  const impostores: [string, string][] = [
    ['webp-renombrado.png', 'webp'],
    ['heic-renombrado.png', 'heic'],
    ['tiff-renombrado.png', 'tiff'],
    ['gif-renombrado.png', 'gif'],
    ['texto-renombrado.png', 'desconocido'],
    ['vacio.png', 'desconocido'],
  ]

  for (const [archivo, formato] of impostores) {
    it(`${archivo}: tipo null, y sabemos que es ${formato}`, () => {
      const info = inspeccionarImagen(leer(archivo))
      expect(info.tipo).toBeNull()
      // El Python no distingue («HEIC, WebP o un archivo renombrado»); aqui si,
      // para que la interfaz pueda decirle al autor QUE subio.
      expect(info.impostor).toBe(formato)
    })
  }

  it('un JPEG progresivo (SOF2) si se lee, no es un impostor', () => {
    const info = inspeccionarImagen(leer('jpeg-progresivo.jpg'))
    expect(info.tipo).toBe('jpeg')
    expect(info.ancho).toBe(1600)
  })
})

describe('DIVERGENCIA: un PNG truncado cuelga al Python, aqui no', () => {
  // El Python hace struct.unpack(">IIBB", b[16:26]) sin comprobar el limite:
  // un PNG copiado a medias lanza struct.error SIN capturar y el generador
  // entero aborta con un traceback. El autor no recibe un libro, recibe un
  // error de Python. Verificado contra el script de referencia.
  it('devuelve tipo null y lo marca como truncada', () => {
    const info = inspeccionarImagen(leer('truncado.png'))
    expect(info.tipo).toBeNull()
    expect(info.truncada).toBe(true)
  })

  it('no lanza con ningun prefijo de un PNG valido', () => {
    const completo = leer('buena.png')
    for (let n = 0; n <= 80; n++) {
      expect(() => inspeccionarImagen(completo.subarray(0, n))).not.toThrow()
    }
  })

  it('no lanza con ningun prefijo de un JPEG valido', () => {
    const completo = leer('jpeg-p3.jpg')
    for (let n = 0; n <= completo.length; n++) {
      expect(() => inspeccionarImagen(completo.subarray(0, n))).not.toThrow()
    }
  })

  it('no lanza con un chunk PNG que declara un tamano imposible', () => {
    const b = new Uint8Array(leer('buena.png').subarray(0, 60))
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    dv.setUint32(33, 0xfffffff0) // largo absurdo en el segundo chunk
    expect(() => inspeccionarImagen(b)).not.toThrow()
  })
})

describe('revisarImagen: avisos y notas identicos al Python', () => {
  const roles: RolImagen[] = ['ilustracion', 'portada', 'logo']

  for (const caso of oraculo.imagenes) {
    if (caso.tipo === null) continue
    for (const rol of roles) {
      it(`${caso.archivo} como ${rol}`, () => {
        const dg = new Diagnosticos()
        const info = inspeccionarImagen(leer(caso.archivo))
        revisarImagen(`ilustraciones/${caso.archivo}`, info, rol, dg)
        const esperado = caso.revisiones[rol]
        expect({ avisos: dg.avisos, notas: dg.notas, errores: dg.errores }).toEqual({
          avisos: esperado?.avisos ?? [],
          notas: esperado?.notas ?? [],
          errores: esperado?.errores ?? [],
        })
      })
    }
  }
})

describe('revisarImagen: las ramas que retornan antes', () => {
  const info = (extra: Partial<ReturnType<typeof inspeccionarImagen>>) => ({
    ...inspeccionarImagen(leer('buena.png')),
    ...extra,
  })

  it('el logo no se revisa por CMYK, P3, tamano ni peso', () => {
    const dg = new Diagnosticos()
    revisarImagen('x', info({ cmyk: true, p3: true, ancho: 100, alto: 100, bytes: 9e6, alfa: true }), 'logo', dg)
    expect(dg.avisos).toEqual([])
    expect(dg.notas).toEqual([])
  })

  it('la portada no recibe la nota de peso ni la de proporcion', () => {
    const dg = new Diagnosticos()
    revisarImagen('x', info({ ancho: 1600, alto: 1700, bytes: 9e6 }), 'portada', dg)
    expect(dg.notas.join(' ')).not.toContain('pesa')
    expect(dg.notas.join(' ')).not.toContain('proporci')
  })

  it('una horizontal grande no recibe el aviso de borrosa, solo la nota', () => {
    const dg = new Diagnosticos()
    revisarImagen('x', info({ ancho: 2400, alto: 1600 }), 'ilustracion', dg)
    expect(dg.avisos).toEqual([])
    expect(dg.notas).toEqual(['x: es horizontal; en pantallas verticales se mostrará reducida.'])
  })
})
