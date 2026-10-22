/**
 * La MECANICA de los numeros y las fechas, sin el idioma.
 *
 * Como se leen («1.240» o «1,240», «7,4 MB» o «7.4 MB», «hace 3 días» o
 * «3 days ago») es parte de los textos de la interfaz, asi que vive en
 * `src/i18n/`: cada idioma monta sus funciones sobre estas. Tenerlo al reves
 * (el formato aqui, con el español metido dentro) es como salio el primer
 * intento, y la interfaz en ingles decia «Backup: hace 3 días».
 *
 * No se usa `Intl.NumberFormat` para los miles: `es-ES` no agrupa los numeros
 * de cuatro cifras («1240») y la pantalla de importar los pone uno al lado de
 * otro, asi que «1240 párrafos» y «1.240 párrafos» alternarian.
 */

/** Los separadores de un idioma. */
export interface Separadores {
  readonly miles: string
  readonly decimal: string
}

export function numero(n: number, s: Separadores): string {
  const entero = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/gu, s.miles)
  return n < 0 ? `-${entero}` : entero
}

/** Bytes -> «7,4 MB» o «850 kB». */
export function tamano(bytes: number, s: Separadores): string {
  if (bytes < 1e6) return `${numero(Math.max(1, Math.round(bytes / 1e3)), s)} kB`
  return `${(bytes / 1e6).toFixed(1).replace('.', s.decimal)} MB`
}

/** «$1,11». Siempre en dolares: es lo que cobra Amazon. */
export function dolares(x: number, s: Separadores): string {
  return `$${x.toFixed(2).replace('.', s.decimal)}`
}

/** Dias enteros entre dos instantes, en el calendario local. */
export function diasEntre(antes: number, ahora: number): number {
  const a = new Date(antes)
  const b = new Date(ahora)
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.max(0, Math.round((ub - ua) / 86_400_000))
}
