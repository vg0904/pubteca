/**
 * Parseo de un capitulo o extra. Port de generar_epub.py 320-395.
 */
import { desescapar, enLinea, limpiarTitulo, lineasDe } from './texto'

/**
 * Los seis tipos de bloque del motor. Es TODO lo que el EPUB sabe
 * representar: la interfaz no puede ofrecer nada que no quepa aqui.
 */
export type Bloque =
  | { readonly tipo: 'ilus'; readonly nombre: string; readonly alt: string }
  | { readonly tipo: 'escena' }
  | { readonly tipo: 'verso'; readonly html: string }
  | { readonly tipo: 'estrofa' }
  | { readonly tipo: 'sub'; readonly html: string }
  | { readonly tipo: 'p'; readonly html: string }

export interface Parseado {
  /** null si el archivo esta vacio. */
  readonly titulo: string | null
  /** Ilustraciones marcadas ANTES del titulo: van antes de la cabecera. */
  readonly antes: readonly { readonly nombre: string; readonly alt: string }[]
  readonly bloques: readonly Bloque[]
}

/**
 * Marca de ilustracion. Un solo par de corchetes; el nombre no puede contener
 * `]` ni `|`; la descripcion es opcional y puede estar vacia. Funciona con
 * acento y sin el.
 */
export const RE_ILUS = /^\[\s*ilustraci[oó]n\s*:\s*([^\]|]+?)\s*(?:\|\s*([^\]]*?)\s*)?\]$/iu

/** Cambio de escena: tres o mas de `* - _`, o una linea de simbolos. */
export const RE_ESCENA = /^(?:[*\-_]\s*){3,}$|^[⁂❦✦◆•~]+$/u

/**
 * Cabecera de capitulo. La clase excluyente del numero contiene espacio, `:`,
 * `.`, `-`, EN DASH (U+2013) y EM DASH (U+2014).
 */
export const RE_TITULO =
  /^((?:cap[ií]tulo|cap\.)\s+[^\s:.\-–—]+|pr[oó]logo|ep[ií]logo|interludio)\s*(?:[:.\-–—]\s*(.*))?$/iu

/** Separador que `capitulos()` usa para partir la cabecera del titulo. */
export const RE_SEPARADOR_TITULO = /\s*[:.\-–—]\s*/u

/**
 * Parsea el contenido de un archivo de capitulo o extra.
 *
 * `conTitulo=false` para dedicatoria y epigrafe, que no llevan titulo.
 *
 * Detalle del Python que hay que conservar: la deteccion de `>` y de `#` se
 * hace sobre la linea DESESCAPADA, pero el contenido se toma de la linea
 * ORIGINAL. Por eso `\> cita` no es un verso pero conserva su barra.
 *
 * La primera linea no vacia se consume SIEMPRE como titulo cuando no es una
 * marca de ilustracion, aunque no parezca una cabecera de capitulo.
 */
export function parsear(texto: string, conTitulo = true): Parseado {
  let titulo: string | null = null
  const antes: { nombre: string; alt: string }[] = []
  const bloques: Bloque[] = []

  for (const linea of lineasDe(texto)) {
    if (!linea) continue
    const llano = desescapar(linea)
    const m = RE_ILUS.exec(llano)

    if (conTitulo && titulo === null) {
      if (m) antes.push({ nombre: m[1] as string, alt: (m[2] ?? '').trim() })
      else titulo = limpiarTitulo(linea)
      continue
    }

    if (m) {
      bloques.push({ tipo: 'ilus', nombre: m[1] as string, alt: (m[2] ?? '').trim() })
    } else if (RE_ESCENA.exec(llano)) {
      bloques.push({ tipo: 'escena' })
    } else if (llano.startsWith('>')) {
      const contenido = linea.replace(/^>\s?/u, '').trim()
      bloques.push(contenido ? { tipo: 'verso', html: enLinea(contenido) } : { tipo: 'estrofa' })
    } else if (llano.startsWith('#')) {
      bloques.push({ tipo: 'sub', html: enLinea(linea.replace(/^#+/u, '').trim()) })
    } else {
      bloques.push({ tipo: 'p', html: enLinea(linea) })
    }
  }

  return { titulo, antes, bloques }
}
