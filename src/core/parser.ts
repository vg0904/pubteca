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
 * DIVERGENCIA, y es la que hace posible que la interfaz grafica no pierda nada:
 * el Python clasifica la linea sobre su version DESESCAPADA, asi que escapar un
 * marcador de BLOQUE no lo desactiva. `\> cita` acaba siendo un verso con una
 * barra invertida impresa, `\# algo` un subtitulo con una almohadilla
 * impresa, y `\[ilustracion: x | y\]` inserta la ilustracion. El escritor
 * sigue la documentacion, escapa, y acaba con basura en su libro. Verificado
 * contra el script de referencia.
 *
 * Aqui se clasifica sobre la linea ORIGINAL, asi que el escape si desactiva el
 * marcador. Los grupos capturados de la marca de ilustracion si se desescapan,
 * para que el nombre y la descripcion salgan limpios como en el Python.
 *
 * Esto importa para la app: su modelo de bloques se serializa al dialecto de
 * Markdown para alimentar al motor y para el .zip del proyecto, y un parrafo
 * que empiece por `>`, `#` o `* * *` tiene que poder escaparse o se convertiria
 * en otro tipo de bloque al volver a leerlo.
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
    const m = RE_ILUS.exec(linea)
    const nombre = m ? desescapar(m[1] as string) : ''
    const alt = m ? desescapar(m[2] ?? '').trim() : ''

    if (conTitulo && titulo === null) {
      if (m) antes.push({ nombre, alt })
      else titulo = limpiarTitulo(linea)
      continue
    }

    if (m) {
      bloques.push({ tipo: 'ilus', nombre, alt })
    } else if (RE_ESCENA.exec(linea)) {
      bloques.push({ tipo: 'escena' })
    } else if (linea.startsWith('>')) {
      const contenido = linea.replace(/^>\s?/u, '').trim()
      bloques.push(contenido ? { tipo: 'verso', html: enLinea(contenido) } : { tipo: 'estrofa' })
    } else if (linea.startsWith('#')) {
      bloques.push({ tipo: 'sub', html: enLinea(linea.replace(/^#+/u, '').trim()) })
    } else {
      bloques.push({ tipo: 'p', html: enLinea(linea) })
    }
  }

  return { titulo, antes, bloques }
}
