import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { construir } from '../src/core/construir'
import { IDIOMAS_DEL_LIBRO, textosLibro } from '../src/core/textos-libro'
import { ESTADO_INICIAL, reducir } from '../src/app/estado'
import { exportar } from '../src/app/exportar'
import type { Bloque, Imagen, Proyecto } from '../src/app/modelo'
import { DATOS_POR_DEFECTO } from '../src/app/modelo'
import { ui } from '../src/i18n/es'

/**
 * Lo que el libro dice por su cuenta va en el idioma del LIBRO. Antes estaba en
 * español dentro del motor, y elegir «Ingles» en la interfaz daba un libro con
 * lang="en" que decia «Indice», «Edicion digital» y «Publicado por».
 */

describe('la tabla de textos', () => {
  it('la interfaz ofrece exactamente los idiomas que tienen textos propios', () => {
    // Si se ofreciera uno sin tabla, ese libro saldria en español.
    expect(Object.keys(ui.descargar.idiomas).sort()).toEqual([...IDIOMAS_DEL_LIBRO].sort())
  })

  for (const idioma of IDIOMAS_DEL_LIBRO) {
    it(`${idioma}: no le falta nada`, () => {
      const t = textosLibro(idioma)
      for (const [clave, valor] of Object.entries(t)) {
        const texto = typeof valor === 'function' ? (valor as (x: string | number) => string)('XYZ') : valor
        expect(texto.trim(), `${idioma}.${clave}`).not.toBe('')
        if (typeof valor === 'function') expect(texto, `${idioma}.${clave}`).toContain('XYZ')
      }
      // Las marcas que el motor sustituye son las mismas en todos los idiomas.
      expect(t.derechosPorDefecto).toContain('{año}')
      expect(t.derechosPorDefecto).toContain('{autor}')
    })
  }

  it('entiende las variantes regionales y cae al español si no conoce el idioma', () => {
    expect(textosLibro('en-GB').indice).toBe('Contents')
    expect(textosLibro('pt_BR').indice).toBe('Índice')
    expect(textosLibro('FR').indice).toBe('Table des matières')
    expect(textosLibro('xx').indice).toBe('Índice')
    expect(textosLibro('').indice).toBe('Índice')
  })
})

describe('EL FALLO: un libro en ingles ya no habla español', () => {
  const png = (n: string): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', 'imagenes', n)))
  const img = (id: string, bytes: Uint8Array): Imagen => ({ id, nombreOriginal: `${id}.png`, tipo: 'png', bytes: bytes.length, ancho: 1600, alto: 2400 })
  const par = (texto: string): Bloque => ({ id: texto, tipo: 'parrafo', tramos: [{ texto, marcas: [] }] })

  /** Un libro que hace salir CADA texto propio del motor. */
  function libro(idioma: string): Map<string, string> {
    const p: Proyecto = {
      id: 'x',
      version: 1,
      datos: { ...DATOS_POR_DEFECTO, titulo: 'The Lighthouse', autor: 'Ann', sello: 'Small Press', idioma, derechos: textosLibro(idioma).derechosPorDefecto },
      capitulos: [
        {
          id: 'c',
          etiqueta: '',
          titulo: [{ texto: 'Dawn', marcas: [] }],
          aperturas: [],
          // Una ilustracion SIN descripcion: el motor le pone la suya.
          bloques: [par('Text.'), { id: 'i', tipo: 'ilustracion', imagenId: 'dibujo', alt: '', decorativa: false }, par('More.')],
        },
      ],
      extras: [
        { id: 'd', donde: 'inicio', tipo: 'dedicatoria', titulo: [], bloques: [par('For you.')], nombreArchivo: 'dedicatoria' },
        { id: 'e', donde: 'inicio', tipo: 'epigrafe', titulo: [], bloques: [par('A quote.')], nombreArchivo: 'epigrafe' },
      ],
      laminas: ['lamina'],
      portada: { portada: 'portada', contraportada: 'contra' },
    }
    const bytes = new Map([
      ['dibujo', png('buena.png')],
      ['lamina', png('color-01.png')],
      ['portada', png('portada.png')],
      ['contra', png('portada.png')],
    ])
    const ex = exportar(p, new Map([...bytes].map(([id, b]) => [id, img(id, b)])), bytes)
    const c = construir(ex.proyecto, { ahora: new Date('2026-06-01T12:00:00Z') })
    const apple = c.resultados.find((r) => r.tienda === 'AppleBooks')
    const dec = new TextDecoder()
    return new Map(
      Object.entries(unzipSync(apple?.bytes ?? new Uint8Array()))
        // La hoja de estilos lleva comentarios en español, que el lector no ve.
        .filter(([ruta]) => /\.(xhtml|opf|ncx)$/u.test(ruta))
        .map(([ruta, datos]) => [ruta, dec.decode(datos)]),
    )
  }

  const ESPAÑOL = [
    'Índice', 'Comienzo', 'Guía', 'Portada', 'Contraportada', 'Lámina a color', 'Publicado por',
    'Edición digital', 'Dedicatoria', 'Epígrafe', 'Ilustración', 'Novela con', 'Derechos', 'derechos reservados',
  ]

  it('ni un texto del motor en español', () => {
    const archivos = libro('en')
    for (const [ruta, texto] of archivos) {
      for (const palabra of ESPAÑOL) expect(texto, `${ruta} dice «${palabra}»`).not.toContain(palabra)
    }
    const todo = [...archivos.values()].join('\n')
    for (const ingles of ['Contents', 'Start', 'Cover of The Lighthouse', 'Back cover', 'Color plate 1', 'Published by Small Press', 'Digital edition, 2026', 'Dedication', 'Epigraph', 'alt="Illustration"', 'Illustration · Dawn', 'Novel with chapter navigation.', 'All rights reserved']) {
      expect(todo, ingles).toContain(ingles)
    }
  })

  it('y en español sigue diciendo lo mismo de siempre (los golden tests lo fijan byte a byte)', () => {
    const todo = [...libro('es').values()].join('\n')
    for (const palabra of ['Índice', 'Publicado por Small Press', 'Edición digital, 2026', 'Lámina a color 1']) expect(todo).toContain(palabra)
  })
})

describe('la linea de derechos que se propone cambia con el idioma', () => {
  const nuevo = () => reducir(ESTADO_INICIAL, { tipo: 'nuevoProyecto', id: 'p', capitulo: 'c', bloque: 'b' })

  it('si el autor no la ha tocado', () => {
    const e = reducir(nuevo(), { tipo: 'dato', campo: 'idioma', valor: 'en', ahora: 0 })
    expect(e.proyecto?.datos.derechos).toBe('© {año} {autor}. All rights reserved.')
    const vuelta = reducir(e, { tipo: 'dato', campo: 'idioma', valor: 'es', ahora: 0 })
    expect(vuelta.proyecto?.datos.derechos).toBe('© {año} {autor}. Todos los derechos reservados.')
  })

  it('pero si la escribio el, no se toca', () => {
    let e = reducir(nuevo(), { tipo: 'dato', campo: 'derechos', valor: '© {año} Ann. Licencia CC BY.', ahora: 0 })
    e = reducir(e, { tipo: 'dato', campo: 'idioma', valor: 'en', ahora: 0 })
    expect(e.proyecto?.datos.derechos).toBe('© {año} Ann. Licencia CC BY.')
  })
})
