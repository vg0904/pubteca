/**
 * CRC-32, el de zip (polinomio 0xEDB88320).
 *
 * Esta en el core, sincrono y puro, porque lo necesitan los dos lados de la
 * frontera: el core para escribir las cabeceras del zip, y la app para sacar
 * el de un video de cientos de MB SIN cargarlo entero (lo lee por trozos y
 * encadena: `crc32(b, crc32(a))` es el CRC de `a` seguido de `b`). fflate lo
 * calcula por dentro, pero no lo exporta.
 */
const TABLA = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(datos: Uint8Array, previo = 0): number {
  let c = ~previo >>> 0
  const t = TABLA
  for (let i = 0; i < datos.length; i++) c = (t[(c ^ (datos[i] as number)) & 0xff] as number) ^ (c >>> 8)
  return ~c >>> 0
}
