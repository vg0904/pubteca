/**
 * Numeros, tamanos y fechas como los lee un hispanohablante: «1.240», «7,4 MB»,
 * «hace 3 días». Sin Intl para los miles: es-ES no agrupa los numeros de
 * cuatro cifras («1240»), y la pantalla de importar los pone uno al lado de
 * otro.
 */
export function numero(n: number): string {
  const s = String(Math.round(Math.abs(n)))
  const conPuntos = s.replace(/\B(?=(\d{3})+(?!\d))/gu, '.')
  return n < 0 ? `-${conPuntos}` : conPuntos
}

/** Bytes -> «7,4 MB» o «850 kB». */
export function tamano(bytes: number): string {
  if (bytes < 1e6) return `${numero(Math.max(1, Math.round(bytes / 1e3)))} kB`
  return `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB`
}

/** «$1,11». */
export function dolares(x: number): string {
  return `$${x.toFixed(2).replace('.', ',')}`
}

/** Dias enteros entre dos instantes, en el calendario local. */
export function diasEntre(antes: number, ahora: number): number {
  const a = new Date(antes)
  const b = new Date(ahora)
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.max(0, Math.round((ub - ua) / 86_400_000))
}

/** «hoy», «ayer», «hace 3 días». */
export function haceDias(antes: number, ahora: number): string {
  const d = diasEntre(antes, ahora)
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  return `hace ${d} días`
}

/** Un plural de los de siempre: «1 capítulo», «3 capítulos». */
export function plural(n: number, uno: string, varios: string): string {
  return `${numero(n)} ${n === 1 ? uno : varios}`
}
