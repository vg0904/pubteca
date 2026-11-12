/**
 * Las opciones de la cubierta impresa: el estilo, el codigo, el lomo, el
 * encuadre... Aparte de `cubierta.ts` para que el almacen, la copia y el
 * reductor las lean sin cargar el compositor (con sus patrones de
 * particion): eso solo lo descarga quien abre la cubierta.
 */

export type EstiloId = 'minimo' | 'clasico' | 'cartel' | 'franja' | 'esquina' | 'vertical'
export const ESTILOS_ORDEN: readonly EstiloId[] = ['minimo', 'clasico', 'cartel', 'franja', 'esquina', 'vertical']

export type QuePieza = 'titulo' | 'autor' | 'sello'
export const PIEZAS_PORTADA: readonly QuePieza[] = ['titulo', 'autor', 'sello']

/** Un desplazamiento, en fracciones del ancho de la portada (A): sirve igual en cualquier corte. */
export interface Punto {
  readonly x: number
  readonly y: number
}

/** Lo que el autor movio a mano cada pieza de la portada, por estilo. */
export type Movidas = Readonly<Partial<Record<EstiloId, Readonly<Partial<Record<QuePieza, Punto>>>>>>

export type Tono = 'auto' | 'clara' | 'oscura'

export interface ConfigCubierta {
  readonly estilo: EstiloId
  /** El titulo en la portada; null: lo que diga el estilo. */
  readonly titulo: boolean | null
  /** El autor en la portada (no en el lomo): fuera si el dibujo ya lo trae. */
  readonly autor: boolean
  readonly sinopsis: boolean
  /** El codigo: generarlo con el ISBN del impreso, o dejar la caja libre para el de KDP. */
  readonly codigo: 'generar' | 'kdp'
  readonly lomo: 'descendente' | 'ascendente'
  /** El ancho del lomo de la plantilla de la imprenta, en mm (0: el de KDP). */
  readonly lomoManual: number
  /** El punto del dibujo de portada que se queda a la vista al recortarlo (0 a 1). */
  readonly encuadre: { readonly x: number; readonly y: number }
  /** El color del lomo y de la contraportada sin dibujo, «#rrggbb»; vacio: el del borde del dibujo. */
  readonly fondo: string
  /** La tinta de cada pieza: la que mejor se lee, o la que diga el autor. */
  readonly tintas: Readonly<Partial<Record<QuePieza | 'sinopsis' | 'lomo', Tono>>>
  /**
   * Las piezas de la portada movidas a mano, por estilo: cambiar de estilo no
   * pierde lo movido en el otro. El compositor nunca las saca de lo seguro.
   */
  readonly mover: Movidas
  /** La portada con su texto tambien en los dos EPUB, en vez del dibujo limpio (decision 12). */
  readonly enEpub: boolean
  /**
   * El color del PDF de la cubierta: RGB (para pantallas; KDP lo convierte al
   * imprimir) o CMYK (separado con el perfil de imprenta, PDF/X-1a). null: el
   * que conviene al destino (`colorDe`).
   */
  readonly color: ColorCubierta | null
}

export type ColorCubierta = 'rgb' | 'cmyk'

export const CONFIG_CUBIERTA_POR_DEFECTO: ConfigCubierta = {
  estilo: 'minimo',
  titulo: null,
  autor: true,
  sinopsis: true,
  codigo: 'generar',
  lomo: 'descendente',
  lomoManual: 0,
  encuadre: { x: 0.5, y: 0.5 },
  fondo: '',
  tintas: {},
  mover: {},
  enEpub: false,
  color: null,
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const entre = (v: unknown, min: number, max: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def)

/** Lo que venga, completo y en rango (la misma regla que `normalizarConfig` del interior). */
export function normalizarCubierta(x: unknown): ConfigCubierta {
  const d = CONFIG_CUBIERTA_POR_DEFECTO
  if (!esObjeto(x)) return d
  const e = esObjeto(x['encuadre']) ? x['encuadre'] : {}
  const t = esObjeto(x['tintas']) ? x['tintas'] : {}
  const tintas: Partial<Record<QuePieza | 'sinopsis' | 'lomo', Tono>> = {}
  for (const k of ['titulo', 'autor', 'sello', 'sinopsis', 'lomo'] as const) if (t[k] === 'clara' || t[k] === 'oscura') tintas[k] = t[k]
  return {
    estilo: ESTILOS_ORDEN.includes(x['estilo'] as EstiloId) ? (x['estilo'] as EstiloId) : d.estilo,
    titulo: typeof x['titulo'] === 'boolean' ? x['titulo'] : null,
    autor: typeof x['autor'] === 'boolean' ? x['autor'] : d.autor,
    sinopsis: typeof x['sinopsis'] === 'boolean' ? x['sinopsis'] : d.sinopsis,
    codigo: x['codigo'] === 'kdp' ? 'kdp' : 'generar',
    lomo: x['lomo'] === 'ascendente' ? 'ascendente' : 'descendente',
    lomoManual: entre(x['lomoManual'], 0, 120, 0),
    encuadre: { x: entre(e['x'], 0, 1, 0.5), y: entre(e['y'], 0, 1, 0.5) },
    fondo: typeof x['fondo'] === 'string' && /^#[0-9a-f]{6}$/iu.test(x['fondo']) ? x['fondo'].toLowerCase() : '',
    tintas,
    mover: normalizarMovidas(x['mover']),
    enEpub: x['enEpub'] === true,
    color: x['color'] === 'rgb' || x['color'] === 'cmyk' ? x['color'] : null,
  }
}

/** Solo estilos y piezas que existen, numeros finitos y no mas de 1,5 A; lo que no se movio no se guarda. */
function normalizarMovidas(x: unknown): Movidas {
  if (!esObjeto(x)) return {}
  const r: Partial<Record<EstiloId, Partial<Record<QuePieza, Punto>>>> = {}
  for (const estilo of ESTILOS_ORDEN) {
    const del = x[estilo]
    if (!esObjeto(del)) continue
    for (const pieza of PIEZAS_PORTADA) {
      const p = del[pieza]
      if (!esObjeto(p)) continue
      const punto = { x: entre(p['x'], -1.5, 1.5, 0), y: entre(p['y'], -1.5, 1.5, 0) }
      if (Math.abs(punto.x) < 1e-6 && Math.abs(punto.y) < 1e-6) continue
      r[estilo] = { ...r[estilo], [pieza]: punto }
    }
  }
  return r
}

/** Si el autor movio alguna pieza en algun estilo. */
export const hayMovidas = (m: Movidas): boolean => Object.values(m).some((del) => del && Object.keys(del).length > 0)

/**
 * El color que toca: el que eligio el autor o, si no eligio, el del destino.
 * KDP acepta RGB y lo convierte el; IngramSpark e imprentas piden CMYK.
 */
export const colorDe = (c: Pick<ConfigCubierta, 'color'>, destino: 'kdp' | 'ingram' | 'imprenta'): ColorCubierta => c.color ?? (destino === 'kdp' ? 'rgb' : 'cmyk')

/** La tinta maxima (C + M + Y + K) del CMYK: IngramSpark pide 240 %; el perfil da 300 %. */
export const LIMITE_TINTA: Readonly<Record<'kdp' | 'ingram' | 'imprenta', number>> = { kdp: 3, ingram: 2.4, imprenta: 3 }
