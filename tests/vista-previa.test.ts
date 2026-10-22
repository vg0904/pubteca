import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { correrMotor } from '../src/app/motor'
import { abrirEpub, documentoDePagina, MARCA_VISTA_PREVIA, resolver, TEMAS, type Tema } from '../src/app/vista-previa'
import { leerProyecto } from '../scripts/leer-proyecto'

/**
 * La vista previa pinta el XHTML y el CSS REALES del EPUB generado. Lo que se
 * prueba: que abre las paginas en el orden de lectura, que lo que el iframe no
 * puede resolver (la hoja de estilos, las imagenes, las fuentes) queda
 * resuelto, y que nada de la vista previa se cuela en el libro.
 */

const r = correrMotor({ proyecto: leerProyecto(`${import.meta.dirname}/fixtures/libro-prueba`), ahora: Date.parse('2026-01-01T12:00:00Z') })
const kindle = r.resultados.find((x) => x.tienda === 'Kindle')?.bytes as Uint8Array
const apple = r.resultados.find((x) => x.tienda === 'AppleBooks')?.bytes as Uint8Array
const url = (ruta: string): string => `blob:prueba/${ruta}`

describe('abrir el EPUB', () => {
  it('las paginas en el orden de lectura del OPF, con su titulo', () => {
    const epub = abrirEpub(apple)
    const opf = new TextDecoder().decode(unzipSync(apple)['OEBPS/content.opf'])
    const espina = [...opf.matchAll(/idref="([^"]+)"/gu)].map((m) => m[1])
    expect(epub.paginas).toHaveLength(espina.length)
    expect(epub.paginas[0]).toEqual({ ruta: 'OEBPS/texto/portada.xhtml', titulo: 'Portada' })
    expect(epub.paginas.map((p) => p.titulo)).toContain('Índice')
    expect(epub.paginas.some((p) => p.titulo.includes('La luz que no tocaba'))).toBe(true)
  })

  it('Kindle no lleva la pagina de portada; Apple si: la vista previa enseña lo que hay', () => {
    expect(abrirEpub(kindle).paginas[0]?.ruta).not.toBe('OEBPS/texto/portada.xhtml')
  })

  it('resuelve las rutas relativas como un lector', () => {
    expect(resolver('OEBPS/texto/cap01.xhtml', '../estilos/estilo.css')).toBe('OEBPS/estilos/estilo.css')
    expect(resolver('OEBPS/estilos/estilo.css', '../fuentes/A.ttf')).toBe('OEBPS/fuentes/A.ttf')
    expect(resolver('OEBPS/content.opf', 'texto/nav.xhtml')).toBe('OEBPS/texto/nav.xhtml')
  })
})

describe('una pagina, lista para el iframe', () => {
  const epub = abrirEpub(apple)
  const cap = epub.paginas.find((p) => p.titulo.includes('La luz que no tocaba'))?.ruta as string
  const lamina = epub.paginas.find((p) => /ilus\d+\.xhtml$/u.test(p.ruta))?.ruta as string

  it('la hoja de estilos del libro, incrustada: el iframe no resuelve rutas', () => {
    const doc = documentoDePagina(epub, cap, url, 'claro')
    expect(doc).not.toMatch(/<link\b[^>]*\.css/u)
    expect(doc).toContain('div.cabecera')
  })

  it('las fuentes del libro, apuntando a la URL que da quien llama', () => {
    const doc = documentoDePagina(epub, cap, url, 'claro')
    expect(doc).toMatch(/url\("blob:prueba\/OEBPS\/fuentes\/librebaskerville-regular\.ttf"\)/u)
  })

  it('las imagenes tambien', () => {
    const doc = documentoDePagina(epub, lamina, url, 'claro')
    expect(doc).toMatch(/src="blob:prueba\/OEBPS\/imagenes\/[^"]+\.(png|jpg)"/u)
    expect(doc).not.toMatch(/src="\.\.\//u)
  })

  for (const tema of Object.keys(TEMAS) as Tema[]) {
    it(`tema ${tema}: va el ULTIMO, para que mande`, () => {
      const doc = documentoDePagina(epub, cap, url, tema)
      expect(doc.lastIndexOf(TEMAS[tema])).toBeGreaterThan(doc.lastIndexOf('div.cabecera'))
      expect(doc.indexOf(TEMAS[tema])).toBeLessThan(doc.indexOf('</head>'))
    })
  }

  it('el texto del capitulo esta, tal cual sale en el EPUB', () => {
    const original = new TextDecoder().decode(unzipSync(apple)[cap])
    const cuerpo = /<body[\s\S]*<\/body>/u.exec(original)?.[0] as string
    expect(documentoDePagina(epub, cap, url, 'sepia')).toContain(cuerpo)
  })
})

describe('nada de la vista previa entra al libro', () => {
  it('ni la hoja de los temas ni las URL de la vista previa', () => {
    const epub = abrirEpub(apple)
    for (const p of epub.paginas) documentoDePagina(epub, p.ruta, url, 'oscuro')
    for (const [ruta, datos] of Object.entries(unzipSync(apple))) {
      const texto = new TextDecoder().decode(datos)
      expect(texto, ruta).not.toContain(MARCA_VISTA_PREVIA)
      expect(texto, ruta).not.toContain('blob:')
    }
  })

  it('y abrir el EPUB no cambia un byte de lo que se descarga', () => {
    const copia = apple.slice()
    const epub = abrirEpub(apple)
    documentoDePagina(epub, epub.paginas[1]?.ruta as string, url, 'oscuro')
    expect(apple).toEqual(copia)
  })
})
