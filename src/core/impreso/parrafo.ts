/**
 * Componer un parrafo: de su texto con estilos a lineas de glifos colocados.
 *
 * Es el algoritmo de Knuth y Plass (el de TeX): en vez de llenar cada linea
 * y pasar a la siguiente, mira el parrafo entero y elige los cortes que dejan
 * los espacios mas parejos, con lo que cuesta cada guion. El modelo es el de
 * TeX, con sus mismos nombres en español:
 *
 *   caja          algo con ancho fijo (un trozo de palabra)
 *   cola          un espacio, que puede estirar y encoger
 *   penalizacion  un sitio donde se puede cortar pagando algo (un guion)
 *
 * Las reglas de oficio que se aplican aqui, cada una con su test:
 *   - nunca tres lineas seguidas acabadas en guion (se descarta el corte);
 *   - la ultima palabra del parrafo no se parte (no se le ponen guiones);
 *   - la raya de dialogo va pegada a su palabra: «—Hola», nunca «—» a final
 *     de linea; y si el autor escribio «— Hola» con espacio, ese espacio no
 *     es un sitio de corte;
 *   - y para el paginador: se puede prohibir el guion en una linea concreta
 *     (la ultima de una pagina impar) y recomponer desde ahi.
 */
import type { Particion } from './guiones'
import { particionDe } from './guiones'
import type { Fuente, Glifo } from './sfnt'
import type { Cara, Fuentes } from './tipos'

export interface Trozo {
  readonly texto: string
  readonly cara: Cara
}

/** Un trozo de linea ya colocado: glifos seguidos de una cara, desde `x`. */
export interface Pieza {
  readonly x: number
  readonly cara: Cara
  readonly glifos: readonly Glifo[]
}

export interface Linea {
  readonly piezas: readonly Pieza[]
  /** Acaba en guion (de particion o uno que ya estaba en la palabra). */
  readonly guion: boolean
  readonly texto: string
  /** Lo que ocupa con los espacios a su medida natural. */
  readonly natural: number
  /** La medida de esta linea y donde empieza (las de un verso largo entran mas). */
  readonly ancho: number
  readonly desde: number
  readonly desbordada: boolean
}

export type Modo = 'justificado' | 'bandera' | 'centrado'

export interface OpcionesParrafo {
  readonly cuerpo: number
  readonly ancho: number
  readonly modo: Modo
  /** Partir palabras (solo si hay patrones para el idioma). */
  readonly partir: boolean
  /** Sangria de la primera linea, en puntos. */
  readonly sangria?: number
  /** Cuanto entran las lineas que no son la primera (versos largos), en puntos. */
  readonly colgante?: number
  /** Espacio extra entre letras, en em (el numero de capitulo va espaciado). */
  readonly espaciado?: number
}

// ---------------------------------------------------------------------------
// Del HTML del parser a trozos con su cara
// ---------------------------------------------------------------------------

const ENTIDADES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * El HTML en linea que da `enLinea` (`<em>`, `<strong>` y tres entidades) a
 * trozos de texto con su cara. Dentro de un texto ya en cursiva (los versos),
 * `<em>` vuelve a redonda, como manda la ortotipografia.
 *
 * Se normaliza a NFC: una tilde escrita como letra + acento suelto (como sale
 * a veces de un Mac) no esta en el cmap de la fuente como una letra.
 */
export function trozosDeHtml(html: string, base: Cara = 'regular'): Trozo[] {
  const cursivaBase = base === 'cursiva' || base === 'negritaCursiva'
  const negritaBase = base === 'negrita' || base === 'negritaCursiva'
  let em = 0
  let strong = 0
  const r: Trozo[] = []
  const meter = (texto: string): void => {
    const cursiva = cursivaBase !== em > 0
    const negrita = negritaBase || strong > 0
    const cara: Cara = negrita ? (cursiva ? 'negritaCursiva' : 'negrita') : cursiva ? 'cursiva' : 'regular'
    const ultimo = r[r.length - 1]
    if (ultimo && ultimo.cara === cara) r[r.length - 1] = { texto: ultimo.texto + texto, cara }
    else r.push({ texto, cara })
  }
  for (const m of html.matchAll(/<(\/?)(em|strong)>|&(#x[0-9a-f]+|#\d+|[a-z]+);|[^<&]+|[<&]/giu)) {
    if (m[2]) {
      const delta = m[1] ? -1 : 1
      if (m[2].toLowerCase() === 'em') em = Math.max(0, em + delta)
      else strong = Math.max(0, strong + delta)
    } else if (m[3]) {
      const e = m[3].toLowerCase()
      const cp = e.startsWith('#x') ? parseInt(e.slice(2), 16) : e.startsWith('#') ? parseInt(e.slice(1), 10) : null
      meter(cp !== null && Number.isFinite(cp) ? String.fromCodePoint(cp) : (ENTIDADES[e] ?? m[0]))
    } else {
      meter(m[0])
    }
  }
  return r.map((t) => ({ texto: t.texto.normalize('NFC'), cara: t.cara }))
}

// ---------------------------------------------------------------------------
// Palabras y espacios
// ---------------------------------------------------------------------------

type Ficha =
  | { readonly k: 'palabra'; readonly trozos: readonly Trozo[] }
  | { k: 'espacio'; rompe: boolean; readonly estira: boolean; readonly cara: Cara }

const ESPACIO = /[ \t\n\r]/u
const ESPACIO_DURO = ' '
const ESPACIO_FINO = /[   ]/u
const SOLO_RAYAS = /^[—–―]+$/u

function fichas(trozos: readonly Trozo[], idioma: string): Ficha[] {
  const r: Ficha[] = []
  let palabra: Trozo[] = []
  const cerrar = (): void => {
    if (palabra.length > 0) r.push({ k: 'palabra', trozos: palabra })
    palabra = []
  }
  for (const t of trozos) {
    let actual = ''
    const soltar = (): void => {
      if (!actual) return
      const ultimo = palabra[palabra.length - 1]
      if (ultimo && ultimo.cara === t.cara) palabra[palabra.length - 1] = { texto: ultimo.texto + actual, cara: t.cara }
      else palabra.push({ texto: actual, cara: t.cara })
      actual = ''
    }
    for (const c of t.texto) {
      const espacio = ESPACIO.test(c) ? 'normal' : c === ESPACIO_DURO ? 'duro' : ESPACIO_FINO.test(c) ? 'fino' : null
      if (!espacio) {
        actual += c
        continue
      }
      soltar()
      cerrar()
      const previo = r[r.length - 1]
      // Varios espacios seguidos son uno; el que no rompe manda.
      if (previo?.k === 'espacio') {
        if (espacio !== 'normal') previo.rompe = false
        continue
      }
      if (r.length === 0) continue
      r.push({ k: 'espacio', rompe: espacio === 'normal', estira: espacio !== 'fino', cara: t.cara })
    }
    soltar()
  }
  cerrar()
  while (r[r.length - 1]?.k === 'espacio') r.pop()
  // La raya suelta se pega a su palabra: en español abre (va con la siguiente),
  // en ingles la raya con espacios cierra (va con la anterior).
  const es = idioma.toLowerCase().startsWith('es')
  for (let i = 0; i < r.length; i++) {
    const f = r[i] as Ficha
    if (f.k !== 'palabra' || !SOLO_RAYAS.test(f.trozos.map((t) => t.texto).join(''))) continue
    // Al principio del parrafo, en cualquier idioma, abre.
    const vecino = r[es || i === 0 ? i + 1 : i - 1]
    if (vecino?.k === 'espacio') vecino.rompe = false
  }
  return r
}

// ---------------------------------------------------------------------------
// La lista de cajas, colas y penalizaciones
// ---------------------------------------------------------------------------

const INF = 10000
/** El estiramiento «infinito» de la cola que acaba el parrafo. */
const FIL = 1e7

interface GlifoColocado {
  readonly g: Glifo
  readonly cara: Cara
  /** Cuanto avanza en puntos (con kerning y espaciado). */
  readonly w: number
}

type Item =
  | { readonly t: 'caja'; readonly w: number; readonly glifos: readonly GlifoColocado[] }
  | { readonly t: 'cola'; readonly w: number; readonly est: number; readonly enc: number; readonly fin?: boolean }
  | {
      readonly t: 'pen'
      readonly w: number
      readonly p: number
      /** Corte con guion: cuenta para «nunca tres seguidos». */
      readonly guion: boolean
      /** El guion que se añade al cortar aqui (null si la palabra ya lo traia). */
      readonly anadir: { readonly cara: Cara; readonly antes: GlifoColocado; readonly ultimo: GlifoColocado; readonly guion: GlifoColocado } | null
    }

interface Corte {
  readonly pos: number
  readonly ini: number
  readonly r: number
}

const PENALIZACION_GUION = 50
const DEMERITOS_LINEA = 10
const DEMERITOS_CLASE = 10000
const DEMERITOS_DOS_GUIONES = 10000
const DEMERITOS_GUION_FINAL = 5000

function holgura(r: number): number {
  return r < -0.5 ? 0 : r <= 0.5 ? 1 : r <= 1 ? 2 : 3
}

function feura(r: number): number {
  return r >= INF ? INF : Math.min(INF, 100 * Math.abs(r) ** 3)
}

/** Donde empieza la linea que sigue a un corte en `i`: se saltan los espacios y penalizaciones. */
function tras(items: readonly Item[], i: number): number {
  let k = i + 1
  if (items[i]?.t === 'cola') k = i
  while (k < items.length && (items[k] as Item).t !== 'caja') {
    const it = items[k] as Item
    if (it.t === 'pen' && it.p <= -INF) break
    k++
  }
  return k
}

interface Nodo {
  readonly pos: number
  readonly ini: number
  readonly linea: number
  readonly clase: number
  readonly guiones: number
  readonly guion: boolean
  readonly dem: number
  readonly r: number
  readonly prev: Nodo | null
}

interface Restricciones {
  readonly tol: number
  readonly desde: number
  readonly lineaInicial: number
  readonly guionesIniciales: number
  readonly sinGuion: ReadonlySet<number>
}

function knuthPlass(items: readonly Item[], anchoDe: (linea: number) => number, o: Restricciones): Corte[] | null {
  const n = items.length
  const sw = new Float64Array(n + 1)
  const se = new Float64Array(n + 1)
  const sc = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const it = items[i] as Item
    sw[i + 1] = (sw[i] as number) + (it.t === 'pen' ? 0 : it.w)
    se[i + 1] = (se[i] as number) + (it.t === 'cola' ? it.est : 0)
    sc[i + 1] = (sc[i] as number) + (it.t === 'cola' ? it.enc : 0)
  }
  let activos: Nodo[] = [
    { pos: o.desde - 1, ini: o.desde, linea: o.lineaInicial, clase: 1, guiones: o.guionesIniciales, guion: o.guionesIniciales > 0, dem: 0, r: 0, prev: null },
  ]
  for (let i = o.desde; i < n; i++) {
    const it = items[i] as Item
    const legal = (it.t === 'pen' && it.p < INF) || (it.t === 'cola' && i > 0 && (items[i - 1] as Item).t === 'caja')
    if (!legal) continue
    const forzado = it.t === 'pen' && it.p <= -INF
    const siguen: Nodo[] = []
    const mejores = new Map<string, Nodo>()
    for (const a of activos) {
      const ancho = anchoDe(a.linea)
      const w = (sw[i] as number) - (sw[a.ini] as number) + (it.t === 'pen' ? it.w : 0)
      const est = (se[i] as number) - (se[a.ini] as number)
      const enc = (sc[i] as number) - (sc[a.ini] as number)
      const r = w < ancho ? (est > 0 ? (ancho - w) / est : INF) : w > ancho ? (enc > 0 ? (ancho - w) / enc : -INF) : 0
      if (r >= -1 && !forzado) siguen.push(a)
      if (r < -1 || r > o.tol) continue
      const guion = it.t === 'pen' && it.guion
      // Nunca tres lineas seguidas con guion, y ninguno donde el paginador lo prohibe.
      if (guion && (a.guiones >= 2 || o.sinGuion.has(a.linea))) continue
      const b = feura(r)
      const p = it.t === 'pen' ? it.p : 0
      let d = (DEMERITOS_LINEA + b) ** 2
      if (p > 0) d += p * p
      else if (p > -INF) d -= p * p
      const clase = holgura(r)
      if (Math.abs(clase - a.clase) > 1) d += DEMERITOS_CLASE
      if (guion && a.guion) d += DEMERITOS_DOS_GUIONES
      if (forzado && a.guion) d += DEMERITOS_GUION_FINAL
      const nodo: Nodo = { pos: i, ini: tras(items, i), linea: a.linea + 1, clase, guiones: guion ? a.guiones + 1 : 0, guion, dem: a.dem + d, r, prev: a }
      const clave = `${nodo.linea}/${clase}/${nodo.guiones}`
      const m = mejores.get(clave)
      if (!m || nodo.dem < m.dem) mejores.set(clave, nodo)
    }
    activos = [...siguen, ...mejores.values()]
    if (activos.length === 0) return null
  }
  let fin: Nodo | null = null
  for (const a of activos) if (a.pos === n - 1 && (!fin || a.dem < fin.dem)) fin = a
  if (!fin) return null
  const cortes: Corte[] = []
  for (let a: Nodo | null = fin; a?.prev; a = a.prev) cortes.unshift({ pos: a.pos, ini: a.prev.ini, r: a.r })
  return cortes
}

/** La razon de ajuste de la linea [ini, pos]: cuanto estiran (>0) o encogen (<0) sus espacios. */
function razon(items: readonly Item[], ini: number, pos: number, ancho: number): number {
  let w = 0
  let est = 0
  let enc = 0
  for (let j = ini; j < pos; j++) {
    const it = items[j] as Item
    if (it.t === 'pen') continue
    w += it.w
    if (it.t === 'cola') {
      est += it.est
      enc += it.enc
    }
  }
  const fin = items[pos] as Item
  if (fin.t === 'pen') w += fin.w
  return w < ancho ? (est > 0 ? (ancho - w) / est : 0) : w > ancho ? (enc > 0 ? Math.max(-1, (ancho - w) / enc) : -1) : 0
}

/**
 * El ultimo recurso, cuando ni con espacios enormes cabe (una palabra mas
 * larga que la linea): llenar cada linea hasta donde quepa y desbordar si no
 * hay otro remedio. Siempre da un resultado.
 */
function primerAjuste(items: readonly Item[], anchoDe: (linea: number) => number, desde: number, lineaInicial: number): Corte[] {
  const cortes: Corte[] = []
  let ini = desde
  let linea = lineaInicial
  let w = 0
  let ultimo = -1
  const cortar = (pos: number): void => {
    cortes.push({ pos, ini, r: razon(items, ini, pos, anchoDe(linea)) })
    ini = tras(items, pos)
    linea++
    w = 0
    ultimo = -1
  }
  for (let i = desde; i < items.length; i++) {
    const it = items[i] as Item
    const ancho = anchoDe(linea) + 1e-6
    if (it.t === 'pen' && it.p <= -INF) {
      if (w > ancho && ultimo >= 0) {
        cortar(ultimo)
        i = ini - 1
        continue
      }
      cortar(i)
      break
    }
    const legal = (it.t === 'pen' && it.p < INF) || (it.t === 'cola' && i > 0 && (items[i - 1] as Item).t === 'caja')
    if (legal) {
      if (w + (it.t === 'pen' ? it.w : 0) <= ancho) ultimo = i
      else {
        cortar(ultimo >= 0 ? ultimo : i)
        i = ini - 1
        continue
      }
    }
    if (it.t !== 'pen') w += it.w
  }
  return cortes
}

// ---------------------------------------------------------------------------
// El componedor
// ---------------------------------------------------------------------------

export class Componedor {
  readonly fuentes: Fuentes
  readonly idioma: string
  readonly particion: Particion | null
  /** Caracteres que la fuente no tiene, de todo lo compuesto. */
  readonly faltan = new Set<string>()
  private readonly medidas = new Map<string, number>()

  constructor(fuentes: Fuentes, idioma: string) {
    this.fuentes = fuentes
    this.idioma = idioma
    this.particion = particionDe(idioma)
  }

  /** El ancho de un texto en una cara y un cuerpo, sin cortar. */
  medir(texto: string, cara: Cara, cuerpo: number): number {
    const clave = `${cara}|${cuerpo}|${texto}`
    let w = this.medidas.get(clave)
    if (w === undefined) {
      const f = this.fuentes[cara]
      w = (f.formar(texto.normalize('NFC')).ancho * cuerpo) / f.upm
      if (texto.length < 8) this.medidas.set(clave, w)
    }
    return w
  }

  parrafo(trozos: readonly Trozo[], o: OpcionesParrafo): Parrafo {
    const items = this.items(trozos, o)
    const colgante = o.colgante ?? 0
    const anchoDe = (linea: number): number => (linea === 0 ? o.ancho : o.ancho - colgante)
    const { cortes, tol } = componer(items, anchoDe)
    return new Parrafo(this, items, o, anchoDe, cortes, tol)
  }

  /**
   * El glifo con su avance en puntos. El espaciado entre letras va DENTRO del
   * avance del glifo (en unidades de la fuente): quien pinta las operaciones
   * (el PDF, el lienzo) solo ve los avances, y si fuera aparte lo perderia.
   */
  private colocar(fuente: Fuente, cara: Cara, g: Glifo, cuerpo: number, extra: number): GlifoColocado {
    const con = extra === 0 ? g : { ...g, avance: g.avance + (extra * fuente.upm) / cuerpo }
    return { g: con, cara, w: (con.avance * cuerpo) / fuente.upm }
  }

  private items(trozos: readonly Trozo[], o: OpcionesParrafo): Item[] {
    const lista = fichas(trozos, this.idioma)
    const items: Item[] = []
    const extra = (o.espaciado ?? 0) * o.cuerpo
    const partir = o.partir && o.modo === 'justificado' ? this.particion : null
    const espacio = (cara: Cara): number => this.medir(' ', cara, o.cuerpo)
    const ragged = o.modo !== 'justificado'
    // El estiramiento de la bandera: 3 em, como el \raggedright de TeX. Lo
    // centrado (un titulo, una dedicatoria) estira la medida entera: con 3 em
    // dos lineas parejas quedaban fuera de toda tolerancia, todos los cortes
    // empataban y salia «Dicho de / la costa, que nadie recuerda…». Con la
    // medida entera la mala nota crece con lo que falta, y gana el reparto
    // parejo; lo que cabe en una linea sigue en una.
    const bandera = o.modo === 'centrado' ? o.ancho : 3 * o.cuerpo
    if (o.sangria && o.sangria > 0) items.push({ t: 'caja', w: o.sangria, glifos: [] })
    const ultimaPalabra = lista.reduce((u, f, i) => (f.k === 'palabra' && /\p{L}/u.test(f.trozos.map((t) => t.texto).join('')) ? i : u), -1)

    lista.forEach((f, idx) => {
      if (f.k === 'espacio') {
        const s = f.estira ? espacio(f.cara) : espacio(f.cara) * 0.5
        if (!f.rompe) items.push({ t: 'pen', w: 0, p: INF, guion: false, anadir: null })
        if (ragged) {
          if (f.rompe) {
            items.push({ t: 'cola', w: 0, est: bandera, enc: 0 })
            items.push({ t: 'pen', w: 0, p: 0, guion: false, anadir: null })
            items.push({ t: 'cola', w: s, est: -bandera, enc: 0 })
          } else items.push({ t: 'cola', w: s, est: 0, enc: 0 })
        } else {
          items.push({ t: 'cola', w: s, est: f.estira ? s / 2 : 0, enc: f.estira ? s / 3 : 0 })
        }
        return
      }
      // La palabra, glifo a glifo, con el kerning entre trozos de la misma cara.
      const glifos: GlifoColocado[] = []
      const fin: number[] = []
      let n = 0
      f.trozos.forEach((t, i) => {
        const fuente = this.fuentes[t.cara]
        const sig = f.trozos[i + 1]
        const siguiente = sig && sig.cara === t.cara ? fuente.glifo(sig.texto.codePointAt(0) as number) : undefined
        const forma = fuente.formar(t.texto, siguiente)
        for (const c of forma.faltan) this.faltan.add(c)
        for (const g of forma.glifos) {
          glifos.push(this.colocar(fuente, t.cara, g, o.cuerpo, extra))
          n += [...g.texto].length
          fin.push(n)
        }
      })
      // Donde se puede cortar dentro de la palabra (en puntos de codigo).
      const texto = [...f.trozos.map((t) => t.texto).join('')]
      const cortes = new Map<number, 'silaba' | 'guion' | 'raya'>()
      if (idx !== ultimaPalabra) {
        if (partir) {
          // Cada tramo de letras se parte por su cuenta: «franco-alemán» son dos.
          for (let i = 0; i < texto.length; ) {
            if (!/\p{L}/u.test(texto[i] as string)) {
              i++
              continue
            }
            let j = i
            while (j < texto.length && /[\p{L}\p{M}]/u.test(texto[j] as string)) j++
            const antes = texto[i - 1]
            const despues = texto[j]
            // Junto a cifras no se parte (3er, 1980s).
            if (!(antes && /\p{N}/u.test(antes)) && !(despues && /\p{N}/u.test(despues))) {
              for (const c of partir.cortes(texto.slice(i, j).join(''))) cortes.set(i + c, 'silaba')
            }
            i = j
          }
        }
        if (!this.idioma.toLowerCase().startsWith('es')) {
          // En ingles se corta tras un guion o una raya entre letras (well-|known).
          for (let i = 1; i + 1 < texto.length; i++) {
            const c = texto[i] as string
            if (/\p{L}/u.test(texto[i - 1] as string) && /\p{L}/u.test(texto[i + 1] as string)) {
              if (c === '-' || c === '‐') cortes.set(i + 1, 'guion')
              else if (c === '—' || c === '–') cortes.set(i + 1, 'raya')
            }
          }
        }
      }
      // Solo donde acaba un glifo: dentro de una ligadura («ffi») no se corta.
      let desde = 0
      for (let k = 0; k < glifos.length; k++) {
        const tipo = cortes.get(fin[k] as number)
        if (!tipo || k === glifos.length - 1) continue
        const parte = glifos.slice(desde, k + 1)
        items.push({ t: 'caja', w: parte.reduce((s, g) => s + g.w, 0), glifos: parte })
        desde = k + 1
        const ultimo = glifos[k] as GlifoColocado
        if (tipo === 'silaba') {
          const fuente = this.fuentes[ultimo.cara]
          const id = fuente.glifo(0x2d)
          // El ultimo glifo trae el kerning con el que le seguia; con el guion es otro.
          const crudo = fuente.avance(ultimo.g.id)
          const ultimoNuevo = this.colocar(fuente, ultimo.cara, { ...ultimo.g, avance: crudo + fuente.kern(ultimo.g.id, id) }, o.cuerpo, extra)
          const guion = this.colocar(fuente, ultimo.cara, { id, avance: fuente.avance(id), texto: '-' }, o.cuerpo, extra)
          items.push({ t: 'pen', w: ultimoNuevo.w - ultimo.w + guion.w, p: PENALIZACION_GUION, guion: true, anadir: { cara: ultimo.cara, antes: ultimo, ultimo: ultimoNuevo, guion } })
        } else {
          items.push({ t: 'pen', w: 0, p: PENALIZACION_GUION, guion: tipo === 'guion', anadir: null })
        }
      }
      const resto = glifos.slice(desde)
      items.push({ t: 'caja', w: resto.reduce((s, g) => s + g.w, 0), glifos: resto })
    })
    items.push({ t: 'pen', w: 0, p: INF, guion: false, anadir: null })
    // Centrado (un titulo), la ultima linea tambien cuenta: asi las lineas salen parejas.
    items.push({ t: 'cola', w: 0, est: o.modo === 'centrado' ? bandera : FIL, enc: 0, fin: true })
    items.push({ t: 'pen', w: 0, p: -INF, guion: false, anadir: null })
    return items
  }
}

const PASADAS = [1.26, 2, 4, Infinity]

/**
 * Las pasadas: espacios parejos; si no, mas holgados; si no, lo que sea; y si
 * no, llenar y desbordar. Devuelve tambien con que tolerancia salio.
 */
function componer(items: readonly Item[], anchoDe: (l: number) => number): { cortes: Corte[]; tol: number } {
  for (const tol of PASADAS) {
    const cortes = knuthPlass(items, anchoDe, { tol, desde: 0, lineaInicial: 0, guionesIniciales: 0, sinGuion: new Set() })
    if (cortes) return { cortes, tol }
  }
  return { cortes: primerAjuste(items, anchoDe, 0, 0), tol: Infinity }
}

export class Parrafo {
  readonly lineas: readonly Linea[]
  private readonly c: Componedor
  private readonly items: readonly Item[]
  private readonly o: OpcionesParrafo
  private readonly anchoDe: (l: number) => number
  private readonly cortes: readonly Corte[]
  /** La tolerancia con que salio: recomponer no puede dejarlo peor que eso. */
  private readonly tol: number

  constructor(c: Componedor, items: readonly Item[], o: OpcionesParrafo, anchoDe: (l: number) => number, cortes: readonly Corte[], tol: number) {
    this.c = c
    this.items = items
    this.o = o
    this.anchoDe = anchoDe
    this.cortes = cortes
    this.tol = tol
    this.lineas = cortes.map((k, i) => this.linea(k, i))
  }

  /**
   * El mismo parrafo con las lineas [0, desde) intactas (ya estan en otra
   * pagina) y el resto recompuesto sin guion en las lineas de `sinGuion`
   * (numeradas desde el principio del parrafo). null si asi no hay manera de
   * componerlo con espacios no peores que los que ya tenia el parrafo (y
   * nunca enormes): el paginador busca otra salida.
   */
  recomponer(desde: number, sinGuion: ReadonlySet<number>): Parrafo | null {
    if (desde >= this.cortes.length) return null
    let previos = 0
    for (let i = desde - 1; i >= 0 && this.lineas[i]?.guion; i--) previos++
    const ini = (this.cortes[desde] as Corte).ini
    for (const tol of PASADAS.filter((t) => t <= Math.max(2, this.tol) && t < Infinity)) {
      const nuevos = knuthPlass(this.items, this.anchoDe, { tol, desde: ini, lineaInicial: desde, guionesIniciales: previos, sinGuion })
      // El primer corte nuevo arranca donde acababa el ultimo fijo.
      if (nuevos) return new Parrafo(this.c, this.items, this.o, this.anchoDe, [...this.cortes.slice(0, desde), ...nuevos], Math.max(tol, this.tol))
    }
    return null
  }

  private linea(k: Corte, i: number): Linea {
    const items = this.items
    const ancho = this.anchoDe(i)
    const desde = i === 0 ? 0 : (this.o.colgante ?? 0)
    const justificar = this.o.modo === 'justificado'
    const final = items[k.pos] as Item
    const ultima = final.t === 'pen' && final.p <= -INF
    // En la ultima linea los espacios van a su medida, salvo que haya que encoger.
    const r = !justificar ? 0 : ultima ? Math.min(0, k.r) : k.r
    const piezas: { x: number; cara: Cara; glifos: Glifo[] }[] = []
    let x = 0
    let natural = 0
    let pegada = false
    let texto = ''
    let fin = k.pos
    if (final.t === 'cola') fin = k.pos - 1
    for (let j = k.ini; j <= fin; j++) {
      const it = items[j] as Item
      if (it.t === 'caja') {
        if (it.glifos.length === 0) {
          // La sangria: espacio sin nada dentro.
          x += it.w
          pegada = false
        }
        for (const g of it.glifos) {
          // Glifos de la misma cara sin espacio de por medio van en la misma pieza.
          const ult = piezas[piezas.length - 1]
          if (pegada && ult && ult.cara === g.cara) ult.glifos.push(g.g)
          else piezas.push({ x, cara: g.cara, glifos: [g.g] })
          pegada = true
          x += g.w
          texto += g.g.texto
        }
        natural += it.w
      } else if (it.t === 'cola') {
        if (it.fin) continue
        const w = it.w + (r > 0 ? r * it.est : r < 0 ? r * it.enc : 0)
        x += justificar ? w : it.w
        natural += it.w
        if (it.w > 0) {
          texto += ' '
          pegada = false
        }
      }
    }
    let guion = false
    if (final.t === 'pen' && !ultima) {
      guion = final.guion
      if (final.anadir) {
        const p = piezas[piezas.length - 1]
        if (p) {
          p.glifos[p.glifos.length - 1] = final.anadir.ultimo.g
          p.glifos.push(final.anadir.guion.g)
        }
        texto += '-'
        natural += final.w
        x += final.w
      }
    }
    texto = texto.replace(/\s+$/u, '')
    let desplazar = 0
    if (this.o.modo === 'centrado') desplazar = (ancho - natural) / 2
    return {
      piezas: piezas.map((p) => ({ x: p.x + desplazar, cara: p.cara, glifos: p.glifos })),
      guion,
      texto,
      natural,
      ancho,
      desde,
      desbordada: x > ancho + 0.01,
    }
  }
}
