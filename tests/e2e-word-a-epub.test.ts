// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { construir } from '../src/core/construir'
import { inspeccionarImagen } from '../src/core/imagen-inspeccion'
import { archivo, type Archivo } from '../src/core/proyecto'
import { reporte } from '../src/core/reporte'
import { exportar } from '../src/app/exportar'
import { aplicarCortes, importarDocx } from '../src/app/importar/docx'
import {
  DATOS_POR_DEFECTO,
  VERSION_PROYECTO,
  type Imagen,
  type Proyecto,
} from '../src/app/modelo'

/**
 * EL CAMINO COMPLETO, de punta a punta y sin atajos:
 *
 *   un .docx de Word
 *     -> propuesta (bloques planos + cortes sugeridos + imagenes extraidas)
 *     -> el autor confirma los cortes
 *     -> modelo del proyecto
 *     -> exportar: el Proyecto que el motor sabe leer
 *     -> construir: los dos EPUB
 *
 * Si esto pasa, la cadena entera funciona: lo que el autor suelta en la app
 * sale como un EPUB valido, con sus ilustraciones en su sitio y su nombre.
 */

const FIXTURES = join(import.meta.dirname, 'fixtures')
const FECHA = new Date('2026-10-20T19:22:26Z')

let n = 0
const nuevoId = (prefijo: string): string => `${prefijo}-${++n}`

beforeEach(() => {
  n = 0
})

const leer = (...partes: string[]): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, ...partes)))

function fuentesDePrueba(): Archivo[] {
  const base = join(FIXTURES, 'libro-prueba', 'fuentes')
  return ['LibreBaskerville-Regular.ttf', 'LibreBaskerville-Italic.ttf', 'LibreBaskerville-Bold.ttf'].map(
    (f) => archivo(`fuentes/${f}`, new Uint8Array(readFileSync(join(base, f)))),
  )
}

async function caminoCompleto() {
  // 1. Word
  const buf = readFileSync(join(FIXTURES, 'docx', 'capitulo-completo.docx'))
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const propuesta = await importarDocx(bytes, { nombreArchivo: 'cap01', nuevoId })

  // 2. El autor confirma los cortes que la app le propuso
  const { capitulos } = aplicarCortes(propuesta.bloques, propuesta.cortes, nuevoId)

  // 3. El modelo del proyecto: los datos del libro los rellena el autor en la
  //    interfaz, no salen del .docx
  const portadaBytes = leer('imagenes', 'portada.png')
  const idPortada = nuevoId('img')
  const imagenes = new Map<string, Imagen>([
    [
      propuesta.imagenes[0]?.id as string,
      {
        id: propuesta.imagenes[0]?.id as string,
        nombreOriginal: 'de-word.png',
        tipo: 'png',
        bytes: propuesta.imagenes[0]?.bytes.length ?? 0,
        ancho: 1600,
        alto: 2400,
      },
    ],
    [
      idPortada,
      { id: idPortada, nombreOriginal: 'portada.png', tipo: 'png', bytes: portadaBytes.length, ancho: 1600, alto: 2560 },
    ],
  ])
  const datos = new Map<string, Uint8Array>([
    [propuesta.imagenes[0]?.id as string, propuesta.imagenes[0]?.bytes as Uint8Array],
    [idPortada, portadaBytes],
  ])

  const proyecto: Proyecto = {
    id: 'p1',
    version: VERSION_PROYECTO,
    datos: {
      ...DATOS_POR_DEFECTO,
      titulo: 'El faro de Ibar',
      autor: 'Ana Ruiz Mendoza',
      subtitulo: 'importada desde Word',
      sello: 'Ediciones Pubteca',
      fechaPublicacion: '2026-03-15',
    },
    capitulos,
    extras: [],
    laminas: [],
    portada: { portada: idPortada },
  }

  // 4. Al motor
  const exportado = exportar(proyecto, imagenes, datos, fuentesDePrueba())

  // 5. Los dos EPUB
  const construido = construir(exportado.proyecto, { ahora: FECHA })

  return { propuesta, proyecto, exportado, construido }
}

describe('de un .docx de Word a dos EPUB', () => {
  it('se generan los dos, sin nada que bloquee', async () => {
    const { construido } = await caminoCompleto()
    expect(construido.bloqueado).toBeNull()
    expect(construido.resultados.map((r) => r.tienda)).toEqual(['Kindle', 'AppleBooks'])
    expect(construido.diagnosticos.errores).toEqual([])
  })

  it('el serializador no tuvo que avisar de nada', async () => {
    const { exportado } = await caminoCompleto()
    expect(exportado.avisos).toEqual([])
  })

  it('la ilustracion de Word acaba con el nombre que le toca', async () => {
    const { exportado, propuesta } = await caminoCompleto()
    // En el modelo la imagen es un id; el nombre de archivo lo pone exportar.
    expect(exportado.nombres.get(propuesta.imagenes[0]?.id as string)).toBe('cap01-01.png')
    expect(exportado.proyecto.ilustraciones.map((a) => a.ruta)).toEqual([
      'ilustraciones/cap01-01.png',
    ])
  })

  it('el .md del capitulo lleva la marca con ese nombre y la descripcion de Word', async () => {
    const { exportado } = await caminoCompleto()
    const md = new TextDecoder().decode(exportado.proyecto.capitulos[0]?.bytes as Uint8Array)
    expect(md).toContain('[ilustración: cap01-01 | La cabana de noche]')
    expect(md.split('\n')[0]).toBe('Capítulo 1: La luz que no tocaba')
  })

  it('el libro.txt lleva lo que el autor puso en la interfaz', async () => {
    const { exportado } = await caminoCompleto()
    const txt = exportado.proyecto.libroTxt as string
    expect(txt).toContain('titulo: El faro de Ibar')
    expect(txt).toContain('autor: Ana Ruiz Mendoza')
    expect(txt).toContain('incluir_contraportada: si')
  })

  it('los dos EPUB cumplen las reglas del formato', async () => {
    const { construido } = await caminoCompleto()
    for (const r of construido.resultados) {
      const dv = new DataView(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength)
      // PKG-006: el mimetype es la primera entrada.
      expect(dv.getUint32(0, true)).toBe(0x04034b50)
      expect(dv.getUint16(8, true)).toBe(0) // STORE
      expect(dv.getUint16(28, true)).toBe(0) // PKG-005: sin campos extra
      const nombre = new TextDecoder().decode(r.bytes.subarray(30, 38))
      expect(nombre).toBe('mimetype')
    }
  })

  it('la ilustracion entra en los dos EPUB, sin recodificar', async () => {
    const { construido, propuesta } = await caminoCompleto()
    const original = propuesta.imagenes[0]?.bytes as Uint8Array
    for (const r of construido.resultados) {
      const z = unzipSync(r.bytes)
      const dentro = z['OEBPS/imagenes/cap01-01.png']
      expect(dentro).toBeDefined()
      expect(dentro).toEqual(original)
      // Y sigue siendo un PNG de verdad, con sus dimensiones.
      const info = inspeccionarImagen(dentro as Uint8Array)
      expect(info.tipo).toBe('png')
      expect(info.ancho).toBe(1600)
    }
  })

  it('la ilustracion ocupa su propia pagina, con la descripcion de Word como alt', async () => {
    const { construido } = await caminoCompleto()
    const z = unzipSync(construido.resultados[0]?.bytes as Uint8Array)
    const pagina = new TextDecoder().decode(z['OEBPS/texto/cap01-ilus01.xhtml'] as Uint8Array)
    expect(pagina).toContain('src="../imagenes/cap01-01.png"')
    expect(pagina).toContain('alt="La cabana de noche"')
    expect(pagina).toContain('class="pagina-imagen"')
  })

  it('la cursiva y la negrita de Word llegan al XHTML del libro', async () => {
    const { construido } = await caminoCompleto()
    const z = unzipSync(construido.resultados[0]?.bytes as Uint8Array)
    const cap = new TextDecoder().decode(z['OEBPS/texto/cap01.xhtml'] as Uint8Array)
    expect(cap).toContain('<em>encendido</em>')
    expect(cap).toContain('<strong>cuarenta años</strong>')
    expect(cap).toContain('<strong><em>en los dos</em></strong>')
  })

  it('el Titulo 2 de Word es un subtitulo del libro', async () => {
    const { construido } = await caminoCompleto()
    const z = unzipSync(construido.resultados[0]?.bytes as Uint8Array)
    const cap = new TextDecoder().decode(z['OEBPS/texto/cap01.xhtml'] as Uint8Array)
    expect(cap).toContain('<h2 class="subtitulo">Una parte</h2>')
  })

  it('la cabecera sale como la detecto la propuesta', async () => {
    const { construido } = await caminoCompleto()
    const z = unzipSync(construido.resultados[0]?.bytes as Uint8Array)
    const cap = new TextDecoder().decode(z['OEBPS/texto/cap01.xhtml'] as Uint8Array)
    expect(cap).toContain('<p class="num-capitulo">Capítulo 1</p>')
    expect(cap).toContain('class="titulo-capitulo" id="h-cap01">La luz que no tocaba</h1>')
  })

  it('la portada solo va dentro del EPUB de Apple Books', async () => {
    const { construido } = await caminoCompleto()
    const kindle = unzipSync(construido.resultados[0]?.bytes as Uint8Array)
    const apple = unzipSync(construido.resultados[1]?.bytes as Uint8Array)
    expect(kindle['OEBPS/imagenes/portada.png']).toBeUndefined()
    expect(apple['OEBPS/imagenes/portada.png']).toBeDefined()
  })

  it('el reporte sale completo y sin errores', async () => {
    const { construido } = await caminoCompleto()
    const texto = reporte(construido, FECHA)
    expect(texto).toContain('Libro: El faro de Ibar — Ana Ruiz Mendoza')
    expect(texto).toContain('cap01.md')
    expect(texto).toContain('1 ilustración')
    expect(texto).toContain('tarifa de entrega estimada')
    expect(texto).not.toContain('Errores:')
  })
})
