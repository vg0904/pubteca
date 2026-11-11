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

/** Un numero con hasta `cifras` decimales y sin ceros de sobra: 10,5 · 22 · 12,7. */
export function decimal(n: number, s: Separadores, cifras = 1): string {
  const f = Math.pow(10, cifras)
  const r = Math.round(n * f) / f
  return String(r).replace('.', s.decimal)
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

/** Segundos -> «0:12», «12:05», «1:02:03». */
export function duracion(segundos: number): string {
  const t = Math.max(0, Math.round(segundos))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Hercios -> «44,1 kHz», «48 kHz». */
export function frecuencia(hz: number, s: Separadores): string {
  const k = hz / 1000
  return `${Number.isInteger(k) ? String(k) : k.toFixed(1).replace('.', s.decimal)} kHz`
}
