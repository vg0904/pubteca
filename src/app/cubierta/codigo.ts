/**
 * El codigo de barras en la pantalla: la muestra cuando la caja queda libre,
 * y el codigo suelto (SVG y PNG a 300 ppi) para quien monta la cubierta en
 * otro programa. Puro salvo el PNG, que pinta la pantalla con `pintarSueltas`.
 *
 * La muestra solo existe en pantalla: no esta en `CubiertaCompuesta.ops`, asi
 * que ni el PDF ni el PNG de la cubierta la pueden llevar. Va en gris, sin
 * cifras debajo y con un rotulo encima, y sus barras son las de un numero con
 * el digito de control mal: ningun lector la aceptaria aunque se imprimiera.
 */
import { CAJA_CODIGO, type Caja, type CubiertaCompuesta, type FuentesCubierta, type OpCubierta } from '../../core/impreso/cubierta'
import { componerCodigo, svgDelCodigo } from '../../core/impreso/codigo'
import { cifrasDeIsbn, isbnLegible } from '../../core/impreso/ean13'

/** 978 y nueve ceros: su control seria un 2, no un 0. */
export const CIFRAS_MUESTRA = '9780000000000'
/** El gris de la muestra: se ve que esta, y que no es el de verdad. */
export const GRIS_MUESTRA = 0.5

/** La muestra del codigo en la caja libre, o nada si la cubierta ya lleva el suyo. */
export function muestraDelCodigo(c: CubiertaCompuesta, rotulos: { readonly sinIsbn: string; readonly kdp: string }, f: FuentesCubierta): readonly OpCubierta[] {
  if (!c.avisos.some((a) => a.codigo === 'codigoKdp')) return []
  const arriba = c.avisos.some((a) => a.codigo === 'codigoSinIsbn') ? rotulos.sinIsbn : rotulos.kdp
  return componerCodigo(c.codigo, { cifras: CIFRAS_MUESTRA, arriba, conCifras: false, gris: GRIS_MUESTRA }, f)
}

export interface CodigoSuelto {
  /** La caja, en el origen: 50,8 × 30,5 mm (la que pide KDP), con la zona de silencio dentro. */
  readonly caja: Caja
  readonly ops: readonly OpCubierta[]
  readonly cifras: string
  readonly svg: string
}

/** El codigo de un ISBN suelto, o null si el ISBN no vale. */
export function codigoSuelto(isbn: string, f: FuentesCubierta): CodigoSuelto | null {
  const cifras = cifrasDeIsbn(isbn)
  if (!cifras) return null
  const caja = { x: 0, y: 0, ancho: CAJA_CODIGO.ancho, alto: CAJA_CODIGO.alto }
  const arriba = isbnLegible(isbn, cifras)
  const ops = componerCodigo(caja, { cifras, arriba, conCifras: true, gris: 0 }, f)
  return { caja, ops, cifras, svg: svgDelCodigo(ops, caja, f, arriba) }
}
