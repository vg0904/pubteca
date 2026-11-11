/**
 * El indice visible. Port de generar_epub.py 825-837.
 *
 * nav.xhtml va en el spine justo antes del primer capitulo, asi que el lector
 * ve un indice de verdad y no solo el menu del aparato. Lleva ademas los
 * `landmarks` ocultos, que son los que usan las tiendas.
 */
import { xhtml } from './plantillas'
import { esc } from './texto'
import { textosLibro } from './textos-libro'

export interface EntradaIndice {
  readonly texto: string
  readonly href: string
  /**
   * Los audios y videos del capitulo. Apple recomienda que el indice tenga
   * entradas que lleven a cada medio. Van ANIDADOS bajo su capitulo y en el
   * orden del libro: puestos al final del indice, EPUBCheck da NAV-011 (el
   * indice tiene que seguir el orden de lectura). Medido en la fase 0.
   */
  readonly hijos?: readonly EntradaIndice[]
}

function item(e: EntradaIndice): string {
  const a = `<a href="${soloNombre(e.href)}">${esc(e.texto)}</a>`
  if (!e.hijos || e.hijos.length === 0) return `<li>${a}</li>`
  return `<li>${a}\n<ol>\n${e.hijos.map(item).join('\n')}\n</ol>\n</li>`
}

/** El nombre de archivo de un href, sin la carpeta. */
function soloNombre(href: string): string {
  return href.slice(href.lastIndexOf('/') + 1)
}

export function nav(
  indice: readonly EntradaIndice[],
  idioma: string,
  conPortada: boolean,
  inicioLectura: string | null,
): string {
  // Los href del indice son SOLO el nombre del archivo, porque nav.xhtml vive
  // en la misma carpeta texto/. El NCX y el guide si llevan la carpeta.
  const items = indice.map(item).join('\n')

  const t = textosLibro(idioma)
  const marcas: string[] = []
  if (conPortada) {
    marcas.push(`<li><a epub:type="cover" href="portada.xhtml">${esc(t.portada)}</a></li>`)
  }
  marcas.push(`<li><a epub:type="toc" href="nav.xhtml#toc">${esc(t.indice)}</a></li>`)
  if (inicioLectura) {
    marcas.push(
      `<li><a epub:type="bodymatter" href="${soloNombre(inicioLectura)}">${esc(t.comienzo)}</a></li>`,
    )
  }

  const cuerpo =
    `<nav epub:type="toc" id="toc" role="doc-toc">\n<h1>${esc(t.indice)}</h1>\n` +
    `<ol class="indice">\n${items}\n</ol>\n</nav>\n` +
    `<nav epub:type="landmarks" hidden="">\n<h2>${esc(t.guia)}</h2>\n<ol>\n` +
    marcas.join('\n') +
    '\n</ol>\n</nav>'

  return xhtml(t.indice, cuerpo, idioma)
}
