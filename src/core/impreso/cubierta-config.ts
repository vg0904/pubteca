/**
 * Las opciones de la cubierta impresa: el estilo, el codigo, el lomo, el
 * encuadre... Aparte de `cubierta.ts` para que el almacen, la copia y el
 * reductor las lean sin cargar el compositor (con sus patrones de
 * particion): eso solo lo descarga quien abre la cubierta.
 */

export type EstiloId = 'papiro' | 'clasico' | 'cartel' | 'franja' | 'esquina' | 'vertical'
export const ESTILOS_ORDEN: readonly EstiloId[] = ['papiro', 'clasico', 'cartel', 'franja', 'esquina', 'vertical']

export type QuePieza = 'titulo' | 'autor' | 'sello'

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
}

export const CONFIG_CUBIERTA_POR_DEFECTO: ConfigCubierta = {
  estilo: 'papiro',
  titulo: null,
  autor: true,
  sinopsis: true,
  codigo: 'generar',
  lomo: 'descendente',
  lomoManual: 0,
  encuadre: { x: 0.5, y: 0.5 },
  fondo: '',
  tintas: {},
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
  }
}
