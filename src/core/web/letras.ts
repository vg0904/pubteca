/**
 * Las letras del libro web.
 *
 * Son las seis del impreso (`impreso/familias.ts`): serifas de libro con
 * licencia OFL, que permite llevarlas en un sitio web. Viajan DENTRO del .zip,
 * en WOFF, por una razon: el nombre que ve quien lee tiene que ser la letra que
 * de verdad se pinta. Una «Palatino» que en Android sale como otra cosa no es
 * Palatino. Asi, Literata es Literata en un iPhone, en un Android y en Windows.
 *
 * La setima es la del aparato, que no viaja y se llama por lo que es.
 *
 * Cada navegador descarga solo la familia que se usa: unos 200 a 330 kB con
 * sus cuatro caras.
 */
import { archivosDe, FAMILIAS, type Familia } from '../impreso/familias'
import type { Cara } from '../impreso/tipos'

/** El orden en que se ofrecen. Literata primero: se diseño para leer en pantalla. */
export const LETRAS_WEB: readonly string[] = ['literata', 'source-serif-4', 'eb-garamond', 'libre-baskerville', 'alegreya', 'crimson-pro']

export const LETRA_SISTEMA = 'sistema'
export const LETRA_WEB_POR_DEFECTO = 'literata'

/** Lo que se pone detras de una letra del libro, por si no llega a cargarse. */
export const RESPALDO_SERIF = 'Georgia, "Times New Roman", serif'
export const RESPALDO_SISTEMA = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'

/** Una cara, tal como va en `libro.json`: lo que necesita un `FontFace`. */
export interface CaraWeb {
  /** Relativa a `libro.json`. */
  readonly src: string
  readonly peso: '400' | '700'
  readonly estilo: 'normal' | 'italic'
}

/** Una letra, tal como va en `libro.json`. */
export interface LetraWeb {
  readonly id: string
  /** Su nombre de verdad: «Literata», «EB Garamond». La del aparato, «Del sistema». */
  readonly nombre: string
  /**
   * El nombre de familia con el que se registra («Pubteca Literata»), o null
   * si es la del aparato. Con prefijo para no pisar una letra del sitio que se
   * llame igual y sea otra version.
   */
  readonly familia: string | null
  /** Lo que va detras en `font-family`. */
  readonly respaldo: string
  readonly caras: readonly CaraWeb[]
  /** Su licencia, relativa a `libro.json`. */
  readonly licencia: string | null
}

const CARAS: readonly { cara: Cara; peso: CaraWeb['peso']; estilo: CaraWeb['estilo'] }[] = [
  { cara: 'regular', peso: '400', estilo: 'normal' },
  { cara: 'cursiva', peso: '400', estilo: 'italic' },
  { cara: 'negrita', peso: '700', estilo: 'normal' },
  { cara: 'negritaCursiva', peso: '700', estilo: 'italic' },
]

export function esLetraWeb(id: unknown): id is string {
  return typeof id === 'string' && (id === LETRA_SISTEMA || LETRAS_WEB.includes(id))
}

/** Los archivos que necesita una familia: sus cuatro caras y su licencia (`OFL-Literata.txt`). */
export function archivosDeLetra(f: Familia): { readonly caras: readonly { cara: Cara; ttf: string }[]; readonly licencia: string } {
  const a = archivosDe(f)
  return { caras: CARAS.map((c) => ({ cara: c.cara, ttf: a[c.cara] })), licencia: `OFL-${f.prefijo}.txt` }
}

/** La entrada de `libro.json` de una familia, con sus caras en `letras/`. */
export function letraWeb(f: Familia): LetraWeb {
  const { caras, licencia } = archivosDeLetra(f)
  return {
    id: f.id,
    nombre: f.nombre,
    familia: `Pubteca ${f.nombre}`,
    respaldo: RESPALDO_SERIF,
    caras: caras.map((c, i) => ({ src: `letras/${c.ttf.replace(/\.ttf$/u, '.woff')}`, peso: (CARAS[i] as (typeof CARAS)[number]).peso, estilo: (CARAS[i] as (typeof CARAS)[number]).estilo })),
    licencia: `letras/${licencia}`,
  }
}

export function letraDelSistema(nombre: string): LetraWeb {
  return { id: LETRA_SISTEMA, nombre, familia: null, respaldo: RESPALDO_SISTEMA, caras: [], licencia: null }
}

/** Las familias de la web, en su orden. */
export function familiasWeb(): Familia[] {
  return LETRAS_WEB.flatMap((id) => FAMILIAS.filter((f) => f.id === id))
}

/** El valor de `font-family` de una letra. */
export function pilaDe(l: LetraWeb): string {
  return l.familia ? `"${l.familia}", ${l.respaldo}` : l.respaldo
}
