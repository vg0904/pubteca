/**
 * Lo que le pasa a un ISBN, dicho al autor: la forma, el prefijo de los libros
 * (978 o 979) o el digito de control. Lo usan «Libro impreso» y «Cubierta».
 */
import { revisarIsbn } from '../core/impreso/ean13'

export interface TextosIsbn {
  readonly forma: string
  readonly prefijo: string
  readonly control: (esperado: string) => string
}

/** La frase de lo que falla, o null si el ISBN vale o no hay. */
export function motivoIsbn(isbn: string, t: TextosIsbn): string | null {
  const r = revisarIsbn(isbn)
  switch (r.estado) {
    case 'vacio':
    case 'bien':
      return null
    case 'forma':
      return t.forma
    case 'prefijo':
      return t.prefijo
    case 'control':
      return t.control(r.esperado)
  }
}
