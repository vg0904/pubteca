/**
 * La vista previa: el EPUB que se acaba de generar, abierto pagina a pagina.
 *
 * No es una imitacion del libro: es el XHTML y el CSS REALES del EPUB, los
 * mismos bytes que se descargan. Por eso no hace falta epub.js (y esta
 * abandonado): la app genera el XHTML, asi que la previsualizacion fiel es ese
 * mismo XHTML en un iframe.
 *
 * Dos cuidados, los dos SOLO en la copia que se pinta, nunca en el EPUB:
 *   - un iframe con `srcdoc` no resuelve rutas relativas, asi que la hoja de
 *     estilos se incrusta y las imagenes y las fuentes apuntan a URLs que da
 *     quien llama (en el navegador, `blob:`);
 *   - los temas (claro, sepia, oscuro) son una hoja aparte que se añade al
 *     final. El CSS del libro no fija fondo ni color de texto a proposito (lo
 *     vigila un test), para que los temas del lector funcionen: aqui se ve.
 */
import { unzipSync } from 'fflate'

export interface PaginaPrevia {
  /** La ruta dentro del EPUB: `OEBPS/texto/cap01.xhtml`. */
  readonly ruta: string
  readonly titulo: string
}

export interface EpubAbierto {
  /** En el orden de lectura (la espina del OPF). */
  readonly paginas: readonly PaginaPrevia[]
  readonly archivos: ReadonlyMap<string, Uint8Array>
}

export type Tema = 'claro' | 'sepia' | 'oscuro'

/**
 * Como se ve cada tema. Aproximado a propósito: lo que importa es comprobar
 * que el libro se lee con cualquier fondo, no clavar el de cada lector.
 */
export const TEMAS: Readonly<Record<Tema, string>> = {
  claro: 'html { background: #ffffff; } body { color: #1b1b1b; }',
  sepia: 'html { background: #f5eddc; } body { color: #4a3a28; }',
  oscuro: 'html { background: #121212; } body { color: #e4dfd6; }',
}

/** Marca de la hoja de la vista previa, para poder comprobar que nunca entra al EPUB. */
export const MARCA_VISTA_PREVIA = '/* pubteca: vista previa */'

/** Lo que la vista previa añade: el tema y unos margenes como los de un lector. */
function hojaDeVistaPrevia(tema: Tema): string {
  return `${MARCA_VISTA_PREVIA}\nbody { margin: 0 auto; padding: 1.4em 1.3em; max-width: 34em; }\n${TEMAS[tema]}`
}

const utf8 = (b: Uint8Array | undefined): string => (b ? new TextDecoder('utf-8').decode(b) : '')

/** `../estilos/estilo.css` desde `OEBPS/texto/cap01.xhtml` -> `OEBPS/estilos/estilo.css`. */
export function resolver(desde: string, relativa: string): string {
  const partes = desde.split('/').slice(0, -1)
  for (const trozo of relativa.split('/')) {
    if (trozo === '..') partes.pop()
    else if (trozo !== '.' && trozo !== '') partes.push(trozo)
  }
  return partes.join('/')
}

function desescaparXml(s: string): string {
  return s
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;/gu, "'")
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, '&')
}

/** Abre el EPUB y saca las paginas en el orden de lectura. */
export function abrirEpub(bytes: Uint8Array): EpubAbierto {
  const archivos = new Map(Object.entries(unzipSync(bytes)))
  // Donde esta el OPF lo dice container.xml.
  const contenedor = utf8(archivos.get('META-INF/container.xml'))
  const rutaOpf = /full-path="([^"]+)"/u.exec(contenedor)?.[1] ?? 'OEBPS/content.opf'
  const opf = utf8(archivos.get(rutaOpf))
  const porId = new Map<string, string>()
  for (const m of opf.matchAll(/<item\b[^>]*>/gu)) {
    const id = /\bid="([^"]+)"/u.exec(m[0])?.[1]
    const href = /\bhref="([^"]+)"/u.exec(m[0])?.[1]
    if (id && href) porId.set(id, resolver(rutaOpf, desescaparXml(href)))
  }
  const paginas: PaginaPrevia[] = []
  for (const m of opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/gu)) {
    const ruta = porId.get(m[1] as string)
    if (!ruta || !archivos.has(ruta)) continue
    const titulo = /<title>([\s\S]*?)<\/title>/u.exec(utf8(archivos.get(ruta)))?.[1] ?? ruta
    paginas.push({ ruta, titulo: desescaparXml(titulo).trim() })
  }
  return { paginas, archivos }
}

/**
 * Una pagina, lista para el `srcdoc` de un iframe.
 *
 * `url` da la direccion de un archivo del EPUB (una imagen, una fuente): en el
 * navegador, una URL `blob:` que crea y suelta quien llama.
 */
export function documentoDePagina(epub: EpubAbierto, ruta: string, url: (ruta: string) => string, tema: Tema): string {
  let html = utf8(epub.archivos.get(ruta))
  // La hoja de estilos, incrustada, con sus fuentes apuntando a `url`.
  html = html.replace(/<link\b[^>]*\bhref="([^"]+\.css)"[^>]*\/?>/gu, (_m, href: string) => {
    const rutaCss = resolver(ruta, href)
    const css = utf8(epub.archivos.get(rutaCss)).replace(/url\("([^"]+)"\)/gu, (_n, f: string) => `url("${url(resolver(rutaCss, f))}")`)
    return `<style>\n${css}\n</style>`
  })
  // Las imagenes.
  html = html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gu, (_m, antes: string, src: string, despues: string) =>
    /^[a-z]+:/u.test(src) ? `${antes}${src}${despues}` : `${antes}${url(resolver(ruta, src))}${despues}`,
  )
  // El tema, el ULTIMO, para que mande sobre lo demas.
  const hoja = `<style>\n${hojaDeVistaPrevia(tema)}\n</style>`
  return html.includes('</head>') ? html.replace('</head>', `${hoja}\n</head>`) : `${hoja}\n${html}`
}

/** El tipo de un archivo del EPUB, para la URL `blob:`. */
export function tipoDe(ruta: string): string {
  const ext = ruta.slice(ruta.lastIndexOf('.') + 1).toLowerCase()
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', ttf: 'font/ttf', otf: 'font/otf', css: 'text/css' } as Record<string, string>)[ext] ?? 'application/octet-stream'
}
