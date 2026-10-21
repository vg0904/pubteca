/**
 * El puente entre un `contenteditable` y una linea de tramos.
 *
 * El editor NO deja que React gestione los hijos del elemento editable: el
 * navegador los cambia mientras el autor escribe (y mientras compone un acento
 * en dos pulsaciones), y una reconciliacion de React en medio rompe el cursor.
 * Asi que el DOM se pinta a mano desde el modelo SOLO cuando el modelo cambia
 * por fuera (deshacer, pegar, partir), y en cada `input` se LEE el DOM y se
 * despacha al reductor.
 *
 * Al leer se aceptan las formas en que los navegadores escriben el formato:
 * `<em>`, `<i>`, `<strong>`, `<b>` y los `style` de font-style y font-weight
 * (Safari quita una negrita dentro de un `<strong>` con un
 * `<span style="font-weight: normal">`). Todo lo demas se lee como texto.
 */
import { normalizarTramos, type Marca, type Tramo } from './modelo'

const POR_ETIQUETA: Record<string, Marca> = { em: 'cursiva', i: 'cursiva', strong: 'negrita', b: 'negrita' }

const con = (m: readonly Marca[], x: Marca): Marca[] => (m.includes(x) ? [...m] : [...m, x])
const sin = (m: readonly Marca[], x: Marca): Marca[] => m.filter((y) => y !== x)

/** Las marcas que un elemento pone o quita por su estilo en linea. */
function marcasDeEstilo(el: Element, marcas: Marca[]): Marca[] {
  const estilo = (el as HTMLElement).style as CSSStyleDeclaration | undefined
  if (!estilo) return marcas
  let m = marcas
  const fs = estilo.fontStyle
  if (fs === 'italic' || fs === 'oblique') m = con(m, 'cursiva')
  else if (fs === 'normal') m = sin(m, 'cursiva')
  const fw = estilo.fontWeight
  const n = Number(fw)
  if (fw === 'bold' || fw === 'bolder' || (n >= 600 && n <= 1000)) m = con(m, 'negrita')
  else if (fw === 'normal' || fw === 'lighter' || (n > 0 && n < 600)) m = sin(m, 'negrita')
  return m
}

/**
 * Lee los tramos de un elemento editable. Los saltos de linea se vuelven
 * espacios CONSERVANDO la longitud, para que los desplazamientos del cursor
 * sigan valiendo.
 */
export function leer(raiz: Node): Tramo[] {
  const salida: Tramo[] = []
  const visitar = (n: Node, marcas: Marca[]): void => {
    for (const hijo of Array.from(n.childNodes)) {
      if (hijo.nodeType === 3) {
        const s = hijo.nodeValue ?? ''
        if (s !== '') salida.push({ texto: s.replace(/[\r\n]/gu, ' '), marcas: [...marcas] })
        continue
      }
      if (hijo.nodeType !== 1) continue
      const el = hijo as Element
      const etiqueta = el.localName
      if (etiqueta === 'br') continue
      let m = marcas
      const porEtiqueta = POR_ETIQUETA[etiqueta]
      if (porEtiqueta) m = con(m, porEtiqueta)
      visitar(el, marcasDeEstilo(el, m))
    }
  }
  visitar(raiz, [])
  return normalizarTramos(salida)
}

/** Pinta los tramos en el elemento, sin innerHTML: el texto nunca se interpreta. */
export function pintar(raiz: HTMLElement, tramos: readonly Tramo[]): void {
  const doc = raiz.ownerDocument
  const nodos: Node[] = tramos.map((t) => {
    let n: Node = doc.createTextNode(t.texto)
    if (t.marcas.includes('cursiva')) {
      const em = doc.createElement('em')
      em.appendChild(n)
      n = em
    }
    if (t.marcas.includes('negrita')) {
      const strong = doc.createElement('strong')
      strong.appendChild(n)
      n = strong
    }
    return n
  })
  raiz.replaceChildren(...nodos)
}

/** La longitud del texto de un elemento, como la cuenta el cursor. */
export function longitudDe(raiz: Node): number {
  return (raiz.textContent ?? '').length
}

/** Desplazamiento en el texto de un punto del DOM. */
function desplazamiento(raiz: Node, nodo: Node, offset: number): number {
  const r = raiz.ownerDocument!.createRange()
  r.selectNodeContents(raiz)
  r.setEnd(nodo, offset)
  return r.toString().length
}

/** La seleccion dentro del elemento, en desplazamientos de texto. null si no esta dentro. */
export function seleccionEn(raiz: HTMLElement): { inicio: number; fin: number } | null {
  const sel = raiz.ownerDocument.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  if (!raiz.contains(r.startContainer) || !raiz.contains(r.endContainer)) return null
  return {
    inicio: desplazamiento(raiz, r.startContainer, r.startOffset),
    fin: desplazamiento(raiz, r.endContainer, r.endOffset),
  }
}

/**
 * El punto del DOM para un desplazamiento. En la frontera entre dos tramos se
 * elige el FINAL del de antes: es lo que hace el navegador, y asi lo que se
 * escriba despues lleva el formato del texto que precede al cursor.
 */
function puntoEn(raiz: Node, objetivo: number): { nodo: Node; offset: number } {
  const doc = raiz.ownerDocument!
  const andador = doc.createTreeWalker(raiz, 4 /* SHOW_TEXT */)
  let acumulado = 0
  let ultimo: Text | null = null
  for (let n = andador.nextNode(); n; n = andador.nextNode()) {
    const t = n as Text
    const largo = t.data.length
    if (objetivo <= acumulado + largo) return { nodo: t, offset: objetivo - acumulado }
    acumulado += largo
    ultimo = t
  }
  if (ultimo) return { nodo: ultimo, offset: ultimo.data.length }
  return { nodo: raiz, offset: 0 }
}

export type Posicion = number | 'inicio' | 'fin'

/** Pone el cursor (o una seleccion) en el elemento. */
export function ponerCursor(raiz: HTMLElement, posicion: Posicion, hasta?: number): void {
  const total = longitudDe(raiz)
  const a = posicion === 'inicio' ? 0 : posicion === 'fin' ? total : Math.max(0, Math.min(posicion, total))
  const doc = raiz.ownerDocument
  const sel = doc.getSelection()
  if (!sel) return
  const r = doc.createRange()
  const p = puntoEn(raiz, a)
  r.setStart(p.nodo, p.offset)
  if (hasta !== undefined && hasta > a) {
    const q = puntoEn(raiz, Math.min(hasta, total))
    r.setEnd(q.nodo, q.offset)
  } else {
    r.collapse(true)
  }
  sel.removeAllRanges()
  sel.addRange(r)
}

/**
 * El rectangulo del cursor. Un rango colapsado a veces no tiene rectangulo (al
 * principio de una linea, en un elemento vacio), asi que se mide el caracter
 * de al lado.
 */
function rectDelCursor(raiz: HTMLElement): DOMRect | null {
  const sel = raiz.ownerDocument.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0).cloneRange()
  r.collapse(true)
  const rects = r.getClientRects()
  if (rects.length > 0 && (rects[0] as DOMRect).height > 0) return rects[0] as DOMRect
  const s = seleccionEn(raiz)
  const total = longitudDe(raiz)
  if (!s || total === 0) return null
  const doc = raiz.ownerDocument
  const ancho = doc.createRange()
  const desde = s.inicio < total ? s.inicio : s.inicio - 1
  const p = puntoEn(raiz, desde)
  const q = puntoEn(raiz, desde + 1)
  ancho.setStart(p.nodo, p.offset)
  ancho.setEnd(q.nodo, q.offset)
  const rs = ancho.getClientRects()
  const rect = rs[rs.length > 1 && s.inicio < total ? 0 : rs.length - 1]
  if (!rect) return null
  // Si se midio el caracter de la izquierda, el cursor esta en su borde derecho.
  return s.inicio < total ? rect : new DOMRect(rect.right, rect.top, 0, rect.height)
}

function alturaDeLinea(el: HTMLElement): number {
  const cs = getComputedStyle(el)
  const lh = Number.parseFloat(cs.lineHeight)
  return Number.isFinite(lh) ? lh : Number.parseFloat(cs.fontSize) * 1.4
}

/** Si el cursor esta en la primera linea visual del elemento. */
export function enPrimeraLinea(raiz: HTMLElement): boolean {
  const c = rectDelCursor(raiz)
  if (!c) return true
  const r = raiz.getBoundingClientRect()
  const pad = Number.parseFloat(getComputedStyle(raiz).paddingTop) || 0
  return c.top - (r.top + pad) < alturaDeLinea(raiz) * 0.6
}

/** Si el cursor esta en la ultima linea visual del elemento. */
export function enUltimaLinea(raiz: HTMLElement): boolean {
  const c = rectDelCursor(raiz)
  if (!c) return true
  const r = raiz.getBoundingClientRect()
  const pad = Number.parseFloat(getComputedStyle(raiz).paddingBottom) || 0
  return r.bottom - pad - c.bottom < alturaDeLinea(raiz) * 0.6
}

/** La x del cursor, para conservar la columna al saltar de un bloque a otro. */
export function xDelCursor(raiz: HTMLElement): number | null {
  return rectDelCursor(raiz)?.left ?? null
}

/** Pone el cursor en el punto (x, y) de la pantalla, si cae dentro del elemento. */
export function cursorEnPunto(raiz: HTMLElement, x: number, y: number): boolean {
  const doc = raiz.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  let nodo: Node | null = null
  let offset = 0
  const pos = doc.caretPositionFromPoint?.(x, y)
  if (pos) {
    nodo = pos.offsetNode
    offset = pos.offset
  } else {
    const r = doc.caretRangeFromPoint?.(x, y)
    if (r) {
      nodo = r.startContainer
      offset = r.startOffset
    }
  }
  if (!nodo || !raiz.contains(nodo)) return false
  ponerCursor(raiz, desplazamiento(raiz, nodo, offset))
  return true
}

/**
 * Entra en un elemento navegable desde arriba o desde abajo, conservando la
 * columna. Un elemento editable recibe el cursor en su primera o ultima linea;
 * cualquier otro (una tarjeta de ilustracion, un cambio de escena) solo el foco.
 */
export function entrarEn(el: HTMLElement, desde: 'arriba' | 'abajo', x: number | null): void {
  el.focus({ preventScroll: false })
  if (el.isContentEditable) {
    const r = el.getBoundingClientRect()
    const linea = alturaDeLinea(el)
    const y = desde === 'abajo' ? r.bottom - linea / 2 : r.top + linea / 2
    if (x === null || !cursorEnPunto(el, x, y)) ponerCursor(el, desde === 'abajo' ? 'fin' : 'inicio')
  } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const n = desde === 'abajo' ? el.value.length : 0
    el.setSelectionRange(n, n)
  }
  el.scrollIntoView({ block: 'nearest' })
}

/** El elemento navegable anterior o siguiente dentro del mismo editor. */
export function vecino(el: HTMLElement, sentido: -1 | 1): HTMLElement | null {
  const editor = el.closest('[data-editor]')
  if (!editor) return null
  const todos = Array.from(editor.querySelectorAll<HTMLElement>('[data-navegable]'))
  const i = todos.findIndex((x) => x === el || x.contains(el))
  return i === -1 ? null : (todos[i + sentido] ?? null)
}

/** El elemento que lleva un objetivo de foco. */
export function porObjetivo(objetivo: string, dentro: ParentNode = document): HTMLElement | null {
  return dentro.querySelector<HTMLElement>(`[data-objetivo="${CSS.escape(objetivo)}"]`)
}
