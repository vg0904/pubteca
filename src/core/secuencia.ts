/**
 * Agrupa los bloques en tramos. Port de generar_epub.py 398-441.
 *
 * Un tramo es o un trozo de texto (que acabara en un XHTML) o una ilustracion
 * (que ocupa su propia pagina). Aqui se decide DONDE se parte el capitulo, que
 * es lo que garantiza el salto de pagina en todos los lectores.
 */
import { esc } from './texto'
import type { Bloque } from './parser'

export type Tramo =
  | {
      readonly tipo: 'texto'
      readonly lineas: readonly string[]
      /**
       * Los audios y videos del tramo, con la linea que ocupan. Solo aparece
       * cuando hay alguno, asi que un libro sin medios produce exactamente los
       * mismos tramos que el Python.
       */
      readonly medios?: readonly MedioEnTramo[]
    }
  | { readonly tipo: 'ilus'; readonly nombre: string; readonly alt: string }

/** Lo que el libro decide de un medio: su HTML, su id y su entrada en el indice. */
export interface MedioResuelto {
  readonly html: string
  readonly id: string
  readonly entrada: string
}

export interface MedioEnTramo extends MedioResuelto {
  /** El indice de su linea en `lineas`. */
  readonly linea: number
}

/** Quien sabe donde esta cada archivo. null si no esta: el medio no se pinta. */
export type ResolverMedio = (b: Extract<Bloque, { tipo: 'medio' }>) => MedioResuelto | null

/**
 * Un audio o un video va DENTRO del tramo de texto, en su propia linea: no
 * parte el capitulo como una ilustracion, porque no ocupa una pagina (se
 * reproduce donde esta, como un parrafo). Y como la ilustracion, NO reinicia
 * el parrafo `primero`: el texto de despues sigue el mismo hilo. Asi la
 * version de Kindle, que es la misma sin los medios, no cambia ni una clase.
 *
 * Sin `medio`, los medios se ignoran.
 */
export function secuencia(bloques: readonly Bloque[], separador: string, medio?: ResolverMedio): Tramo[] {
  const tramos: Tramo[] = []
  let actual: string[] = []
  let medios: MedioEnTramo[] = []
  const cerrarTexto = (): void => {
    if (actual.length > 0) tramos.push(medios.length > 0 ? { tipo: 'texto', lineas: actual, medios } : { tipo: 'texto', lineas: actual })
    actual = []
    medios = []
  }
  let primero = true
  let versos: string[] | null = null
  let nuevaEstrofa = false

  const cerrarVersos = (): void => {
    if (versos && versos.length > 0) {
      actual.push(`<div class="versos">\n${versos.join('\n')}\n</div>`)
    }
    versos = null
  }

  for (const b of bloques) {
    // Cerrar versos ANTES de cualquier otro bloque: asi un bloque de versos
    // seguido de una ilustracion queda dentro del tramo de texto anterior.
    if (b.tipo !== 'verso' && b.tipo !== 'estrofa') cerrarVersos()

    switch (b.tipo) {
      case 'ilus':
        cerrarTexto()
        tramos.push({ tipo: 'ilus', nombre: b.nombre, alt: b.alt })
        break
      case 'medio': {
        const r = medio?.(b)
        if (r) {
          medios.push({ ...r, linea: actual.length })
          actual.push(r.html)
        }
        break
      }
      case 'escena':
        actual.push(`<p class="escena">${esc(separador)}</p>`)
        primero = true
        break
      case 'sub':
        actual.push(`<h2 class="subtitulo">${b.html}</h2>`)
        primero = true
        break
      case 'estrofa':
        nuevaEstrofa = true
        break
      case 'verso': {
        if (versos === null) {
          versos = []
          nuevaEstrofa = false
        }
        const clase = nuevaEstrofa && versos.length > 0 ? ' class="estrofa"' : ''
        versos.push(`<p${clase}>${b.html}</p>`)
        nuevaEstrofa = false
        primero = true
        break
      }
      case 'p': {
        const clase = primero ? ' class="primero"' : ''
        actual.push(`<p${clase}>${b.html}</p>`)
        primero = false
        break
      }
    }
  }

  cerrarVersos()
  cerrarTexto()
  return tramos
}
