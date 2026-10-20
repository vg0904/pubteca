/**
 * Primitivas de texto. Port de generar_epub.py 57-72 y 320-367.
 *
 * Es el modulo con MAS riesgo de divergencia Python -> JavaScript del proyecto,
 * porque casi todas las diferencias son silenciosas: producen un libro
 * estructuralmente impecable con el contenido mal. Cada funcion de aqui se
 * prueba contra la salida real del Python (tests/casos-texto.json, generado por
 * scripts/exportar-casos-texto.py). No cambiar nada sin que ese test lo avale.
 */

// ---------------------------------------------------------------------------
// Escapado
// ---------------------------------------------------------------------------

/**
 * `html.escape(s, quote=True)`.
 *
 * TRAMPA: Python emite `&#x27;` (hexadecimal) para la apostrofe, no `&#39;`
 * ni `&apos;` como casi todos los helpers de JS. Rompe la comparacion de
 * cualquier titulo o alt con apostrofe, que en espanol es frecuentisimo
 * («D'Artagnan», «l'ete»). El `&` va PRIMERO o se re-escapan los demas.
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * `html.escape(s, quote=False)`: solo `& < >`.
 *
 * Se usa SOLO dentro de enLinea() y al restaurar sus centinelas. Aplicar el
 * escapado fuerte ahi llenaria el texto del libro de `&quot;`.
 */
export function escInline(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// Normalizacion de nombres
// ---------------------------------------------------------------------------

/**
 * `unicodedata.normalize("NFD")` descartando la categoria Mn.
 *
 * TRAMPA: el idiom habitual en JS (`.replace(/[̀-ͯ]/g, '')`) solo
 * cubre el bloque latino de diacriticos y deja marcas Mn de hebreo, arabe,
 * devanagari y de los bloques U+1AB0.. y U+20D0.., cambiando qué sobrevive y
 * por tanto el nombre de archivo resultante. Hay que descartar \p{Mn} entero.
 *
 * Igual que el Python: NO vuelve a NFC, y ni `ø` ni `ß` se transforman porque
 * no se descomponen en Mn.
 */
export function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '')
}

/** Quita un caracter concreto de los dos extremos: el `.strip("-")` de Python. */
function recortarCaracter(s: string, c: string): string {
  let i = 0
  let f = s.length
  while (i < f && s[i] === c) i++
  while (f > i && s[f - 1] === c) f--
  return s.slice(i, f)
}

/**
 * Nombre de archivo seguro. `nombre_seguro()` del Python.
 *
 * TRAMPA: el ultimo paso es `.strip("-")`, que quita GUIONES de los extremos,
 * no espacios: `String.trim()` no sirve. Y el fallback literal es "archivo",
 * asi que cualquier nombre no latino (p. ej. japones) colapsa a `archivo.png`
 * y dos de ellos a `archivo.png` y `archivo-2.png`.
 */
export function nombreSeguro(s: string): string {
  let r = sinAcentos(s).toLowerCase()
  r = r.replace(/[^a-z0-9._-]+/g, '-')
  r = r.replace(/-{2,}/g, '-')
  return recortarCaracter(r, '-') || 'archivo'
}

// ---------------------------------------------------------------------------
// Orden natural
// ---------------------------------------------------------------------------

const UN_DIGITO = /\p{Nd}/u

/**
 * Valor numerico de un digito Unicode cualquiera.
 *
 * TRAMPA: `\d` es Unicode en Python y ASCII en JS, e `int("٣")` da 3
 * mientras `parseInt("٣")` da NaN. Si el autor pega un nombre con digitos
 * arabo-indicos, devanagari o de ancho completo, el orden de los capitulos
 * cambia sin avisar.
 *
 * No hace falta una tabla de bloques: todo bloque Nd son diez puntos de codigo
 * consecutivos, asi que el cero del bloque es el primer Nd contando hacia atras.
 */
function valorDigito(punto: number): number {
  for (let k = 0; k <= 9; k++) {
    const actual = punto - k
    if (actual < 0) break
    if (!UN_DIGITO.test(String.fromCodePoint(actual))) break
    if (actual === 0 || !UN_DIGITO.test(String.fromCodePoint(actual - 1))) return k
  }
  return 0
}

/** Valor de un tramo entero de digitos Unicode, como el `int()` de Python. */
function valorDigitos(s: string): number {
  let n = 0
  for (const c of s) n = n * 10 + valorDigito(c.codePointAt(0) as number)
  return n
}

export type ClaveNatural = (string | number)[]

/**
 * Clave de orden natural. `orden_natural()` del Python, sobre el nombre
 * completo del archivo (con extension).
 *
 * El split con grupo de captura intercala los tramos capturados y conserva los
 * vacios: "01.md" -> ["", "01", ".md"]. Reescribirlo con `match(/\d+|\D+/g)`
 * elimina ese vacio inicial y cambia el orden de "01.md" frente a "cap01.md".
 */
export function ordenNatural(nombre: string): ClaveNatural {
  const tramos = nombre.split(/(\p{Nd}+)/u)
  // Por construccion del split, los indices impares son los tramos de digitos.
  return tramos.map((t, i) => (i % 2 === 1 ? valorDigitos(t) : t.toLowerCase()))
}

/** Compara por punto de codigo, como Python, no por unidad UTF-16 como `<`. */
function compararCadenas(a: string, b: string): number {
  const ca = [...a]
  const cb = [...b]
  const n = Math.min(ca.length, cb.length)
  for (let i = 0; i < n; i++) {
    const x = (ca[i] as string).codePointAt(0) as number
    const y = (cb[i] as string).codePointAt(0) as number
    if (x !== y) return x < y ? -1 : 1
  }
  return ca.length - cb.length
}

/** Comparador de claves naturales, equivalente al `<` de listas de Python. */
export function compararNatural(a: ClaveNatural, b: ClaveNatural): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]
    const y = b[i]
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x < y ? -1 : 1
    } else if (typeof x === 'string' && typeof y === 'string') {
      const c = compararCadenas(x, y)
      if (c !== 0) return c
    }
    // Tipos distintos en la misma posicion es imposible por como parte el
    // split; en Python seria un TypeError. Se ignora y sigue a la siguiente.
  }
  return a.length - b.length
}

/**
 * Ordena nombres de archivo como `sorted(..., key=orden_natural)`.
 * El sort de JS es estable desde ES2019, igual que el de Python, lo que importa
 * cuando dos nombres dan la misma clave ("cap3.md" y "cap٣.md").
 */
export function ordenarNatural(nombres: readonly string[]): string[] {
  return nombres
    .map((n, i) => ({ n, i, k: ordenNatural(n) }))
    .sort((a, b) => compararNatural(a.k, b.k) || a.i - b.i)
    .map((x) => x.n)
}

// ---------------------------------------------------------------------------
// Markdown en linea
// ---------------------------------------------------------------------------

/** Clase de caracteres escapables del Python: \\`*_{}[]()#+-.!|~> */
const RE_ESCAPE = /\\([\\`*_{}[\]()#+\-.!|~>])/g

/** `desescapar()`: quita la barra invertida de los caracteres escapables. */
export function desescapar(s: string): string {
  return s.replace(RE_ESCAPE, '$1')
}

// Delimitador de palabra. TRAMPA: `\w` es Unicode en Python ([\p{L}\p{N}_]) y
// ASCII en JS ([A-Za-z0-9_]). Sin esto, "camino_x_fin" con ñ/ó se italizaria en
// JS y no en Python. Es la divergencia mas silenciosa de todo el port.
const PAL = '[\\p{L}\\p{N}_]'

const R_TRIPLE = /\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/gu
const R_NEGRITA = /\*\*(?=\S)(.+?)(?<=\S)\*\*/gu
const R_NEGRITA_ = new RegExp(`(?<!${PAL})__(?=\\S)(.+?)(?<=\\S)__(?!${PAL})`, 'gu')
const R_CURSIVA = /\*(?=\S)(.+?)(?<=\S)\*/gu
const R_CURSIVA_ = new RegExp(`(?<!${PAL})_(?=\\S)(.+?)(?<=\\S)_(?!${PAL})`, 'gu')
const R_CENTINELA = /\u0000([0-9]+)\u0000/g

/**
 * Markdown en linea -> XHTML: *cursiva*, **negrita**, ***ambas***, _cursiva_.
 * `en_linea()` del Python.
 *
 * El orden de los pasos es parte del contrato y no se puede reordenar:
 *   1. escapar HTML (quote=False)
 *   2. guardar los caracteres escapados tras un centinela \0N\0
 *   3. aplicar las cinco regex de enfasis
 *   4. restaurar los centinelas volviendo a escapar el caracter guardado
 *
 * Si se escapa DESPUES, se escaparian los `<em>` recien generados.
 *
 * TRAMPA: la restauracion usa una FUNCION de reemplazo. Con un string, un `$`
 * del contenido del autor («**$&**») se leeria como referencia de grupo.
 */
export function enLinea(s: string): string {
  let r = escInline(s)
  const guardados: string[] = []
  r = r.replace(RE_ESCAPE, (_m, c: string) => {
    guardados.push(c)
    return `\u0000${guardados.length - 1}\u0000`
  })
  r = r.replace(R_TRIPLE, '<strong><em>$1</em></strong>')
  r = r.replace(R_NEGRITA, '<strong>$1</strong>')
  r = r.replace(R_NEGRITA_, '<strong>$1</strong>')
  r = r.replace(R_CURSIVA, '<em>$1</em>')
  r = r.replace(R_CURSIVA_, '<em>$1</em>')
  return r.replace(R_CENTINELA, (_m, n: string) => escInline(guardados[Number(n)] as string))
}

const R_ENFASIS_PLANO = /(\*\*\*|\*\*|\*|__|_)(?=\S)(.+?)(?<=\S)\1/gu

/** `texto_plano()`: desescapa y quita las marcas de enfasis sin convertirlas. */
export function textoPlano(s: string): string {
  return desescapar(s).replace(R_ENFASIS_PLANO, '$2')
}

const R_ENVUELTO = /^(\*\*\*|\*\*|\*|__|_)(.+)\1$/u

/**
 * `limpiar_titulo()`: quita los `#` iniciales y desenvuelve el enfasis.
 *
 * Replica un BUG conocido: el regex es codicioso, asi que «*a* y *b*» da
 * «a* y *b» (casa el primer y el ultimo asterisco aunque sean de dos enfasis
 * distintos). Se replica a proposito; la correccion esta anotada en el plan
 * como divergencia de fase 2.
 */
export function limpiarTitulo(s: string): string {
  let r = s.replace(/^#+\s*/u, '').trim()
  for (let i = 0; i < 3; i++) {
    const m = R_ENVUELTO.exec(r)
    if (m) r = (m[2] as string).trim()
  }
  return r
}

// ---------------------------------------------------------------------------
// Lectura de lineas
// ---------------------------------------------------------------------------

/**
 * `lineas_de()`: normaliza saltos, quita el form feed y los espacios de ancho
 * cero, y recorta cada linea. Las lineas vacias se conservan: las descarta
 * parsear().
 *
 * El Python lee con `utf-8-sig`, que se come el BOM; aqui se quita a mano.
 */
export function lineasDe(texto: string): string[] {
  const t = texto
    .replace(/^﻿/u, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/​/g, '')
  return t.split('\n').map((l) => l.trim())
}

/**
 * Parte en la PRIMERA coincidencia, como `re.split(patron, s, maxsplit=1)`.
 *
 * TRAMPA: `String.split(regex, limite)` de JS no es maxsplit: trunca el array
 * a `limite` elementos en vez de limitar el numero de divisiones, asi que
 * `"Capitulo 3: El bosque".split(re, 1)` devuelve ["Capitulo 3"] y se pierde
 * el titulo entero.
 */
export function partirUnaVez(s: string, patron: RegExp): string[] {
  const re = new RegExp(patron.source, patron.flags.replace('g', ''))
  const m = re.exec(s)
  if (!m) return [s]
  return [s.slice(0, m.index), s.slice(m.index + m[0].length)]
}
