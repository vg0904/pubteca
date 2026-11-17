/**
 * Colocar a mano sin que quede «a ojo»: el iman, el tope entre piezas, las
 * asas de las esquinas y los botones de alinear. Puro: se prueba en Node.
 *
 * Al arrastrar, la pieza se pega (si pasa a menos de `umbral` puntos):
 *   - al centro de su cara, a lo ancho y a lo alto;
 *   - al margen de los estilos: 1/10 A dentro del corte por los lados y por
 *     arriba, y la linea base (13 mm) por abajo;
 *   - a los bordes y al centro de las otras piezas de su cara (el sello y el
 *     codigo con el pie alineado, la sinopsis con el sello a la izquierda);
 *   - a su sitio, el del estilo.
 * Cada cosa a la que se pega es una guia que la vista dibuja. Con Alt, sin iman.
 *
 * Y siempre, con iman o sin el: nada sale de lo seguro de KDP (lo limita
 * tambien el compositor) y ninguna pieza pisa a otra de su cara: se para a
 * HUECO de la primera que encuentra en su camino. Si ya se pisaban (un estilo
 * que las junta mucho), esa no la para: asi se pueden separar.
 */
import { LINEA_BASE, SEGURIDAD, type Caja, type CubiertaCompuesta } from '../../core/impreso/cubierta'
import type { Ajuste, PiezaContra, Punto } from '../../core/impreso/cubierta-config'
import { esDeContra, escalaDe, escalaLimitada, movidaDe, type PiezaMovible } from './mover'

const MM = 72 / 25.4
/** Lo que se deja entre dos piezas como poco. */
export const HUECO = 3 * MM
const EPS = 1e-6

export type TipoGuia = 'centro' | 'margen' | 'pieza' | 'sitio' | 'limite'
/** Una linea a la que se pego la pieza: vertical (`x`) u horizontal (`y`), en puntos de la hoja. */
export interface Guia {
  readonly eje: 'x' | 'y'
  readonly en: number
  readonly desde: number
  readonly hasta: number
  readonly tipo: TipoGuia
}

export interface Colocada {
  /** Lo que se pide al compositor, en fracciones de A. */
  readonly movida: Punto
  readonly caja: Caja
  readonly guias: readonly Guia[]
}

/** Una esquina: n/s (arriba, abajo) y o/e (izquierda, derecha). */
export type Esquina = 'no' | 'ne' | 'so' | 'se'
export const ESQUINAS: readonly Esquina[] = ['no', 'ne', 'so', 'se']
/** De que esquina crece cada pieza en el compositor: la que se queda quieta al cambiar el tamaño sin mover. */
export const ANCLA: Readonly<Record<PiezaContra, Esquina>> = { codigo: 'se', selloContra: 'so', sinopsis: 'no' }

export type Alineacion = 'izquierda' | 'centro' | 'derecha' | 'arriba' | 'medio' | 'abajo'

const derecha = (k: Caja): number => k.x + k.ancho
const abajo = (k: Caja): number => k.y + k.alto
const mover = (k: Caja, dx: number, dy: number): Caja => ({ ...k, x: k.x + dx, y: k.y + dy })
const ensanchar = (k: Caja, d: number): Caja => ({ x: k.x - d, y: k.y - d, ancho: k.ancho + 2 * d, alto: k.alto + 2 * d })
const seCortan = (a: Caja, b: Caja): boolean => a.x < derecha(b) - EPS && b.x < derecha(a) - EPS && a.y < abajo(b) - EPS && b.y < abajo(a) - EPS
const dentro = (k: Caja, z: Caja): boolean => k.x >= z.x - EPS && k.y >= z.y - EPS && derecha(k) <= derecha(z) + EPS && abajo(k) <= abajo(z) + EPS

/** La cara de una pieza: la portada o la contraportada, por su corte. */
export const caraDe = (c: CubiertaCompuesta, que: PiezaMovible): Caja => (esDeContra(que) ? c.medidas.contra : c.medidas.portada)

/** Lo seguro de una cara: 0,125 in dentro del corte. */
export const zonaDe = (cara: Caja): Caja => ensanchar(cara, -SEGURIDAD)

export function cajaDe(c: CubiertaCompuesta, que: PiezaMovible): Caja {
  const k = c.piezas.find((p) => p.que === que)?.caja
  if (!k) throw new Error(`No hay ${que} en la cubierta.`)
  return k
}

/** Las demas piezas de la misma cara (movibles o no: la caja libre del codigo de KDP tambien cuenta). */
export function vecinas(c: CubiertaCompuesta, que: PiezaMovible): readonly { readonly que: string; readonly caja: Caja }[] {
  const cara = caraDe(c, que)
  return c.piezas.filter((p) => {
    if (p.que === que) return false
    const cx = p.caja.x + p.caja.ancho / 2
    const cy = p.caja.y + p.caja.alto / 2
    return cx >= cara.x && cx <= derecha(cara) && cy >= cara.y && cy <= abajo(cara)
  })
}

/** Dentro de lo seguro, como lo dejara el compositor. */
function limitada(k: Caja, z: Caja): Caja {
  const x = k.ancho > z.ancho ? k.x : Math.min(derecha(z) - k.ancho, Math.max(z.x, k.x))
  const y = k.alto > z.alto ? k.y : Math.min(abajo(z) - k.alto, Math.max(z.y, k.y))
  return { ...k, x, y }
}

/** Cuando (0..1 del camino) entra `p`, moviendose `dx`, `dy`, en `o`, y por que eje; null si no entra. */
function entrada(p: Caja, dx: number, dy: number, o: Caja): { readonly t: number; readonly eje: 'x' | 'y' } | null {
  const tramo = (ini: number, largo: number, oIni: number, oLargo: number, d: number): readonly [number, number] | null => {
    if (Math.abs(d) < EPS) return ini < oIni + oLargo - EPS && ini + largo > oIni + EPS ? [-Infinity, Infinity] : null
    const a = (oIni - (ini + largo)) / d
    const b = (oIni + oLargo - ini) / d
    return d > 0 ? [a, b] : [b, a]
  }
  const x = tramo(p.x, p.ancho, o.x, o.ancho, dx)
  const y = tramo(p.y, p.alto, o.y, o.alto, dy)
  if (!x || !y) return null
  const t0 = Math.max(x[0], y[0])
  const t1 = Math.min(x[1], y[1])
  if (t0 >= t1 - EPS || t0 < -EPS || t0 > 1) return null
  return { t: Math.max(0, t0), eje: x[0] >= y[0] ? 'x' : 'y' }
}

/**
 * Que no pise a ninguna: la caja va de `previa` hacia `k` en linea recta y se
 * para a HUECO de la primera pieza que encuentra en el camino (aunque el
 * puntero la salte entera en un cuadro). Lo que le queda resbala a lo largo
 * de esa pieza, como un objeto que topa con una pared.
 */
export function sinPisar(k: Caja, previa: Caja, otras: readonly Caja[]): Caja {
  // Las que ya pisaba no la paran (entrarian antes de empezar): asi se separan.
  const topes = otras.map((o) => ensanchar(o, HUECO))
  let r = previa
  let dx = k.x - previa.x
  let dy = k.y - previa.y
  for (let vuelta = 0; vuelta < 3 && (dx !== 0 || dy !== 0); vuelta++) {
    let t = 1
    let eje: 'x' | 'y' | null = null
    for (const o of topes) {
      const choque = entrada(r, dx, dy, o)
      if (choque && choque.t < t) ({ t, eje } = choque)
    }
    r = mover(r, dx * t, dy * t)
    if (!eje) return r
    if (eje === 'x') [dx, dy] = [0, dy * (1 - t)]
    else [dx, dy] = [dx * (1 - t), 0]
  }
  return r
}

interface Diana {
  readonly en: number
  readonly tipo: TipoGuia
  readonly desde: number
  readonly hasta: number
}

/** Donde se pega cada borde (0), centro (1) y borde final (2) de la pieza, en un eje. */
function dianas(c: CubiertaCompuesta, que: PiezaMovible, eje: 'x' | 'y', sitio: Caja): Diana[][] {
  const cara = caraDe(c, que)
  const A = c.medidas.portada.ancho
  const [ini, lar] = eje === 'x' ? (['x', 'ancho'] as const) : (['y', 'alto'] as const)
  const [oIni, oLar] = eje === 'x' ? (['y', 'alto'] as const) : (['x', 'ancho'] as const)
  const todaLaCara = { desde: cara[oIni], hasta: cara[oIni] + cara[oLar] }
  const d: Diana[][] = [[], [], []]
  d[1]?.push({ en: cara[ini] + cara[lar] / 2, tipo: 'centro', ...todaLaCara })
  d[0]?.push({ en: cara[ini] + A / 10, tipo: 'margen', ...todaLaCara })
  d[2]?.push({ en: eje === 'x' ? cara[ini] + cara[lar] - A / 10 : cara[ini] + cara[lar] - LINEA_BASE, tipo: 'margen', ...todaLaCara })
  for (const v of vecinas(c, que)) {
    const o = v.caja
    const linea = { desde: o[oIni], hasta: o[oIni] + o[oLar] }
    d[0]?.push({ en: o[ini], tipo: 'pieza', ...linea })
    d[1]?.push({ en: o[ini] + o[lar] / 2, tipo: 'pieza', ...linea })
    d[2]?.push({ en: o[ini] + o[lar], tipo: 'pieza', ...linea })
  }
  d[0]?.push({ en: sitio[ini], tipo: 'sitio', desde: sitio[oIni], hasta: sitio[oIni] + sitio[oLar] })
  return d
}

/** Pegar en un eje: lo que hay que mover la caja (0 si nada queda a menos de `umbral`). */
function pegar(k: Caja, eje: 'x' | 'y', d: Diana[][], umbral: number): number {
  const [ini, lar] = eje === 'x' ? (['x', 'ancho'] as const) : (['y', 'alto'] as const)
  const puntos = [k[ini], k[ini] + k[lar] / 2, k[ini] + k[lar]]
  let mejor = 0
  let distancia = umbral + EPS
  puntos.forEach((p, i) => {
    for (const t of d[i] ?? []) {
      const delta = t.en - p
      if (Math.abs(delta) < distancia) {
        distancia = Math.abs(delta)
        mejor = delta
      }
    }
  })
  return mejor
}

/** Las guias en las que ha quedado la caja: las dianas en las que cae justo, y los bordes de lo seguro que toca. */
function guiasDe(k: Caja, eje: 'x' | 'y', d: Diana[][], z: Caja, cara: Caja): Guia[] {
  const [ini, lar] = eje === 'x' ? (['x', 'ancho'] as const) : (['y', 'alto'] as const)
  const [oIni, oLar] = eje === 'x' ? (['y', 'alto'] as const) : (['x', 'ancho'] as const)
  const puntos = [k[ini], k[ini] + k[lar] / 2, k[ini] + k[lar]]
  const r: Guia[] = []
  puntos.forEach((p, i) => {
    for (const t of d[i] ?? []) {
      if (Math.abs(t.en - p) > 0.01) continue
      // Las de pieza, de una a otra: de la pieza a la que se alinea hasta la que se mueve.
      const desde = t.tipo === 'pieza' || t.tipo === 'sitio' ? Math.min(t.desde, k[oIni]) : t.desde
      const hasta = t.tipo === 'pieza' || t.tipo === 'sitio' ? Math.max(t.hasta, k[oIni] + k[oLar]) : t.hasta
      if (!r.some((g) => Math.abs(g.en - t.en) < 0.01)) r.push({ eje, en: t.en, desde, hasta, tipo: t.tipo })
    }
  })
  const todaLaCara = { desde: cara[oIni], hasta: cara[oIni] + cara[oLar] }
  if (Math.abs(k[ini] - z[ini]) < 0.01) r.push({ eje, en: z[ini], tipo: 'limite', ...todaLaCara })
  if (Math.abs(k[ini] + k[lar] - (z[ini] + z[lar])) < 0.01) r.push({ eje, en: z[ini] + z[lar], tipo: 'limite', ...todaLaCara })
  return r
}

/**
 * Donde queda una pieza que se pide en `pedida` (fracciones de A): dentro de
 * lo seguro, pegada a lo que tenga cerca (si `iman`) y sin pisar a ninguna.
 */
export function colocar(c: CubiertaCompuesta, que: PiezaMovible, pedida: Punto, o: { readonly umbral: number; readonly iman: boolean }): Colocada {
  const A = c.medidas.portada.ancho
  const ahora = cajaDe(c, que)
  const m0 = movidaDe(c, que)
  const cara = caraDe(c, que)
  const z = zonaDe(cara)
  const sitio = mover(ahora, -m0.x * A, -m0.y * A)
  const dx = dianas(c, que, 'x', sitio)
  const dy = dianas(c, que, 'y', sitio)
  let k = limitada(mover(ahora, (pedida.x - m0.x) * A, (pedida.y - m0.y) * A), z)
  if (o.iman) k = limitada(mover(k, pegar(k, 'x', dx, o.umbral), pegar(k, 'y', dy, o.umbral)), z)
  k = sinPisar(
    k,
    ahora,
    vecinas(c, que).map((v) => v.caja),
  )
  const guias = [...guiasDe(k, 'x', dx, z, cara), ...guiasDe(k, 'y', dy, z, cara)].filter((g) => o.iman || g.tipo === 'limite')
  return { movida: { x: m0.x + (k.x - ahora.x) / A, y: m0.y + (k.y - ahora.y) / A }, caja: k, guias }
}

/** Los botones de alinear: al margen de los estilos o al centro de su cara, sin pisar a nadie. */
export function alineada(c: CubiertaCompuesta, que: PiezaMovible, como: Alineacion): Punto {
  const A = c.medidas.portada.ancho
  const k = cajaDe(c, que)
  const m0 = movidaDe(c, que)
  const cara = caraDe(c, que)
  let x = k.x
  let y = k.y
  if (como === 'izquierda') x = cara.x + A / 10
  else if (como === 'centro') x = cara.x + (cara.ancho - k.ancho) / 2
  else if (como === 'derecha') x = derecha(cara) - A / 10 - k.ancho
  else if (como === 'arriba') y = cara.y + A / 10
  else if (como === 'medio') y = cara.y + (cara.alto - k.alto) / 2
  else y = abajo(cara) - LINEA_BASE - k.alto
  return colocar(c, que, { x: m0.x + (x - k.x) / A, y: m0.y + (y - k.y) / A }, { umbral: 0, iman: false }).movida
}

/** La esquina de una caja. */
const punto = (k: Caja, e: Esquina): { x: number; y: number } => ({ x: e.endsWith('o') ? k.x : derecha(k), y: e.startsWith('n') ? k.y : abajo(k) })
const opuesta = (e: Esquina): Esquina => `${e.startsWith('n') ? 's' : 'n'}${e.endsWith('o') ? 'e' : 'o'}` as Esquina

/** La esquina de la pieza bajo el puntero (a menos de `radio` puntos), o null. */
export function esquinaEn(c: CubiertaCompuesta, que: PiezaMovible, x: number, y: number, radio: number): Esquina | null {
  const k = cajaDe(c, que)
  let mejor: Esquina | null = null
  let d = radio
  for (const e of ESQUINAS) {
    const p = punto(k, e)
    const dist = Math.hypot(p.x - x, p.y - y)
    if (dist <= d) {
      d = dist
      mejor = e
    }
  }
  return mejor
}

/**
 * Otro tamaño para una pieza de la contraportada, con la esquina `fija` quieta:
 * dentro de lo que admite la pieza, de lo seguro y sin pisar a ninguna (si no
 * cabe tan grande, lo mas grande que quepa). Devuelve el ajuste para el compositor.
 */
export function conTamano(c: CubiertaCompuesta, que: PiezaContra, escala: number, fija: Esquina = ANCLA[que]): Ajuste {
  const A = c.medidas.portada.ancho
  const k = cajaDe(c, que)
  const e0 = escalaDe(c, que)
  const m0 = movidaDe(c, que)
  const z = zonaDe(caraDe(c, que))
  const otras = vecinas(c, que)
    .map((v) => ensanchar(v.caja, HUECO))
    .filter((o) => !seCortan(k, o))
  const p = punto(k, fija)
  const caja = (e: number): Caja => {
    const ancho = (k.ancho * e) / e0
    const alto = (k.alto * e) / e0
    return { x: fija.endsWith('o') ? p.x : p.x - ancho, y: fija.startsWith('n') ? p.y : p.y - alto, ancho, alto }
  }
  const vale = (e: number): boolean => {
    const b = caja(e)
    return dentro(b, z) && !otras.some((o) => seCortan(b, o))
  }
  let e = escalaLimitada(que, escala)
  if (e > e0 && !vale(e)) {
    // Lo mas grande que quepa, entre lo que tenia y lo pedido.
    let bajo = e0
    let alto = e
    for (let i = 0; i < 30; i++) {
      const medio = (bajo + alto) / 2
      if (vale(medio)) bajo = medio
      else alto = medio
    }
    e = bajo
  }
  // Lo que se mueve el ancla del compositor para que la esquina fija se quede quieta.
  const ancla = ANCLA[que]
  const antes = punto(k, ancla)
  const despues = punto(caja(e), ancla)
  return { x: m0.x + (despues.x - antes.x) / A, y: m0.y + (despues.y - antes.y) / A, escala: e }
}

/** Tirar de una esquina: el tamaño sale de cuanto se aleja el puntero de la esquina contraria, a lo largo de la diagonal. */
export function tirarDeEsquina(c: CubiertaCompuesta, que: PiezaContra, esquina: Esquina, hasta: { x: number; y: number }): Ajuste {
  const k = cajaDe(c, que)
  const o = punto(k, opuesta(esquina))
  const p = punto(k, esquina)
  const vx = p.x - o.x
  const vy = p.y - o.y
  const t = ((hasta.x - o.x) * vx + (hasta.y - o.y) * vy) / (vx * vx + vy * vy)
  return conTamano(c, que, escalaDe(c, que) * Math.max(0.05, t), opuesta(esquina))
}
