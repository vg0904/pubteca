/**
 * content.opf. Port de generar_epub.py 846-934.
 *
 * Es el archivo con mas detalle literal del EPUB: el orden de los metadatos,
 * de los items del manifiesto y del spine esta congelado, y los golden tests
 * lo comparan completo.
 */
import type { Config } from './config'
import type { Fuente } from './fuentes'
import type { Registro } from './imagenes'
import type { Pagina } from './libro'
import { esc } from './texto'
import { textosLibro } from './textos-libro'

export interface OpfEntrada {
  readonly cfg: Config
  readonly idioma: string
  readonly paginas: readonly Pagina[]
  readonly imagenes: readonly Registro[]
  readonly fuentes: readonly Fuente[]
  readonly portadaImg: Registro | null
  readonly conPortada: boolean
  readonly uid: string
  readonly inicioLectura: string | null
  /** true si TODAS las imagenes llevan descripcion alternativa. */
  readonly todasConAlt: boolean
  /** `dcterms:modified` ya formateado en UTC, sin milisegundos. Se inyecta. */
  readonly ahora: string
}

export function opf(e: OpfEntrada): string {
  const c = e.cfg
  const md: string[] = [
    `<dc:identifier id="bookid">${esc(e.uid)}</dc:identifier>`,
    `<dc:title id="titulo">${esc(c.titulo)}</dc:title>`,
    '<meta refines="#titulo" property="title-type">main</meta>',
  ]

  if (c.subtitulo) {
    md.push(
      `<dc:title id="subtitulo">${esc(c.subtitulo)}</dc:title>`,
      '<meta refines="#subtitulo" property="title-type">subtitle</meta>',
    )
  }

  if (c.autor) {
    md.push(`<dc:creator id="autor">${esc(c.autor)}</dc:creator>`)
    md.push('<meta refines="#autor" property="role" scheme="marc:relators">aut</meta>')
    // `str.split()` de Python parte por rachas de espacios y descarta vacios.
    const partes = c.autor.split(/\s+/u).filter((x) => x !== '')
    if (partes.length >= 2) {
      const apellido = partes[partes.length - 1] as string
      const resto = partes.slice(0, -1).join(' ')
      md.push(`<meta refines="#autor" property="file-as">${esc(`${apellido}, ${resto}`)}</meta>`)
    }
  }

  md.push(`<dc:language>${esc(e.idioma)}</dc:language>`)
  if (c.sello) md.push(`<dc:publisher>${esc(c.sello)}</dc:publisher>`)
  if (c.descripcion) md.push(`<dc:description>${esc(c.descripcion)}</dc:description>`)
  if (c.fecha_publicacion) md.push(`<dc:date>${esc(c.fecha_publicacion)}</dc:date>`)
  md.push(`<meta property="dcterms:modified">${e.ahora}</meta>`)
  if (e.conPortada && e.portadaImg) {
    md.push(`<meta name="cover" content="${e.portadaImg.id}"/>`)
  }

  // Metadatos de accesibilidad. Los pide Apple y los exige la Ley Europea de
  // Accesibilidad, y cambian segun haya o no descripcion en TODAS las imagenes.
  md.push('<meta property="schema:accessMode">textual</meta>')
  if (e.imagenes.length > 0) {
    md.push('<meta property="schema:accessMode">visual</meta>')
    md.push('<meta property="schema:accessModeSufficient">textual,visual</meta>')
    if (e.todasConAlt) {
      md.push('<meta property="schema:accessModeSufficient">textual</meta>')
      md.push('<meta property="schema:accessibilityFeature">alternativeText</meta>')
    }
  } else {
    md.push('<meta property="schema:accessModeSufficient">textual</meta>')
  }
  md.push(
    '<meta property="schema:accessibilityFeature">tableOfContents</meta>',
    '<meta property="schema:accessibilityFeature">readingOrder</meta>',
    '<meta property="schema:accessibilityFeature">structuralNavigation</meta>',
    '<meta property="schema:accessibilityHazard">none</meta>',
  )
  const t = textosLibro(e.idioma)
  let resumen = t.resumenAccesibilidad
  if (e.imagenes.length > 0) resumen += e.todasConAlt ? t.conDescripciones : t.sinDescripciones
  md.push(`<meta property="schema:accessibilitySummary">${esc(resumen)}</meta>`)

  const man: string[] = [
    '<item id="nav" href="texto/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="estilos/estilo.css" media-type="text/css"/>',
  ]
  for (const p of e.paginas) {
    man.push(`<item id="${p.id}" href="${p.href}" media-type="application/xhtml+xml"/>`)
  }
  for (const img of e.imagenes) {
    const prop = e.conPortada && img === e.portadaImg ? ' properties="cover-image"' : ''
    man.push(`<item id="${img.id}" href="${img.href}" media-type="${img.media}"${prop}/>`)
  }
  // Las fuentes solo van en Apple Books.
  for (const f of e.conPortada ? e.fuentes : []) {
    man.push(`<item id="${f.id}" href="${f.href}" media-type="${f.media}"/>`)
  }

  // nav.xhtml entra en el spine justo antes del primer capitulo, para que el
  // lector vea un indice de verdad.
  const spine: string[] = []
  let navPuesto = false
  for (const p of e.paginas) {
    if (p.seccion === 'capitulos' && !navPuesto) {
      spine.push('<itemref idref="nav"/>')
      navPuesto = true
    }
    spine.push(`<itemref idref="${p.id}"/>`)
  }
  if (!navPuesto) spine.push('<itemref idref="nav"/>')

  const guia = [`<reference type="toc" title="${esc(t.indice)}" href="texto/nav.xhtml"/>`]
  if (e.inicioLectura) {
    guia.push(`<reference type="text" title="${esc(t.comienzo)}" href="${e.inicioLectura}"/>`)
  }
  if (e.conPortada && e.portadaImg) {
    guia.unshift(`<reference type="cover" title="${esc(t.portada)}" href="texto/portada.xhtml"/>`)
  }

  const sep = '\n    '
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${esc(e.idioma)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${md.join(sep)}
  </metadata>
  <manifest>
    ${man.join(sep)}
  </manifest>
  <spine toc="ncx">
    ${spine.join(sep)}
  </spine>
  <guide>
    ${guia.join(sep)}
  </guide>
</package>
`
}

/** `dcterms:modified` en UTC, sin milisegundos: EPUBCheck rechaza el formato con ellos. */
export function marcaDeTiempo(fecha: Date): string {
  return fecha.toISOString().replace(/\.\d{3}Z$/u, 'Z')
}
