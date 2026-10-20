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
  | { readonly tipo: 'texto'; readonly lineas: readonly string[] }
  | { readonly tipo: 'ilus'; readonly nombre: string; readonly alt: string }

export function secuencia(bloques: readonly Bloque[], separador: string): Tramo[] {
  const tramos: Tramo[] = []
  let actual: string[] = []
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
        if (actual.length > 0) {
          tramos.push({ tipo: 'texto', lineas: actual })
          actual = []
        }
        tramos.push({ tipo: 'ilus', nombre: b.nombre, alt: b.alt })
        break
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
  if (actual.length > 0) tramos.push({ tipo: 'texto', lineas: actual })
  return tramos
}
