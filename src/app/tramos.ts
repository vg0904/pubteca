/**
 * Operaciones puras sobre una linea de tramos: partir, unir, pegar dentro y
 * poner o quitar cursiva y negrita en un rango.
 *
 * Es lo que el editor necesita para que el escritor nunca vea un asterisco, y
 * vive aparte de los componentes para poder probarlo sin navegador.
 *
 * Los desplazamientos van en unidades UTF-16, igual que los del DOM
 * (`Range.startOffset`), para que el editor pueda pasarlos tal cual. Partir
 * por la mitad de un par sustituto es imposible desde un cursor real.
 *
 * NO se recortan los espacios de los extremos: mientras el autor escribe,
 * «Hola » lleva su espacio, y si el modelo lo quitara el editor tendria que
 * repintar y el cursor saltaria. El recorte lo hace el serializador al
 * guardar (`normalizarLinea`), que es donde el formato lo exige.
 */
import { sinNoXml } from '../core/texto'
import { normalizarTramos, type Marca, type Tramo } from './modelo'

/**
 * Lo que una linea de texto NO puede contener, y es el filtro por el que pasa
 * TODO texto que entra al modelo: lo que se escribe, lo que se pega, lo que
 * llega de un Word o de un `.md`, y los datos del libro.
 *
 *   - Un salto de linea parte el parrafo en dos al serializar, porque en el
 *     dialecto cada linea es un bloque. Se cambia por un espacio, que conserva
 *     la longitud y por tanto el cursor.
 *   - Lo que XML no admite (caracteres de control, que llegan al copiar de un
 *     PDF) dejaria el EPUB invalido. Se quita: el motor tambien lo quita al
 *     generar, pero si se quedara en el modelo la app ensenaria un texto
 *     distinto del que sale en el libro.
 */
export function limpiarTexto(s: string): string {
  // Los caracteres de control son a proposito: \v, \f, NEL y los separadores
  // U+001C a U+001E tambien parten la linea para el motor (ver partirLineas en
  // core/config.ts), asi que van a espacio como un salto mas.
  // oxlint-disable-next-line no-control-regex
  return sinNoXml(s.replace(/[\r\n\u2028\u2029\u000b\u000c\u0085\u001c-\u001e]/gu, ' '))
}

/** Longitud de la linea en unidades UTF-16. */
export function longitud(tramos: readonly Tramo[]): number {
  let n = 0
  for (const t of tramos) n += t.texto.length
  return n
}

/** Normaliza y limpia: la forma en que los tramos entran al modelo. */
export function canonicos(tramos: readonly Tramo[]): Tramo[] {
  return normalizarTramos(tramos.map((t) => ({ texto: limpiarTexto(t.texto), marcas: t.marcas })))
}

/** Dos lineas iguales, tramo a tramo y marca a marca. */
export function igualesTramos(a: readonly Tramo[], b: readonly Tramo[]): boolean {
  if (a.length !== b.length) return false
  return a.every((t, i) => {
    const u = b[i] as Tramo
    return (
      t.texto === u.texto &&
      t.marcas.length === u.marcas.length &&
      t.marcas.every((m) => u.marcas.includes(m))
    )
  })
}

/** El trozo [inicio, fin) de la linea, con sus marcas. */
export function recortar(tramos: readonly Tramo[], inicio: number, fin: number): Tramo[] {
  const salida: Tramo[] = []
  let pos = 0
  for (const t of tramos) {
    const a = pos
    const b = pos + t.texto.length
    pos = b
    const desde = Math.max(inicio, a)
    const hasta = Math.min(fin, b)
    if (hasta > desde) salida.push({ texto: t.texto.slice(desde - a, hasta - a), marcas: t.marcas })
  }
  return normalizarTramos(salida)
}

/** Parte la linea en dos por el desplazamiento: lo que queda antes y lo de despues. */
export function partir(tramos: readonly Tramo[], offset: number): [Tramo[], Tramo[]] {
  const total = longitud(tramos)
  const o = Math.max(0, Math.min(offset, total))
  return [recortar(tramos, 0, o), recortar(tramos, o, total)]
}

/** Une dos lineas, como al borrar el salto entre dos parrafos. */
export function unir(a: readonly Tramo[], b: readonly Tramo[]): Tramo[] {
  return normalizarTramos([...a, ...b])
}

/** Sustituye el rango [inicio, fin) por los tramos nuevos. Es pegar. */
export function sustituir(
  tramos: readonly Tramo[],
  inicio: number,
  fin: number,
  nuevos: readonly Tramo[],
): Tramo[] {
  const total = longitud(tramos)
  const a = Math.max(0, Math.min(inicio, total))
  const b = Math.max(a, Math.min(fin, total))
  return canonicos([...recortar(tramos, 0, a), ...nuevos, ...recortar(tramos, b, total)])
}

/**
 * Si TODO el rango lleva la marca. Un rango vacio no la lleva: con el cursor
 * quieto no hay nada que mirar.
 */
export function tieneMarca(
  tramos: readonly Tramo[],
  inicio: number,
  fin: number,
  marca: Marca,
): boolean {
  const trozo = recortar(tramos, inicio, fin)
  return trozo.length > 0 && trozo.every((t) => t.marcas.includes(marca))
}

/**
 * Pone o quita una marca en un rango, como Cmd+I en un procesador de texto:
 * si todo el rango ya la lleva se quita, si no se pone en todo el rango.
 */
export function alternarMarca(
  tramos: readonly Tramo[],
  inicio: number,
  fin: number,
  marca: Marca,
): Tramo[] {
  if (fin <= inicio) return [...tramos]
  const quitar = tieneMarca(tramos, inicio, fin, marca)
  const total = longitud(tramos)
  const medio = recortar(tramos, inicio, fin).map((t) => ({
    texto: t.texto,
    marcas: quitar ? t.marcas.filter((m) => m !== marca) : [...t.marcas, marca],
  }))
  return normalizarTramos([
    ...recortar(tramos, 0, inicio),
    ...medio,
    ...recortar(tramos, fin, total),
  ])
}

/** Texto plano de la linea. */
export function plano(tramos: readonly Tramo[]): string {
  return tramos.map((t) => t.texto).join('')
}

/**
 * Hasta donde coinciden dos lineas por el principio. El editor pone ahi el
 * cursor al deshacer: es donde estaba el cambio.
 */
export function prefijoComun(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i += 1
  return i
}
