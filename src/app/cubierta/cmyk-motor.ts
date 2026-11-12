/**
 * Separar el fondo de la cubierta en CMYK y dejarlo listo para el PDF (los
 * filtros de PNG y zlib). Es lo unico de la cubierta que tarda: unos segundos
 * a 300 ppi. Lo usan el hilo (cmyk.worker.ts) y, si el hilo no se puede abrir,
 * la pagina. Sincrono y sin DOM: se prueba en Node.
 */
import { separacion, separarFilas, type Separacion } from '../../core/impreso/color'
import type { Perfil } from '../../core/impreso/icc'
import { comprimirCmyk } from '../../core/impreso/pdf-cubierta'

const separaciones = new WeakMap<Perfil, Map<number, Separacion>>()

/** La separacion de un perfil con un limite de tinta, hecha una vez. */
export function separacionDe(p: Perfil, limite: number): Separacion {
  let m = separaciones.get(p)
  if (!m) separaciones.set(p, (m = new Map()))
  let s = m.get(limite)
  if (!s) m.set(limite, (s = separacion(p, limite)))
  return s
}

/** RGBA (el del lienzo) → CMYK de 8 bits → filtros de PNG y zlib, como lo lee el PDF. */
export function separarYComprimir(p: Perfil, rgba: Uint8Array | Uint8ClampedArray, ancho: number, alto: number, limite: number): Uint8Array {
  const cmyk = new Uint8Array(ancho * alto * 4)
  separarFilas(separacionDe(p, limite), rgba, ancho, 0, alto, cmyk)
  return comprimirCmyk(cmyk, ancho, alto)
}
