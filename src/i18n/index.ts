/**
 * El idioma de la INTERFAZ.
 *
 * No es el idioma del LIBRO. Son dos cosas distintas y mezclarlas es el error
 * que ya se arreglo una vez (ver `core/textos-libro.ts`): un autor español
 * puede escribir una novela en ingles, y un autor ingles puede querer Pubteca
 * en ingles para publicar un libro en español. Aqui se elige en que idioma
 * habla la aplicacion; el idioma del libro se elige en «Descargar EPUB» y es
 * el que decide el `lang` del EPUB y sus «Indice», «Edicion digital»...
 *
 * Todo lo de este modulo es puro: se prueba en node, sin navegador.
 */
import { ui as es } from './es'
import { ui as en } from './en'
import type { Ui } from './es'

export type { Ui }

export type Idioma = 'es' | 'en'

/** El original. Si falta una traduccion, el compilador no deja publicarla. */
export const IDIOMA_POR_DEFECTO: Idioma = 'es'

export const IDIOMAS: readonly Idioma[] = ['es', 'en']

/**
 * Cada idioma se nombra EN SI MISMO, nunca traducido.
 *
 * Quien busca «English» en un menu en español no sabe que tiene que buscar
 * «Inglés», y quien busca «Español» en un menu en ingles no reconoce
 * «Spanish». Es la regla de todos los selectores de idioma que funcionan.
 */
export const NOMBRES: Readonly<Record<Idioma, string>> = { es: 'Español', en: 'English' }

const TEXTOS: Readonly<Record<Idioma, Ui>> = { es, en }

export function textos(idioma: Idioma): Ui {
  return TEXTOS[idioma]
}

export function esIdioma(x: unknown): x is Idioma {
  return x === 'es' || x === 'en'
}

/** Donde se recuerda la eleccion. Es una preferencia del navegador, no del libro. */
export const CLAVE_GUARDADA = 'pubteca.idioma'

/**
 * El idioma con el que arranca la app.
 *
 * Manda lo que el autor eligio alguna vez. Si no eligio nada, se mira la lista
 * de idiomas del navegador EN ORDEN y gana el primero que Pubteca hable: un
 * navegador en `['ca', 'es', 'en']` abre en español, no en ingles, porque el
 * catalan todavia no esta y el español va antes. Sin ninguno conocido, español.
 *
 * Solo se mira la parte principal del codigo: `en-GB` y `en` son el mismo
 * idioma para la interfaz.
 */
export function idiomaInicial(
  preferidos: readonly string[] = [],
  guardado: string | null = null,
): Idioma {
  if (esIdioma(guardado)) return guardado
  for (const p of preferidos) {
    const principal = p.trim().toLowerCase().split(/[-_]/u)[0] ?? ''
    if (esIdioma(principal)) return principal
  }
  return IDIOMA_POR_DEFECTO
}
