/**
 * El codigo de barras EAN-13 de un ISBN, en vectores: 95 modulos, cada uno
 * negro o blanco, que la cubierta pinta como rectangulos.
 *
 * Las tablas son las de la norma (ISO/IEC 15420, GS1): el primer digito no se
 * dibuja, decide si cada uno de los seis siguientes va con el juego L o el G;
 * los seis ultimos van con el R. Guardas 101 a los lados y 01010 en medio.
 *
 * Un ISBN-10 se pasa a 13 con el prefijo 978 y su nuevo digito de control,
 * que es lo que hace la agencia del ISBN: el codigo de un libro es siempre de
 * 13 cifras.
 */

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
/** Que juego (L o G) lleva cada digito de la izquierda, segun el primero. */
const PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** El digito de control de los doce primeros. */
export function controlEan(doce: string): number {
  const suma = [...doce].reduce((n, ch, i) => n + Number(ch) * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (suma % 10)) % 10
}

/** Las 13 cifras del codigo de un ISBN (13, o 10 pasado a 13), o null si no es valido. */
export function cifrasDeIsbn(isbn: string): string | null {
  const s = isbn.replace(/[\s-]/gu, '').toUpperCase()
  if (/^\d{13}$/u.test(s)) return controlEan(s.slice(0, 12)) === Number(s[12]) ? s : null
  if (/^\d{9}[\dX]$/u.test(s)) {
    const suma = [...s].reduce((n, ch, i) => n + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0)
    if (suma % 11 !== 0) return null
    const doce = `978${s.slice(0, 9)}`
    return doce + String(controlEan(doce))
  }
  return null
}

/** Los 95 modulos del codigo: true es barra. */
export function modulosEan13(cifras: string): boolean[] {
  if (!/^\d{13}$/u.test(cifras)) throw new Error(`Un EAN-13 son trece cifras: «${cifras}».`)
  const d = [...cifras].map(Number)
  const paridad = PARIDAD[d[0] as number] as string
  let bits = '101'
  for (let i = 1; i <= 6; i++) bits += (paridad[i - 1] === 'L' ? L : G)[d[i] as number]
  bits += '01010'
  for (let i = 7; i <= 12; i++) bits += R[d[i] as number]
  bits += '101'
  return [...bits].map((b) => b === '1')
}

/** Si el modulo es de una guarda (las barras de guarda bajan mas que las de los digitos). */
export function esGuarda(i: number): boolean {
  return i < 3 || (i >= 45 && i < 50) || i >= 92
}

/**
 * Las barras: tramos seguidos de modulos negros, con su principio, su ancho
 * en modulos y si son de guarda.
 */
export function barrasEan13(cifras: string): { readonly desde: number; readonly ancho: number; readonly guarda: boolean }[] {
  const m = modulosEan13(cifras)
  const r: { desde: number; ancho: number; guarda: boolean }[] = []
  for (let i = 0; i < m.length; ) {
    if (!m[i]) {
      i++
      continue
    }
    let j = i
    while (j < m.length && m[j]) j++
    r.push({ desde: i, ancho: j - i, guarda: esGuarda(i) })
    i = j
  }
  return r
}

/** El ISBN escrito con guiones, como va encima de las barras: «ISBN 978-84-09-12345-2» si ya los traia. */
export function isbnLegible(isbn: string, cifras: string): string {
  const conGuiones = isbn.trim()
  return `ISBN ${/^[\d-]+$/u.test(conGuiones) && conGuiones.replace(/-/gu, '') === cifras ? conGuiones : cifras}`
}
