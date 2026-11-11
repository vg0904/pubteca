/**
 * Las letras del libro impreso: una lista corta de serifas de libro con
 * licencia OFL, las cuatro caras de cada una, estaticas y recortadas a los
 * alfabetos latinos (las genera scripts/impreso-recursos.py, que tiene la misma
 * lista). La app las trae de `public/fuentes/impreso/` con `fetch` cuando el
 * autor elige una; el core no carga nada.
 *
 * Cada una trae su cuerpo e interlineado recomendados: los que dan una linea
 * de unos 60 a 70 caracteres en 6 × 9 in con los margenes por defecto, que es
 * lo que se midio en la fase 0. Las letras tienen ojos muy distintos (a 10 pt
 * la Libre Baskerville parece mayor que la EB Garamond a 11,5), asi que un
 * mismo cuerpo para todas daria libros muy distintos.
 */
import type { Cara } from './tipos'

export interface Familia {
  readonly id: string
  readonly nombre: string
  /** El principio del nombre de sus archivos: `SourceSerif4-Regular.ttf`. */
  readonly prefijo: string
  /** Cuerpo recomendado, en puntos. */
  readonly cuerpo: number
  /** Interlineado recomendado, en % del cuerpo. */
  readonly interlineado: number
}

export const FAMILIAS: readonly Familia[] = [
  { id: 'source-serif-4', nombre: 'Source Serif 4', prefijo: 'SourceSerif4', cuerpo: 10.5, interlineado: 138 },
  { id: 'eb-garamond', nombre: 'EB Garamond', prefijo: 'EBGaramond', cuerpo: 11.5, interlineado: 126 },
  { id: 'literata', nombre: 'Literata', prefijo: 'Literata', cuerpo: 10, interlineado: 140 },
  { id: 'crimson-pro', nombre: 'Crimson Pro', prefijo: 'CrimsonPro', cuerpo: 11.5, interlineado: 126 },
  { id: 'alegreya', nombre: 'Alegreya', prefijo: 'Alegreya', cuerpo: 11, interlineado: 130 },
  { id: 'libre-baskerville', nombre: 'Libre Baskerville', prefijo: 'LibreBaskerville', cuerpo: 9.5, interlineado: 145 },
]

export const FAMILIA_POR_DEFECTO = 'source-serif-4'

/** La familia con ese id; si no se conoce, la de por defecto. */
export function familia(id: string): Familia {
  return FAMILIAS.find((f) => f.id === id) ?? (FAMILIAS[0] as Familia)
}

const SUFIJOS: Readonly<Record<Cara, string>> = { regular: 'Regular', cursiva: 'Italic', negrita: 'Bold', negritaCursiva: 'BoldItalic' }

/** Los archivos de sus cuatro caras, dentro de `public/fuentes/impreso/`. */
export function archivosDe(f: Familia): Readonly<Record<Cara, string>> {
  return {
    regular: `${f.prefijo}-${SUFIJOS.regular}.ttf`,
    cursiva: `${f.prefijo}-${SUFIJOS.cursiva}.ttf`,
    negrita: `${f.prefijo}-${SUFIJOS.negrita}.ttf`,
    negritaCursiva: `${f.prefijo}-${SUFIJOS.negritaCursiva}.ttf`,
  }
}
