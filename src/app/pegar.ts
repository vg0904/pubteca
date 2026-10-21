/**
 * Lo que llega del portapapeles -> bloques del modelo.
 *
 * El escritor pega desde Word, desde Google Docs, desde Pages o desde un
 * correo. Se conserva lo que el libro sabe representar (parrafos, cursiva,
 * negrita y los «* * *» de cambio de escena) y nada mas: ni colores, ni
 * tamanos, ni tablas. El HTML pegado NUNCA se inserta: se recorre y se mapea.
 *
 * Dos trampas reales:
 *   - Google Docs envuelve TODO lo copiado en un
 *     `<b style="font-weight:normal" id="docs-internal-guid-...">`. Leido por
 *     la etiqueta, el texto entero saldria en negrita. Por eso el estilo en
 *     linea manda sobre la etiqueta.
 *   - Word mete un `<style>` con cientos de reglas `mso-` y parrafos vacios
 *     con un `&nbsp;`. Se tiran.
 */
import { RE_ESCENA } from '../core/parser'
import { normalizarLinea, textoDeTramos, type Bloque, type Marca, type Tramo } from './modelo'
import { canonicos } from './tramos'

const POR_ETIQUETA: Record<string, Marca> = { em: 'cursiva', i: 'cursiva', strong: 'negrita', b: 'negrita' }
const DE_BLOQUE = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'tr', 'section', 'article',
  'header', 'footer', 'ul', 'ol', 'table', 'dd', 'dt',
])
const FUERA = new Set(['style', 'script', 'meta', 'title', 'head', 'link', 'xml', 'template', 'noscript'])

function marcasDe(el: HTMLElement, marcas: readonly Marca[]): Marca[] {
  let m = [...marcas]
  const porEtiqueta = POR_ETIQUETA[el.localName]
  if (porEtiqueta && !m.includes(porEtiqueta)) m.push(porEtiqueta)
  const fs = el.style?.fontStyle
  if (fs === 'italic' || fs === 'oblique') {
    if (!m.includes('cursiva')) m.push('cursiva')
  } else if (fs === 'normal') {
    m = m.filter((x) => x !== 'cursiva')
  }
  const fw = el.style?.fontWeight ?? ''
  const n = Number(fw)
  if (fw === 'bold' || fw === 'bolder' || (n >= 600 && n <= 1000)) {
    if (!m.includes('negrita')) m.push('negrita')
  } else if (fw === 'normal' || fw === 'lighter' || (n > 0 && n < 600)) {
    m = m.filter((x) => x !== 'negrita')
  }
  return m
}

/** Las lineas de un fragmento de HTML, cada una con sus tramos. */
export function lineasDeHtml(html: string): Tramo[][] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const lineas: Tramo[][] = []
  let actual: Tramo[] = []
  const cerrar = (): void => {
    if (actual.length > 0) lineas.push(actual)
    actual = []
  }
  const visitar = (n: Node, marcas: readonly Marca[]): void => {
    for (const hijo of Array.from(n.childNodes)) {
      if (hijo.nodeType === 3) {
        // En HTML los saltos de linea del fuente son espacios.
        const s = (hijo.nodeValue ?? '').replace(/\s+/gu, ' ')
        if (s !== '') actual.push({ texto: s, marcas: [...marcas] })
        continue
      }
      if (hijo.nodeType !== 1) continue
      const el = hijo as HTMLElement
      const etiqueta = el.localName
      if (FUERA.has(etiqueta)) continue
      if (etiqueta === 'br') {
        cerrar()
        continue
      }
      const bloque = DE_BLOQUE.has(etiqueta)
      if (bloque) cerrar()
      visitar(el, marcasDe(el, marcas))
      if (bloque) cerrar()
    }
  }
  visitar(doc.body, [])
  cerrar()
  return lineas.map((l) => normalizarLinea(l)).filter((l) => l.length > 0)
}

/** Las lineas de un texto plano. Una linea vacia separa parrafos; no se pierde nada. */
export function lineasDeTexto(texto: string): Tramo[][] {
  return texto
    .split(/\r\n|\r|\n|\u2028|\u2029/u)
    .map((l) => normalizarLinea([{ texto: l, marcas: [] }]))
    .filter((l) => l.length > 0)
}

/** Si una linea es solo un simbolo de cambio de escena. */
export function esEscena(tramos: readonly Tramo[]): boolean {
  const t = textoDeTramos(tramos).trim()
  return t === '#' || RE_ESCENA.test(t)
}

/** Lineas -> bloques: parrafos, y los «* * *» como cambio de escena. */
export function bloquesDeLineas(lineas: readonly (readonly Tramo[])[], nuevoId: () => string): Bloque[] {
  return lineas.map((l): Bloque =>
    // `canonicos` y no solo normalizar: los parrafos del medio de lo pegado
    // entran al modelo tal cual, sin pasar por el editor que los limpiaria.
    esEscena(l) ? { id: nuevoId(), tipo: 'escena' } : { id: nuevoId(), tipo: 'parrafo', tramos: canonicos(l) },
  )
}

/** Lo que se pega, en bloques. El HTML manda si existe: es el que trae la cursiva. */
export function bloquesDePegado(html: string, texto: string, nuevoId: () => string): Bloque[] {
  const lineas = html.trim() !== '' ? lineasDeHtml(html) : lineasDeTexto(texto)
  // Un HTML sin texto (una imagen copiada) cae al texto plano.
  return bloquesDeLineas(lineas.length > 0 ? lineas : lineasDeTexto(texto), nuevoId)
}
