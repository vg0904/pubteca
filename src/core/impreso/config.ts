/**
 * Las opciones del libro impreso, con su valor por defecto profesional.
 *
 * Vive en el core porque la leen tres sitios que no se pueden contradecir: la
 * app (lo guarda en el `Proyecto` y lo enseña), la copia (.zip) al abrirse, y
 * el compositor. `normalizarConfig` es la unica puerta: un campo que falta o
 * que no se entiende toma su valor por defecto, y un numero raro se recorta a
 * su rango. Nada de lo que venga de un archivo puede costarle el libro al
 * autor (la misma regla que la entrega de Kindle).
 */
import { CORTE_POR_DEFECTO, CORTES, DESTINOS, type Destino, type Papel } from './formatos'
import { FAMILIA_POR_DEFECTO, FAMILIAS, familia } from './familias'

/** Los margenes que elige el autor, en milimetros. El interior es el del lomo (medianil). */
export interface Margenes {
  readonly interior: number
  readonly exterior: number
  readonly superior: number
  readonly inferior: number
}

export type DondeExtra = 'inicio' | 'final'

/**
 * Donde va una pagina extra en el impreso, y si va. El impreso puede tener su
 * propio orden: la dedicatoria al final, un «Sobre el autor» solo en el EPUB.
 */
export interface ExtraImpreso {
  /** En la app, el id del extra; en el core, el nombre de su archivo en `extras/`. */
  readonly id: string
  readonly donde: DondeExtra
  readonly incluir: boolean
}

export type Caida = 'alta' | 'media' | 'baja'

/** Cuanto baja el titulo de una apertura, en fraccion de la pagina. */
export const CAIDAS: Readonly<Record<Caida, number>> = { alta: 0.16, media: 0.28, baja: 0.4 }

export interface ConfigImpreso {
  readonly destino: Destino
  /** Un id de `CORTES`, o `personalizado`. */
  readonly corte: string
  /** El de una imprenta local, en milimetros. Solo cuenta con `corte: 'personalizado'`. */
  readonly personalizado: { readonly ancho: number; readonly alto: number }
  readonly papel: Papel
  readonly fuente: string
  /** En puntos. */
  readonly cuerpo: number
  /** En % del cuerpo. */
  readonly interlineado: number
  /** Sangria de primera linea, en em. */
  readonly sangria: number
  readonly alineacion: 'justificado' | 'bandera'
  readonly margenes: Margenes
  readonly capituloEnImpar: boolean
  readonly caida: Caida
  /** Que va en la cabecera de las paginas pares; en las impares, el capitulo. */
  readonly cabecera: 'titulo' | 'autor' | 'ninguna'
  readonly folio: 'arriba' | 'abajo'
  /** Los preliminares sin numero (lo de casi todas las novelas) o en romanos (Chicago). */
  readonly preliminares: 'sin' | 'romanos'
  /** El cambio de escena: con su adorno, o con una linea en blanco (que se pinta con adorno si cae arriba o al pie). */
  readonly escena: 'adorno' | 'blanco'
  readonly anteportada: boolean
  readonly indice: boolean
  readonly colofon: boolean
  /** Las laminas a color, en un interior en blanco y negro. */
  readonly laminas: 'grises' | 'omitir'
  /** El ISBN del impreso: cada formato lleva el suyo, distinto del del EPUB. */
  readonly isbn: string
  /** El orden propio de las paginas extra. Sin el, el del EPUB. */
  readonly extras?: readonly ExtraImpreso[]
}

export const CONFIG_IMPRESO_POR_DEFECTO: ConfigImpreso = {
  destino: 'kdp',
  corte: CORTE_POR_DEFECTO,
  personalizado: { ancho: 170, alto: 230 },
  papel: 'crema',
  fuente: FAMILIA_POR_DEFECTO,
  cuerpo: familia(FAMILIA_POR_DEFECTO).cuerpo,
  interlineado: familia(FAMILIA_POR_DEFECTO).interlineado,
  sangria: 1,
  alineacion: 'justificado',
  margenes: { interior: 22, exterior: 16, superior: 20, inferior: 22 },
  capituloEnImpar: true,
  caida: 'media',
  cabecera: 'titulo',
  folio: 'arriba',
  preliminares: 'sin',
  escena: 'adorno',
  anteportada: true,
  indice: false,
  colofon: false,
  laminas: 'grises',
  isbn: '',
}

/** Los rangos que admite cada numero. Fuera de ellos ya no es un libro, es un error de tecleo. */
export const RANGOS = {
  cuerpo: { min: 7, max: 16, paso: 0.5 },
  interlineado: { min: 110, max: 170, paso: 1 },
  sangria: { min: 0, max: 4, paso: 0.1 },
  margen: { min: 0, max: 50, paso: 0.5 },
  ladoPersonalizado: { min: 76, max: 432 },
} as const

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

function numero(v: unknown, def: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def
}

function uno<T extends string>(v: unknown, valores: readonly T[], def: T): T {
  return valores.includes(v as T) ? (v as T) : def
}

function siNo(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def
}

/** La configuracion tal como venga, completa y dentro de sus rangos. */
export function normalizarConfig(x: unknown, extraId: (viejo: string) => string = (v) => v): ConfigImpreso {
  const d = CONFIG_IMPRESO_POR_DEFECTO
  if (!esObjeto(x)) return d
  const m = esObjeto(x['margenes']) ? x['margenes'] : {}
  const per = esObjeto(x['personalizado']) ? x['personalizado'] : {}
  const margen = (k: keyof Margenes): number => numero(m[k], d.margenes[k], RANGOS.margen.min, RANGOS.margen.max)
  const lado = (k: 'ancho' | 'alto'): number => numero(per[k], d.personalizado[k], RANGOS.ladoPersonalizado.min, RANGOS.ladoPersonalizado.max)
  const extras = Array.isArray(x['extras'])
    ? x['extras'].flatMap((e): ExtraImpreso[] =>
        esObjeto(e) && typeof e['id'] === 'string'
          ? [{ id: extraId(e['id']), donde: e['donde'] === 'final' ? 'final' : 'inicio', incluir: e['incluir'] !== false }]
          : [],
      )
    : undefined
  return {
    destino: uno(x['destino'], DESTINOS, d.destino),
    corte: uno(x['corte'], [...CORTES.map((c) => c.id), 'personalizado'], d.corte),
    personalizado: { ancho: lado('ancho'), alto: lado('alto') },
    papel: uno(x['papel'], ['crema', 'blanco'], d.papel),
    fuente: uno(x['fuente'], FAMILIAS.map((f) => f.id), d.fuente),
    cuerpo: numero(x['cuerpo'], d.cuerpo, RANGOS.cuerpo.min, RANGOS.cuerpo.max),
    interlineado: numero(x['interlineado'], d.interlineado, RANGOS.interlineado.min, RANGOS.interlineado.max),
    sangria: numero(x['sangria'], d.sangria, RANGOS.sangria.min, RANGOS.sangria.max),
    alineacion: uno(x['alineacion'], ['justificado', 'bandera'], d.alineacion),
    margenes: { interior: margen('interior'), exterior: margen('exterior'), superior: margen('superior'), inferior: margen('inferior') },
    capituloEnImpar: siNo(x['capituloEnImpar'], d.capituloEnImpar),
    caida: uno(x['caida'], ['alta', 'media', 'baja'], d.caida),
    cabecera: uno(x['cabecera'], ['titulo', 'autor', 'ninguna'], d.cabecera),
    folio: uno(x['folio'], ['arriba', 'abajo'], d.folio),
    preliminares: uno(x['preliminares'], ['sin', 'romanos'], d.preliminares),
    escena: uno(x['escena'], ['adorno', 'blanco'], d.escena),
    anteportada: siNo(x['anteportada'], d.anteportada),
    indice: siNo(x['indice'], d.indice),
    colofon: siNo(x['colofon'], d.colofon),
    laminas: uno(x['laminas'], ['grises', 'omitir'], d.laminas),
    isbn: typeof x['isbn'] === 'string' ? x['isbn'].trim().slice(0, 40) : d.isbn,
    ...(extras ? { extras } : {}),
  }
}

/**
 * Cambia de letra. Si el autor no habia tocado el cuerpo ni el interlineado
 * (seguian los recomendados de la letra de antes), pasan a los de la nueva;
 * si los habia elegido el, se quedan. La misma regla que la linea de derechos
 * con el idioma.
 */
export function conFuente(c: ConfigImpreso, id: string): ConfigImpreso {
  const antes = familia(c.fuente)
  const nueva = familia(id)
  const intactos = c.cuerpo === antes.cuerpo && c.interlineado === antes.interlineado
  return intactos ? { ...c, fuente: nueva.id, cuerpo: nueva.cuerpo, interlineado: nueva.interlineado } : { ...c, fuente: nueva.id }
}

/**
 * El orden de las paginas extra en el impreso: el guardado, quitando las que
 * ya no existen y añadiendo al final de su grupo las nuevas (donde el EPUB las
 * tiene). Las de inicio primero; dentro de cada grupo, en el orden guardado.
 */
export function ordenDeExtras(
  c: ConfigImpreso,
  existentes: readonly { readonly id: string; readonly donde: DondeExtra }[],
): ExtraImpreso[] {
  const hay = new Map(existentes.map((e) => [e.id, e]))
  const guardados = (c.extras ?? []).filter((e) => hay.has(e.id))
  const vistos = new Set(guardados.map((e) => e.id))
  const nuevos = existentes.filter((e) => !vistos.has(e.id)).map((e) => ({ id: e.id, donde: e.donde, incluir: true }))
  const todos = [...guardados, ...nuevos]
  return [...todos.filter((e) => e.donde === 'inicio'), ...todos.filter((e) => e.donde === 'final')]
}

/** El interlineado en puntos, redondeado a la centesima (el PDF no necesita mas). */
export function interlineaDe(c: Pick<ConfigImpreso, 'cuerpo' | 'interlineado'>): number {
  return Math.round(c.cuerpo * c.interlineado) / 100
}

/** Comprueba un ISBN-13 (o un ISBN-10) por su digito de control. Guiones y espacios no cuentan. */
export function isbnValido(isbn: string): boolean {
  const s = isbn.replace(/[\s-]/gu, '').toUpperCase()
  if (/^\d{13}$/u.test(s)) {
    const suma = [...s].reduce((n, ch, i) => n + Number(ch) * (i % 2 === 0 ? 1 : 3), 0)
    return suma % 10 === 0
  }
  if (/^\d{9}[\dX]$/u.test(s)) {
    const suma = [...s].reduce((n, ch, i) => n + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0)
    return suma % 11 === 0
  }
  return false
}
