/**
 * Formato numerico igual al de Python.
 *
 * TRAMPA: `format(x, ".1f")` de Python redondea AL PAR en los empates y
 * `Number.toFixed()` de JS redondea hacia arriba. Sobre 9012 valores
 * plausibles del generador solo hay dos diferencias, pero son alcanzables: una
 * imagen de exactamente 1.250.000 bytes da «1.2 MB» en Python y «1.3 MB» con
 * toFixed, y ese texto va en el reporte que compara el golden test.
 *
 * Se resuelve con aritmetica exacta sobre el valor binario del double, en vez
 * de esperar que toFixed coincida.
 */

/** El valor exacto de un double como fraccion de enteros. */
function exacto(x: number): { num: bigint; den: bigint } {
  const dv = new DataView(new ArrayBuffer(8))
  dv.setFloat64(0, x)
  const alto = dv.getUint32(0)
  const bajo = dv.getUint32(4)
  const signo = alto >>> 31 ? -1n : 1n
  const exp = (alto >>> 20) & 0x7ff
  let mant = (BigInt(alto & 0xfffff) << 32n) | BigInt(bajo)
  let e: number
  if (exp === 0) {
    e = -1074 // subnormal: sin bit implicito
  } else {
    mant |= 1n << 52n
    e = exp - 1075
  }
  return e >= 0
    ? { num: signo * mant * (1n << BigInt(e)), den: 1n }
    : { num: signo * mant, den: 1n << BigInt(-e) }
}

/**
 * `format(x, ".{decimales}f")` de Python: redondeo al par sobre el valor
 * binario exacto.
 */
export function formatoFijo(x: number, decimales: number): string {
  if (!Number.isFinite(x)) return String(x)
  const { num, den } = exacto(x)
  const negativo = num < 0n
  const n = negativo ? -num : num

  const escala = 10n ** BigInt(decimales)
  const producto = n * escala
  let entero = producto / den
  const resto = producto % den

  // Empate exacto -> al par. Si no, al mas cercano.
  const doble = resto * 2n
  if (doble > den || (doble === den && (entero & 1n) === 1n)) entero += 1n

  const s = entero.toString().padStart(decimales + 1, '0')
  const corte = s.length - decimales
  const texto = decimales === 0 ? s : `${s.slice(0, corte)}.${s.slice(corte)}`
  return (negativo ? '-' : '') + texto
}
