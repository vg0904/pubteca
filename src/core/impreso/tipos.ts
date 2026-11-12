/**
 * Lo que comparten el compositor, el escritor de PDF (M5) y la vista previa
 * de la app (M6). Todas las medidas en puntos PostScript (1/72 in).
 *
 * El compositor no escribe PDF: devuelve cada pagina como una LISTA DE
 * OPERACIONES (glifos colocados, imagenes). El PDF y el lienzo de la vista
 * previa pintan la misma lista: lo que se ve es lo que se imprime.
 */
import type { Fuente, Glifo } from './sfnt'

export type Cara = 'regular' | 'cursiva' | 'negrita' | 'negritaCursiva'

export type Fuentes = Readonly<Record<Cara, Fuente>>

/**
 * Una operacion de dibujo. Coordenadas desde la esquina SUPERIOR izquierda
 * de la pagina ya cortada, con la y hacia abajo (como un lienzo). El escritor
 * de PDF le da la vuelta y suma el sangrado.
 */
export type Op =
  | {
      readonly op: 'texto'
      readonly cara: Cara
      readonly cuerpo: number
      /** El origen del primer glifo: x a la izquierda, y en la linea base. */
      readonly x: number
      readonly y: number
      /** Cada glifo avanza `avance * cuerpo / upm` (el kerning ya va dentro). */
      readonly glifos: readonly Glifo[]
    }
  | {
      readonly op: 'imagen'
      readonly id: string
      /** La esquina superior izquierda (aqui no hay linea base). */
      readonly x: number
      readonly y: number
      readonly ancho: number
      readonly alto: number
    }

export type ClaseLinea = 'parrafo' | 'verso' | 'sub' | 'escena' | 'titulo' | 'numero' | 'rotulo' | 'indice'

/**
 * Lo que hay en cada renglon de una pagina, en palabras. Lo usan los tests de
 * las reglas y la vista previa para señalar; el dibujo esta en `ops`.
 */
export interface Renglon {
  readonly clase: ClaseLinea
  readonly texto: string
  /** Acaba en guion de particion. */
  readonly guion: boolean
  /** Que seccion y que bloque de la seccion. */
  readonly seccion: number
  readonly bloque: number
  /** Que linea del bloque es y cuantas tiene el bloque (un parrafo, una estrofa). */
  readonly linea: number
  readonly de: number
  /** La linea base, desde arriba. */
  readonly y: number
  /** Lo que va alineado a la derecha en ese renglon: el folio de una entrada del indice. */
  readonly derecha?: string
}

/**
 * `presentacion`: una pagina que se mira y no se lee seguida (anteportada,
 * portada, creditos, dedicatoria, colofon). No lleva cabecera ni folio.
 */
export type TipoPagina = 'texto' | 'apertura' | 'blanca' | 'ilustracion' | 'presentacion'

export interface PaginaCompuesta {
  /** El numero fisico: la 1 es la primera impar (recto). */
  readonly numero: number
  /** El folio que se imprime, o null si esta pagina no lo lleva. */
  readonly folio: string | null
  readonly tipo: TipoPagina
  /** La seccion a la que pertenece (-1 en una blanca entre secciones). */
  readonly seccion: number
  readonly ops: readonly Op[]
  readonly renglones: readonly Renglon[]
}

/** Lo que el compositor tuvo que hacer y conviene decir. Los textos estan en la app (i18n). */
export type AvisoImpreso =
  | { readonly codigo: 'faltanGlifos'; readonly caracteres: string }
  | { readonly codigo: 'adornoSinGlifo'; readonly adorno: string; readonly usado: string }
  | { readonly codigo: 'lineaDesbordada'; readonly pagina: number; readonly texto: string }
  | { readonly codigo: 'guionEnImpar'; readonly pagina: number }
  | { readonly codigo: 'ilustracionPerdida'; readonly nombre: string }
  | { readonly codigo: 'sinParticion'; readonly idioma: string }
  /** Una imagen que impresa a ese tamaño queda por debajo de 300 ppi (KDP los pide). */
  | { readonly codigo: 'resolucionBaja'; readonly nombre: string; readonly ppi: number }
  // Los del plan (ver plan.ts): no salen de componer una pagina, sino del libro entero.
  /** Un margen elegido por debajo de lo que pide el destino: se subio, en mm. */
  | { readonly codigo: 'margenSubido'; readonly lado: 'interior' | 'exterior' | 'superior' | 'inferior'; readonly elegido: number; readonly usado: number; readonly porque: 'medianil' | 'destino' | 'cabecera' | 'folio' }
  | { readonly codigo: 'paginasFueraDeRango'; readonly paginas: number; readonly min: number; readonly max: number }
  /** Caracteres por linea fuera de 45–75 (Bringhurst). */
  | { readonly codigo: 'medidaFuera'; readonly caracteres: number }
  | { readonly codigo: 'mediosFuera'; readonly medios: number }
  | { readonly codigo: 'laminasOmitidas'; readonly laminas: number }
  | { readonly codigo: 'isbnNoValido'; readonly isbn: string }
  | { readonly codigo: 'sinIsbn' }
  /** Sin titulo, la anteportada y la portada salen en blanco; sin autor, la portada y los derechos van sin el. */
  | { readonly codigo: 'sinTitulo' }
  | { readonly codigo: 'sinAutor' }
  /** Mas paginas en blanco seguidas de las que admite KDP. Las reglas no deberian llegar nunca. */
  | { readonly codigo: 'blancasSeguidas'; readonly desde: number; readonly cuantas: number }
