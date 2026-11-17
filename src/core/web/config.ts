/**
 * Las opciones del libro web: que partes se publican y donde se consigue el
 * libro entero.
 *
 * Como las del impreso, `normalizarWeb` es la unica puerta: lo que venga de un
 * archivo (el almacen, una copia editada a mano) se lee campo a campo, y nada
 * raro puede costarle el libro al autor.
 */

import { esLetraWeb, LETRA_WEB_POR_DEFECTO } from './letras'

/** Como se lee: de corrido, desplazando, o pasando paginas como en un lector de libros. */
export type ModoLectura = 'desplazar' | 'paginas'

/** Un sitio donde se consigue el libro: «Amazon», «Apple Books», la tienda del autor. */
export interface EnlaceWeb {
  readonly etiqueta: string
  /** Tal como la escribio el autor. Al libro solo llega si es una direccion web de verdad: ver `enlacesValidos`. */
  readonly url: string
}

export interface ConfigWeb {
  /**
   * Lo que NO se publica. Lo normal es publicarlo todo; quitando capitulos, el
   * libro web es una MUESTRA y lo dice.
   *
   * En la app son ids de capitulos y de paginas extra. En el core, la ruta de
   * su archivo en el proyecto del motor (`capitulos/cap03.md`,
   * `extras/agradecimientos.md`): ver `app/web/preparar.ts`.
   */
  readonly omitidos: readonly string[]
  readonly enlaces: readonly EnlaceWeb[]
  /**
   * Si las ilustraciones se aligeran para la web (mas pequeñas, en JPEG). Viene
   * puesto: en un sitio web el peso lo paga cada visitante, con su conexion.
   * Lo hace la app, que es quien tiene un lienzo (`app/web/imagenes.ts`).
   */
  readonly aligerar: boolean
  /**
   * Como se abre el libro: el modo y la letra. Quien lee puede cambiarlos en
   * los ajustes del lector, y lo que elija manda sobre esto.
   */
  readonly modo: ModoLectura
  /** Una de `LETRAS_WEB`, o `sistema`. */
  readonly letra: string
}

export const CONFIG_WEB_POR_DEFECTO: ConfigWeb = { omitidos: [], enlaces: [], aligerar: true, modo: 'desplazar', letra: LETRA_WEB_POR_DEFECTO }

/** Mas enlaces que estos ya no son «donde conseguirlo»: son una lista. */
export const MAX_ENLACES = 6

const MAX_ETIQUETA = 60
const MAX_URL = 2000

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** Sin saltos de linea ni caracteres de control: son campos de una linea. */
function unaLinea(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/gu, ' ').slice(0, max) : ''
}

/**
 * Lee unas opciones de donde vengan. `id` traduce los ids de lo omitido: al
 * abrir una copia los capitulos y los extras estrenan id, y uno que ya no
 * existe (devuelve null) se suelta.
 */
export function normalizarWeb(x: unknown, id: (viejo: string) => string | null = (v) => v): ConfigWeb {
  if (!esObjeto(x)) return CONFIG_WEB_POR_DEFECTO
  const omitidos = new Set<string>()
  for (const v of Array.isArray(x['omitidos']) ? x['omitidos'] : []) {
    const nuevo = typeof v === 'string' ? id(v) : null
    if (nuevo) omitidos.add(nuevo)
  }
  const enlaces = (Array.isArray(x['enlaces']) ? x['enlaces'] : [])
    .flatMap((e): EnlaceWeb[] => (esObjeto(e) ? [{ etiqueta: unaLinea(e['etiqueta'], MAX_ETIQUETA), url: unaLinea(e['url'], MAX_URL) }] : []))
    .slice(0, MAX_ENLACES)
  return {
    omitidos: [...omitidos],
    enlaces,
    aligerar: x['aligerar'] !== false,
    modo: x['modo'] === 'paginas' ? 'paginas' : 'desplazar',
    letra: esLetraWeb(x['letra']) ? x['letra'] : LETRA_WEB_POR_DEFECTO,
  }
}

/**
 * La direccion tal como va al libro, o null si no es una direccion web.
 *
 * Solo `http` y `https`: lo que el autor escribe acaba en un `href` del sitio
 * donde se publique el libro, y ahi no puede entrar un `javascript:` ni un
 * `data:`. Sin protocolo se entiende `https://` («amazon.com/dp/…» es lo que
 * la gente pega), pero entonces tiene que parecer un dominio.
 */
export function urlSegura(texto: string): string | null {
  const t = texto.trim()
  if (!t || /\s/u.test(t)) return null
  const conProtocolo = /^[a-z][a-z0-9+.-]*:/iu.test(t) ? t : `https://${t}`
  let u: URL
  try {
    u = new URL(conProtocolo)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!u.hostname.includes('.')) return null
  return u.href
}

/** Los enlaces que llegan al libro: con direccion valida, y con el dominio de nombre si el autor no les puso uno. */
export function enlacesValidos(c: ConfigWeb): EnlaceWeb[] {
  return c.enlaces.flatMap((e) => {
    const url = urlSegura(e.url)
    if (!url) return []
    const etiqueta = e.etiqueta.trim() || new URL(url).hostname.replace(/^www\./u, '')
    return [{ etiqueta, url }]
  })
}
