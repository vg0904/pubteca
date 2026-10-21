// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { construir } from '../src/core/construir'
import { exportar } from '../src/app/exportar'
import { importarDocx } from '../src/app/importar/docx'
import { capituloDesdeDialecto } from '../src/app/importar/dialecto'
import { DATOS_POR_DEFECTO, type Bloque, type Proyecto } from '../src/app/modelo'
import { bloquesDePegado } from '../src/app/pegar'

/**
 * Un caracter de control en el texto dejaba el XHTML invalido, y la tienda
 * rechaza un EPUB asi. Llegan al copiar de un PDF, y podian entrar por TODAS
 * las vias: escribir, pegar, un Word, un `.md` y los datos del libro. Estos
 * tests meten uno por cada via y miran los dos EPUB enteros.
 */

const NO_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/u
const SUCIO = 'a\u0001b\u0000c￾d\u001ee'

/** Las entradas de texto de un EPUB que llevan algo que XML no admite. */
function sucias(epub: Uint8Array): string[] {
  const dec = new TextDecoder()
  return Object.entries(unzipSync(epub))
    .filter(([ruta]) => /\.(xhtml|opf|ncx|xml)$/u.test(ruta))
    .filter(([, datos]) => NO_XML.test(dec.decode(datos)))
    .map(([ruta]) => ruta)
}

const p = (id: string, texto: string): Bloque => ({ id, tipo: 'parrafo', tramos: [{ texto, marcas: [] }] })

let n = 0
const nuevoId = (prefijo: string): string => `${prefijo}-${++n}`

describe('ningun caracter que XML no admite llega al EPUB', () => {
  it('desde el modelo, aunque lo lleve dentro (un libro guardado antes del arreglo)', () => {
    const proyecto: Proyecto = {
      id: 'x',
      version: 1,
      datos: {
        ...DATOS_POR_DEFECTO,
        titulo: `Titulo ${SUCIO}`,
        autor: `Autora ${SUCIO}`,
        sello: SUCIO,
        descripcion: SUCIO,
        derechos: `© {año} {autor} ${SUCIO}`,
      },
      capitulos: [
        {
          id: 'c',
          etiqueta: 'Capítulo 1',
          titulo: [{ texto: `Uno ${SUCIO}`, marcas: ['cursiva'] }, { texto: ' fin', marcas: [] }],
          aperturas: [],
          bloques: [
            p('p1', `Parrafo ${SUCIO}`),
            { id: 's', tipo: 'subtitulo', tramos: [{ texto: SUCIO, marcas: ['negrita'] }] },
            { id: 'v', tipo: 'versos', estrofas: [[{ texto: `verso ${SUCIO}`, marcas: [] }]] },
            // U+001E en la descripcion partia la MARCA de la ilustracion en dos
            // lineas: la ilustracion desaparecia y quedaba basura impresa.
            { id: 'i', tipo: 'ilustracion', imagenId: 'img', alt: `dibujo ${SUCIO}`, decorativa: false },
          ],
        },
      ],
      extras: [
        { id: 'e', donde: 'final', tipo: 'conTitulo', titulo: [{ texto: `Nota ${SUCIO}`, marcas: [] }], bloques: [p('p2', SUCIO)], nombreArchivo: 'nota' },
      ],
      laminas: [],
      portada: {},
    }
    const png = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', 'imagenes', 'buena.png')))
    const ex = exportar(
      proyecto,
      new Map([['img', { id: 'img', nombreOriginal: 'd.png', tipo: 'png', bytes: png.length, ancho: 1600, alto: 2400 }]]),
      new Map([['img', png]]),
    )
    // El serializador comprueba cada linea contra el motor: si los dos lados no
    // quitaran lo mismo, avisaria de un enfasis roto que no existe.
    expect(ex.avisos).toEqual([])
    const c = construir(ex.proyecto, { ahora: new Date('2026-01-01T12:00:00Z') })
    expect(c.bloqueado).toBeNull()
    for (const r of c.resultados) {
      expect(sucias(r.bytes), r.tienda).toEqual([])
      // Y el texto del autor sigue ahi, sin los caracteres, y el U+001E no
      // parte el parrafo en dos: es un espacio.
      const cap = new TextDecoder().decode(unzipSync(r.bytes)['OEBPS/texto/cap01.xhtml'])
      expect(cap).toContain('Parrafo abcd e</p>')
      const lamina = new TextDecoder().decode(unzipSync(r.bytes)['OEBPS/texto/cap01-ilus01.xhtml'])
      expect(lamina).toContain('alt="dibujo abcd e"')
    }
  })

  it('al pegar: tambien los parrafos del medio, que no pasan por el editor', () => {
    const bloques = bloquesDePegado('', `uno ${SUCIO}\n\ndos ${SUCIO}\n\ntres ${SUCIO}`, () => 'b')
    expect(bloques).toHaveLength(3)
    for (const b of bloques) {
      expect(b.tipo === 'parrafo' && b.tramos.map((t) => t.texto).join('')).not.toMatch(NO_XML)
    }
  })

  it('al pegar HTML desde un procesador de texto', () => {
    const bloques = bloquesDePegado(`<p>uno ${SUCIO}</p><p>dos <i>${SUCIO}</i></p>`, '', () => 'b')
    expect(JSON.stringify(bloques)).not.toMatch(/\\u000[01]|\\ufffe/u)
    // U+001E es un salto para el motor: va a espacio. Los demas se quitan.
    expect(bloques.map((b) => (b.tipo === 'parrafo' ? b.tramos.map((t) => t.texto).join('') : ''))).toEqual([
      'uno abcd e',
      'dos abcd e',
    ])
  })

  it('desde un .md', () => {
    // Sin U+001E: dentro de un .md parte la linea antes de llegar a ningun
    // filtro, y la marca de la ilustracion ya no seria una marca.
    const sucio = 'a\u0001b\u0000c\ufffed'
    const cap = capituloDesdeDialecto(`[ilustración: x | alt ${sucio}]\nCapítulo 1: T ${sucio}\n\n${sucio}\n\n[ilustración: y | alt ${sucio}]\n`)
    expect(cap?.titulo).toEqual([{ texto: 'T abcd', marcas: [] }])
    expect(cap?.aperturas).toEqual([{ imagenId: 'x', alt: 'alt abcd' }])
    expect(cap?.bloques.map((b) => (b.tipo === 'ilustracion' ? b.alt : b.tipo === 'parrafo' ? b.tramos[0]?.texto : ''))).toEqual([
      'abcd',
      'alt abcd',
    ])
  })

  it('desde un Word', async () => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    const z = zipSync({
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      // Un Word no deberia llevarlos, pero un .docx de otra suite o con el
      // texto pegado de un PDF a veces si: el lector de XML de mammoth los deja
      // pasar.
      'word/document.xml': strToU8(
        `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>a&#x1;b</w:t></w:r></w:p></w:body></w:document>`,
      ),
    })
    const bytes = z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer
    const prop = await importarDocx(bytes, { nombreArchivo: 'x', nuevoId })
    expect(prop.bloques).toEqual([{ id: expect.any(String), tipo: 'parrafo', tramos: [{ texto: 'ab', marcas: [] }] }])
  })
})
