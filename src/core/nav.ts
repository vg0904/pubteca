/**
 * El indice visible. Port de generar_epub.py 825-837.
 *
 * nav.xhtml va en el spine justo antes del primer capitulo, asi que el lector
 * ve un indice de verdad y no solo el menu del aparato. Lleva ademas los
 * `landmarks` ocultos, que son los que usan las tiendas.
 */
import { xhtml } from './plantillas'
import { esc } from './texto'

export interface EntradaIndice {
  readonly texto: string
  readonly href: string
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
  const items = indice
    .map((e) => `<li><a href="${soloNombre(e.href)}">${esc(e.texto)}</a></li>`)
    .join('\n')

  const marcas: string[] = []
  if (conPortada) {
    marcas.push('<li><a epub:type="cover" href="portada.xhtml">Portada</a></li>')
  }
  marcas.push('<li><a epub:type="toc" href="nav.xhtml#toc">Índice</a></li>')
  if (inicioLectura) {
    marcas.push(
      `<li><a epub:type="bodymatter" href="${soloNombre(inicioLectura)}">Comienzo</a></li>`,
    )
  }

  const cuerpo =
    `<nav epub:type="toc" id="toc" role="doc-toc">\n<h1>Índice</h1>\n` +
    `<ol class="indice">\n${items}\n</ol>\n</nav>\n` +
    `<nav epub:type="landmarks" hidden="">\n<h2>Guía</h2>\n<ol>\n` +
    marcas.join('\n') +
    '\n</ol>\n</nav>'

  return xhtml('Índice', cuerpo, idioma)
}
