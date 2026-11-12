/**
 * La cubierta completa: contraportada, lomo y portada en una sola hoja, con
 * su sangrado, como la piden KDP e IngramSpark (referencia B8).
 *
 * Como el interior, el core no pinta: decide. Devuelve
 *   - las MEDIDAS (el lomo sale del numero de paginas del interior y del papel),
 *   - las CAPAS del fondo, que la app pinta en un lienzo (el dibujo de portada y
 *     contraportada con su encuadre, el color del lomo, la franja, los logos,
 *     los velos): todo lo que es imagen va a una sola imagen, sin
 *     transparencias en el PDF;
 *   - y las OPERACIONES en vectores encima: el texto (autor, titulo, sello,
 *     sinopsis, lomo) y el codigo de barras. El texto nunca se rasteriza.
 *
 * Los estilos de la portada son DATOS (`ESTILOS`): cada pieza en proporcion
 * al ancho de la portada (A) mas algunos fijos en milimetros, como la
 * plantilla del autor. Asi valen igual en 5 × 8 que en carta.
 *
 * Lo fijo para todos (plantilla del autor, ya ajustada a KDP):
 *   - linea base a 13 mm del pie: el sello de la portada, el logo de la
 *     contraportada y el isotipo del lomo se apoyan en ella;
 *   - contraportada: logo de 1/3 A a 1/10 A del borde de fuera; la caja del
 *     codigo (50,8 × 30,5 mm) abajo a la derecha, a 19 mm del pie y a 1/10 A
 *     del lomo; la sinopsis arriba, sin bajar nunca a la caja ni al logo;
 *   - lomo: texto solo desde 79 paginas (48 en IngramSpark), con 1,6 mm libres
 *     a cada lado; isotipo centrado sobre la linea base si el lomo pasa de 8 mm.
 *
 * La legibilidad se MIDE: la app da la luminancia del dibujo y aqui se elige
 * para cada pieza la tinta (clara u oscura) con mas contraste, con el umbral
 * de WCAG (4,5:1, o 3:1 para texto grande). Si ninguna llega, un velo bajo la
 * pieza, cocido en la imagen del fondo.
 */
import { CONFIG_CUBIERTA_POR_DEFECTO, ESTILOS_ORDEN, normalizarCubierta, type ConfigCubierta, type EstiloId, type QuePieza, type Tono } from './cubierta-config'
import { componerCodigo } from './codigo'
import { cifrasDeIsbn, isbnLegible } from './ean13'
import { PT_POR_MM, type Destino, type Papel } from './formatos'
import { Componedor, trozosDeHtml, type Linea } from './parrafo'
import type { Fuente, Glifo } from './sfnt'
import type { Cara, Fuentes } from './tipos'

const MM = PT_POR_MM
const IN = 72

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

export const SANGRADO_CUBIERTA = 0.125 * IN
/** Lo que mide cada hoja (dos paginas), en pulgadas: KDP, interior en blanco y negro. */
export const GROSOR_HOJA: Readonly<Record<Papel, number>> = { blanco: 0.002252, crema: 0.0025 }
/** Desde cuantas paginas admite texto el lomo. */
export const PAGINAS_TEXTO_LOMO: Readonly<Record<Destino, number>> = { kdp: 79, ingram: 48, imprenta: 79 }
export const MARGEN_LOMO = 0.0625 * IN
export const ISOTIPO_MINIMO = 8 * MM
export const LINEA_BASE = 13 * MM
export const CAJA_CODIGO = { ancho: 2 * IN, alto: 1.2 * IN, pie: 19 * MM } as const
/** KDP: el texto de portada y contraportada, a 0,125 in dentro del corte como poco. */
export const SEGURIDAD = 0.125 * IN

export interface Caja {
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

export interface MedidasCubierta {
  /** La hoja entera, con el sangrado. */
  readonly ancho: number
  readonly alto: number
  readonly sangrado: number
  readonly lomo: number
  /** Las tres partes, por su corte (sin sangrado). */
  readonly contra: Caja
  readonly espina: Caja
  readonly portada: Caja
}

/** El ancho del lomo: el de la plantilla de la imprenta si se da, y si no, el de KDP. */
export function anchoDelLomo(paginas: number, papel: Papel, manual = 0): number {
  return manual > 0 ? manual : paginas * GROSOR_HOJA[papel] * IN
}

export function medidasCubierta(corte: { readonly ancho: number; readonly alto: number }, paginas: number, papel: Papel, manual = 0): MedidasCubierta {
  const s = SANGRADO_CUBIERTA
  const lomo = anchoDelLomo(paginas, papel, manual)
  return {
    ancho: 2 * s + 2 * corte.ancho + lomo,
    alto: 2 * s + corte.alto,
    sangrado: s,
    lomo,
    contra: { x: s, y: s, ancho: corte.ancho, alto: corte.alto },
    espina: { x: s + corte.ancho, y: s, ancho: lomo, alto: corte.alto },
    portada: { x: s + corte.ancho + lomo, y: s, ancho: corte.ancho, alto: corte.alto },
  }
}

/** La caja del codigo de barras: abajo a la derecha de la contraportada, a 19 mm del pie y a 1/10 A del lomo. */
export function cajaDelCodigo(m: MedidasCubierta): Caja {
  const A = m.contra.ancho
  const derecha = m.contra.x + m.contra.ancho - A / 10
  const abajo = m.contra.y + m.contra.alto - CAJA_CODIGO.pie
  return { x: derecha - CAJA_CODIGO.ancho, y: abajo - CAJA_CODIGO.alto, ancho: CAJA_CODIGO.ancho, alto: CAJA_CODIGO.alto }
}

// ---------------------------------------------------------------------------
// Letras y estilos (datos)
// ---------------------------------------------------------------------------

export type LetraCubierta = 'jost' | 'playfair' | 'cormorant' | 'bebas' | 'oswald' | 'libro'
export type LetraPropia = Exclude<LetraCubierta, 'libro'>

/** Los archivos de las letras de la cubierta, en `public/fuentes/cubierta/` (los genera scripts/impreso-recursos.py). */
export const ARCHIVOS_CUBIERTA: Readonly<Record<LetraPropia, string>> = {
  jost: 'Jost-Regular.ttf',
  playfair: 'PlayfairDisplay-Regular.ttf',
  cormorant: 'CormorantGaramond-Light.ttf',
  bebas: 'BebasNeue-Regular.ttf',
  oswald: 'Oswald-Regular.ttf',
}

/** Las de la cubierta, mas las cuatro caras de la letra del libro (la sinopsis va en ella). */
export type FuentesCubierta = Readonly<Record<LetraPropia, Fuente>> & { readonly libro: Fuentes }


export type Ancla =
  /** El principio de la pieza a d·A del corte de arriba. */
  | { readonly a: 'arriba'; readonly d: number }
  /** Su ultima linea base (o el pie de su logo) en la linea base de 13 mm. */
  | { readonly a: 'base' }
  /** Su ultima linea base a d·A por encima de lo mas alto de otra pieza. */
  | { readonly a: 'sobre'; readonly de: QuePieza; readonly d: number }
  /** Su primera linea, a d·A por debajo de la ultima linea base de otra pieza. */
  | { readonly a: 'bajo'; readonly de: QuePieza; readonly d: number }

export interface PiezaEstilo {
  readonly que: QuePieza
  readonly letra: LetraCubierta
  /** El cuerpo, en fraccion de A. */
  readonly cuerpo: number
  readonly mayusculas?: boolean
  /** Espacio entre letras, en em. */
  readonly espaciado?: number
  readonly alinear: 'centro' | 'izquierda' | 'derecha'
  /** El ancho maximo, en fraccion de A (0,8 por defecto: 1/10 A a cada lado). */
  readonly ancho?: number
  /** De linea base a linea base, en veces el cuerpo. */
  readonly interlinea?: number
  /** El cuerpo se ajusta para que la linea mas larga llene el ancho (un cartel). */
  readonly llenar?: boolean
  /** Girado a lo largo del borde de fuera, de arriba abajo. */
  readonly girado?: boolean
  readonly ancla: Ancla
  /** El sello con logo: su ancho, en fraccion de A. Sin logo, va su nombre en texto. */
  readonly logo?: number
}


export interface EstiloPortada {
  readonly id: EstiloId
  /** En orden: cada pieza se coloca despues de las que necesita. */
  readonly piezas: readonly PiezaEstilo[]
  /** Si el titulo va de entrada (el autor puede quitarlo o ponerlo). */
  readonly conTitulo: boolean
  /** Una franja opaca al pie, de este alto (fraccion de A), del color del papel. */
  readonly franja?: number
  /** La letra del titulo en el lomo. */
  readonly letraLomo: LetraCubierta
}

const sello = (alinear: PiezaEstilo['alinear'], ancho = 0.8): PiezaEstilo => ({ que: 'sello', letra: 'playfair', cuerpo: 0.03, mayusculas: true, espaciado: 0.25, alinear, ancho, logo: 1 / 6, ancla: { a: 'base' } })

/**
 * Los seis estilos de los bocetos (plan.md, decision 13). El primero es la
 * plantilla del autor: el dibujo ya trae el titulo, y la portada solo lleva
 * el autor y el sello. Lo de «autor · 1/10 A» y «portada 1/6 A» es lo que el
 * autor contesto al empezar M7.
 */
export const ESTILOS: Readonly<Record<EstiloId, EstiloPortada>> = {
  papiro: {
    id: 'papiro',
    conTitulo: false,
    letraLomo: 'jost',
    piezas: [
      sello('centro'),
      { que: 'autor', letra: 'jost', cuerpo: 0.04, mayusculas: true, espaciado: 0.18, alinear: 'centro', ancla: { a: 'sobre', de: 'sello', d: 1 / 10 } },
      { que: 'titulo', letra: 'playfair', cuerpo: 0.11, alinear: 'centro', interlinea: 1.1, ancla: { a: 'arriba', d: 0.12 } },
    ],
  },
  clasico: {
    id: 'clasico',
    conTitulo: true,
    letraLomo: 'cormorant',
    piezas: [
      { que: 'titulo', letra: 'cormorant', cuerpo: 0.15, alinear: 'centro', interlinea: 1.0, ancla: { a: 'arriba', d: 0.1 } },
      { que: 'autor', letra: 'jost', cuerpo: 0.032, mayusculas: true, espaciado: 0.2, alinear: 'centro', ancla: { a: 'bajo', de: 'titulo', d: 0.06 } },
      sello('centro'),
    ],
  },
  cartel: {
    id: 'cartel',
    conTitulo: true,
    letraLomo: 'bebas',
    piezas: [
      { que: 'titulo', letra: 'bebas', cuerpo: 0.2, mayusculas: true, alinear: 'centro', interlinea: 0.95, llenar: true, ancla: { a: 'arriba', d: 0.07 } },
      sello('centro'),
      { que: 'autor', letra: 'oswald', cuerpo: 0.045, mayusculas: true, espaciado: 0.1, alinear: 'centro', ancla: { a: 'sobre', de: 'sello', d: 0.06 } },
    ],
  },
  franja: {
    id: 'franja',
    conTitulo: true,
    letraLomo: 'playfair',
    franja: 0.3,
    piezas: [
      sello('centro'),
      { que: 'autor', letra: 'jost', cuerpo: 0.028, mayusculas: true, espaciado: 0.2, alinear: 'centro', ancla: { a: 'sobre', de: 'sello', d: 0.04 } },
      { que: 'titulo', letra: 'playfair', cuerpo: 0.075, alinear: 'centro', interlinea: 1.1, ancla: { a: 'sobre', de: 'autor', d: 0.035 } },
    ],
  },
  esquina: {
    id: 'esquina',
    conTitulo: true,
    letraLomo: 'playfair',
    piezas: [
      { que: 'titulo', letra: 'playfair', cuerpo: 0.105, alinear: 'izquierda', ancho: 0.6, interlinea: 1.05, ancla: { a: 'base' } },
      { que: 'autor', letra: 'jost', cuerpo: 0.028, mayusculas: true, espaciado: 0.2, alinear: 'izquierda', ancla: { a: 'sobre', de: 'titulo', d: 0.035 } },
      // A la derecha del titulo (que llega a 0,7 A): el sello cabe en 0,2 A, en dos lineas si hace falta.
      sello('derecha', 0.2),
    ],
  },
  vertical: {
    id: 'vertical',
    conTitulo: true,
    letraLomo: 'oswald',
    piezas: [
      { que: 'titulo', letra: 'oswald', cuerpo: 0.1, mayusculas: true, espaciado: 0.05, alinear: 'derecha', girado: true, llenar: true, ancla: { a: 'arriba', d: 0.06 } },
      sello('izquierda'),
      { que: 'autor', letra: 'jost', cuerpo: 0.03, mayusculas: true, espaciado: 0.18, alinear: 'izquierda', ancho: 0.6, ancla: { a: 'sobre', de: 'sello', d: 0.05 } },
    ],
  },
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export { CONFIG_CUBIERTA_POR_DEFECTO, ESTILOS_ORDEN, normalizarCubierta }
export type { ConfigCubierta, EstiloId, QuePieza, Tono }

/** La luminancia de una imagen, en una rejilla pequeña: la que la app saca del dibujo. */
export interface Luminancias {
  readonly ancho: number
  readonly alto: number
  /** Luminancia relativa (WCAG, 0 a 1), fila a fila. */
  readonly valores: ArrayLike<number>
}

export interface ImagenDeCubierta {
  /** Sus pixeles: con ellos se calcula la resolucion y el recorte. */
  readonly ancho: number
  readonly alto: number
  /** Solo los dibujos de portada y contraportada: para medir la legibilidad. */
  readonly luz?: Luminancias
}

export interface DatosCubierta {
  readonly titulo: string
  readonly autor: string
  readonly sello: string
  readonly descripcion: string
  readonly idioma: string
  /** El ISBN del impreso (el del codigo). */
  readonly isbn: string
  readonly destino: Destino
  readonly papel: Papel
  /** El corte, en puntos, y las paginas del interior compuesto. */
  readonly corte: { readonly ancho: number; readonly alto: number }
  readonly paginas: number
  readonly imagenes: Readonly<Partial<Record<RolCubierta, ImagenDeCubierta>>>
  /** El color del borde del dibujo de portada (el que sigue en el lomo si el autor no elige otro). */
  readonly bordePortada?: string
}

/** Las imagenes que usa la cubierta. El sello y el isotipo, con su version clara (para fondos oscuros). */
export type RolCubierta = 'portada' | 'contraportada' | 'sello' | 'selloBlanco' | 'isotipo' | 'isotipoBlanco'

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

/** Una tinta de un solo canal: 0 negro, 1 blanco. El texto nunca va en RGB (se veria borroso al separar). */
export type Gris = number

export type OpCubierta =
  | {
      readonly op: 'texto'
      readonly letra: LetraCubierta
      readonly cara: Cara
      readonly cuerpo: number
      /** El origen: x y la linea base, desde la esquina superior izquierda de la hoja. */
      readonly x: number
      readonly y: number
      readonly glifos: readonly Glifo[]
      readonly gris: Gris
      /** 90: de arriba abajo (descendente); -90: de abajo arriba. */
      readonly giro: 0 | 90 | -90
    }
  | { readonly op: 'rect'; readonly x: number; readonly y: number; readonly ancho: number; readonly alto: number; readonly gris: Gris }

/** Lo que la app pinta en la imagen del fondo, en orden. */
export type Capa =
  | { readonly que: 'color'; readonly caja: Caja; readonly color: string }
  /** Un dibujo: se pinta en `caja` el trozo `recorte` (en pixeles de la imagen). */
  | { readonly que: 'arte'; readonly rol: 'portada' | 'contraportada'; readonly caja: Caja; readonly recorte: Caja }
  | { readonly que: 'logo'; readonly rol: Exclude<RolCubierta, 'portada' | 'contraportada'>; readonly caja: Caja }
  /** Un velo bajo una pieza: oscurece (o aclara) hasta que su texto se lee. */
  | { readonly que: 'velo'; readonly caja: Caja; readonly color: 'negro' | 'blanco'; readonly alfa: number }

export type PiezaColocada = QuePieza | 'sinopsis' | 'lomoTitulo' | 'lomoAutor' | 'isotipo' | 'selloContra' | 'codigo'

export type AvisoCubierta =
  | { readonly codigo: 'resolucionArte'; readonly rol: 'portada' | 'contraportada'; readonly ppi: number; readonly pixeles: { readonly ancho: number; readonly alto: number } }
  | { readonly codigo: 'sinPortada' }
  | { readonly codigo: 'lomoSinTexto'; readonly paginas: number; readonly minimo: number }
  | { readonly codigo: 'lomoEstrecho' }
  | { readonly codigo: 'isotipoOmitido'; readonly lomo: number }
  | { readonly codigo: 'sinIsotipo' }
  | { readonly codigo: 'codigoSinIsbn' }
  | { readonly codigo: 'codigoKdp' }
  | { readonly codigo: 'velo'; readonly pieza: PiezaColocada }
  | { readonly codigo: 'contrasteBajo'; readonly pieza: PiezaColocada; readonly contraste: number }
  | { readonly codigo: 'sinopsisCortada' }
  | { readonly codigo: 'colorRgb' }
  | { readonly codigo: 'lomoDeIngram' }

export interface CubiertaCompuesta {
  readonly medidas: MedidasCubierta
  readonly capas: readonly Capa[]
  readonly ops: readonly OpCubierta[]
  /** La caja que se deja al codigo de barras (el nuestro, o el de KDP). */
  readonly codigo: Caja
  /** Donde quedo cada pieza: para la interfaz y los tests. */
  readonly piezas: readonly { readonly que: PiezaColocada; readonly caja: Caja }[]
  readonly avisos: readonly AvisoCubierta[]
  /** El estilo con que se compuso y si lleva titulo. */
  readonly estilo: EstiloId
  readonly conTitulo: boolean
}

// ---------------------------------------------------------------------------
// Contraste (WCAG 2.2)
// ---------------------------------------------------------------------------

/** La luminancia relativa de un color «#rrggbb». */
export function luminanciaDe(hex: string): number {
  const c = (i: number): number => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2)
}

/** El contraste entre dos luminancias (1 a 21). */
export function contraste(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Las tintas del texto: blanco, y un negro casi puro de una tinta. */
export const TINTA_CLARA: Gris = 1
export const TINTA_OSCURA: Gris = 0.1
const L_CLARA = 1
const L_OSCURA = luminanciaDe('#1a1a1a')

const PAPEL_FRANJA = '#f6f0e2'
const FONDO_POR_DEFECTO = '#1b2944'
/** Lo mas que oscurece o aclara un velo: mas, y ya no se ve el dibujo. */
const VELO_MAXIMO = 0.65

// ---------------------------------------------------------------------------
// Composicion
// ---------------------------------------------------------------------------

interface Bloque {
  readonly lineas: readonly Linea[]
  readonly cuerpo: number
  readonly paso: number
  readonly letra: LetraCubierta
  /** Lo que sube una mayuscula (o un ascendente) sobre la linea base. */
  readonly sube: number
  readonly baja: number
  readonly ancho: number
}

class Cubierta {
  private readonly m: MedidasCubierta
  private readonly A: number
  private readonly capas: Capa[] = []
  private readonly ops: OpCubierta[] = []
  private readonly piezas: { que: PiezaColocada; caja: Caja }[] = []
  private readonly avisos: AvisoCubierta[] = []
  private readonly componedores = new Map<LetraCubierta, Componedor>()
  private readonly fondo: string
  private arte: { rol: 'portada' | 'contraportada'; caja: Caja; recorte: Caja; luz: Luminancias | undefined; img: ImagenDeCubierta }[] = []

  private readonly d: DatosCubierta
  private readonly c: ConfigCubierta
  private readonly f: FuentesCubierta
  /** El alto de la franja del estilo que la lleva: el que pide el estilo, o mas si su texto no cabe. */
  private altoFranja: number

  constructor(d: DatosCubierta, c: ConfigCubierta, f: FuentesCubierta, altoFranja = 0) {
    this.d = d
    this.c = c
    this.f = f
    this.altoFranja = altoFranja
    this.m = medidasCubierta(d.corte, d.paginas, d.papel, c.lomoManual * MM)
    this.A = d.corte.ancho
    this.fondo = c.fondo || d.bordePortada || FONDO_POR_DEFECTO
  }

  private fuentesDe(letra: LetraCubierta): Fuentes {
    if (letra === 'libro') return this.f.libro
    const x = this.f[letra]
    return { regular: x, cursiva: x, negrita: x, negritaCursiva: x }
  }

  private componedor(letra: LetraCubierta): Componedor {
    let c = this.componedores.get(letra)
    if (!c) {
      c = new Componedor(this.fuentesDe(letra), this.d.idioma)
      this.componedores.set(letra, c)
    }
    return c
  }

  /** Un bloque de texto compuesto (sin colocar): lineas, cuerpo y lo que sube y baja. */
  private bloque(texto: string, p: { letra: LetraCubierta; cuerpo: number; mayusculas?: boolean; espaciado?: number; ancho: number; modo: 'centrado' | 'bandera' | 'justificado'; interlinea?: number; cara?: Cara; html?: boolean }): Bloque {
    const t = p.mayusculas ? texto.toLocaleUpperCase(this.d.idioma) : texto
    const trozos = p.html ? trozosDeHtml(t, p.cara ?? 'regular') : [{ texto: t, cara: p.cara ?? 'regular' }]
    const par = this.componedor(p.letra).parrafo(trozos, { cuerpo: p.cuerpo, ancho: p.ancho, modo: p.modo, partir: false, espaciado: p.espaciado ?? 0 })
    // Lo que de verdad sube y baja: la caja de cada glifo (una «Í» pasa de la altura de las mayusculas).
    const fs = this.fuentesDe(p.letra)
    let sube = 0
    let baja = 0
    for (const l of par.lineas) {
      for (const pz of l.piezas) {
        const fu = fs[pz.cara]
        for (const g of pz.glifos) {
          const c = fu.limites(g.id)
          if (!c) continue
          sube = Math.max(sube, (c[3] * p.cuerpo) / fu.upm)
          baja = Math.max(baja, (-c[1] * p.cuerpo) / fu.upm)
        }
      }
    }
    return { lineas: par.lineas, cuerpo: p.cuerpo, paso: p.cuerpo * (p.interlinea ?? 1.15), letra: p.letra, sube, baja, ancho: Math.max(0, ...par.lineas.map((l) => l.natural)) }
  }

  /** Lo que mide de alto un bloque: de lo mas alto de su primera linea a su ultima linea base. */
  private altoDe(b: Bloque): number {
    return b.sube + (b.lineas.length - 1) * b.paso
  }

  /**
   * Pone el bloque con su ultima linea base en `base`, en la caja horizontal
   * `[x0, x1]`. Un bloque centrado se compuso con esa medida y sus piezas ya
   * traen el centrado; uno a la derecha se compuso en bandera y se corre lo
   * que le falte a cada linea.
   */
  private poner(b: Bloque, base: number, x0: number, x1: number, alinear: PiezaEstilo['alinear'], gris: Gris): Caja {
    const primera = base - (b.lineas.length - 1) * b.paso
    let izq = Infinity
    let der = -Infinity
    b.lineas.forEach((l, i) => {
      const inicio = x0 + l.desde + (alinear === 'derecha' ? x1 - x0 - l.natural : 0)
      for (const pz of l.piezas) this.ops.push({ op: 'texto', letra: b.letra, cara: pz.cara, cuerpo: b.cuerpo, x: inicio + pz.x, y: primera + i * b.paso, glifos: pz.glifos, gris, giro: 0 })
      const xl = inicio + (l.piezas[0]?.x ?? 0)
      izq = Math.min(izq, xl)
      der = Math.max(der, xl + l.natural)
    })
    return { x: izq, y: primera - b.sube, ancho: Math.max(0, der - izq), alto: this.altoDe(b) + b.baja }
  }

  /** La luminancia bajo una caja de la hoja: la peor (min y max) y la media. */
  private luzBajo(caja: Caja): { min: number; max: number; media: number } {
    let min = Infinity
    let max = -Infinity
    let suma = 0
    let n = 0
    const anotar = (l: number): void => {
      min = Math.min(min, l)
      max = Math.max(max, l)
      suma += l
      n++
    }
    // Una rejilla de puntos de muestra dentro de la caja.
    const pasos = 8
    for (let i = 0; i <= pasos; i++) {
      for (let j = 0; j <= pasos; j++) {
        const x = caja.x + (caja.ancho * i) / pasos
        const y = caja.y + (caja.alto * j) / pasos
        anotar(this.luzEn(x, y))
      }
    }
    return { min, max, media: n ? suma / n : 0 }
  }

  /** La luminancia del fondo en un punto de la hoja. */
  private luzEn(x: number, y: number): number {
    for (const c of [...this.capas].reverse()) {
      if (c.que === 'velo' || c.que === 'logo') continue
      if (x < c.caja.x || x > c.caja.x + c.caja.ancho || y < c.caja.y || y > c.caja.y + c.caja.alto) continue
      if (c.que === 'color') return luminanciaDe(c.color)
      const arte = this.arte.find((a) => a.caja === c.caja)
      const luz = arte?.luz
      if (!luz || !arte) return 0.5
      const sx = arte.recorte.x + ((x - c.caja.x) / c.caja.ancho) * arte.recorte.ancho
      const sy = arte.recorte.y + ((y - c.caja.y) / c.caja.alto) * arte.recorte.alto
      const gx = Math.min(luz.ancho - 1, Math.max(0, Math.floor((sx / arte.img.ancho) * luz.ancho)))
      const gy = Math.min(luz.alto - 1, Math.max(0, Math.floor((sy / arte.img.alto) * luz.alto)))
      return Number(luz.valores[gy * luz.ancho + gx] ?? 0.5)
    }
    return luminanciaDe(this.fondo)
  }

  /**
   * La tinta de una pieza: la que el autor diga, o la que mas contraste da
   * contra lo peor que tenga debajo. Si no llega al umbral (4,5:1, o 3:1 si
   * es grande), un velo debajo, el justo para llegar.
   */
  private tinta(que: PiezaColocada, caja: Caja, grande: boolean, tono: Tono = 'auto'): Gris {
    // Por tramos: un titulo largo (o girado) cruza zonas claras y oscuras.
    const tramos = 6
    const largo = caja.ancho >= caja.alto
    const zonas = Array.from({ length: tramos }, (_v, i) =>
      largo ? { ...caja, x: caja.x + (caja.ancho * i) / tramos, ancho: caja.ancho / tramos } : { ...caja, y: caja.y + (caja.alto * i) / tramos, alto: caja.alto / tramos },
    ).map((z) => this.luzBajo(z))
    const lMax = Math.max(...zonas.map((z) => z.max))
    const lMin = Math.min(...zonas.map((z) => z.min))
    const conClara = contraste(L_CLARA, lMax)
    const conOscura = contraste(L_OSCURA, lMin)
    const clara = tono === 'clara' || (tono === 'auto' && conClara >= conOscura)
    const logrado = clara ? conClara : conOscura
    const umbral = grande ? 3 : 4.5
    if (logrado < umbral) {
      // El velo: lleva lo peor de debajo hasta donde la tinta pasa del umbral
      // (un 5 % por encima: justo en el umbral, el redondeo lo deja debajo).
      const meta = umbral * 1.05
      const objetivo = clara ? (L_CLARA + 0.05) / meta - 0.05 : meta * (L_OSCURA + 0.05) - 0.05
      const alfa = clara ? 1 - Math.max(0, objetivo) / Math.max(lMax, 1e-6) : (objetivo - lMin) / Math.max(1e-6, 1 - lMin)
      const a = Math.min(VELO_MAXIMO, Math.max(0.15, alfa))
      const margen = this.A * 0.04
      this.capas.push({ que: 'velo', caja: { x: caja.x - margen, y: caja.y - margen, ancho: caja.ancho + 2 * margen, alto: caja.alto + 2 * margen }, color: clara ? 'negro' : 'blanco', alfa: Math.round(a * 100) / 100 })
      this.avisos.push({ codigo: 'velo', pieza: que })
      const tras = clara ? contraste(L_CLARA, lMax * (1 - a)) : contraste(L_OSCURA, lMin + (1 - lMin) * a)
      if (tras < umbral - 1e-9) this.avisos.push({ codigo: 'contrasteBajo', pieza: que, contraste: Math.round(tras * 10) / 10 })
    }
    return clara ? TINTA_CLARA : TINTA_OSCURA
  }

  // --- El fondo ---------------------------------------------------------------------

  /** Un dibujo, encuadrado para llenar la caja (sin deformarlo): recorta lo que sobre, centrado en el foco. */
  private ponerArte(rol: 'portada' | 'contraportada', caja: Caja, foco: { x: number; y: number }): boolean {
    const img = this.d.imagenes[rol]
    if (!img) return false
    const escala = Math.max(caja.ancho / img.ancho, caja.alto / img.alto)
    const w = caja.ancho / escala
    const h = caja.alto / escala
    const recorte = { x: Math.min(img.ancho - w, Math.max(0, foco.x * img.ancho - w / 2)), y: Math.min(img.alto - h, Math.max(0, foco.y * img.alto - h / 2)), ancho: w, alto: h }
    this.capas.push({ que: 'arte', rol, caja, recorte })
    this.arte.push({ rol, caja, recorte, luz: img.luz, img })
    // La resolucion, a lo que se imprime: pixeles del recorte por pulgada.
    const ppi = Math.floor(Math.min(w / (caja.ancho / IN), h / (caja.alto / IN)))
    if (ppi < 300) {
      const k = 300 / IN
      this.avisos.push({ codigo: 'resolucionArte', rol, ppi, pixeles: { ancho: Math.ceil(caja.ancho * k), alto: Math.ceil(caja.alto * k) } })
    }
    return true
  }

  private fondoDeHoja(estilo: EstiloPortada): void {
    const m = this.m
    const s = m.sangrado
    // Contraportada (con su sangrado de fuera), lomo y portada (con el suyo).
    const cajaContra = { x: 0, y: 0, ancho: s + m.contra.ancho, alto: m.alto }
    const cajaLomo = { x: m.espina.x, y: 0, ancho: m.lomo, alto: m.alto }
    const cajaPortada = { x: m.portada.x, y: 0, ancho: m.portada.ancho + s, alto: m.alto }
    this.capas.push({ que: 'color', caja: { x: 0, y: 0, ancho: m.ancho, alto: m.alto }, color: this.fondo })
    this.ponerArte('contraportada', cajaContra, { x: 0.5, y: 0.5 })
    if (!this.ponerArte('portada', cajaPortada, this.c.encuadre)) this.avisos.push({ codigo: 'sinPortada' })
    this.capas.push({ que: 'color', caja: cajaLomo, color: this.fondo })
    if (estilo.franja) {
      const alto = this.altoFranja
      this.capas.push({ que: 'color', caja: { x: m.portada.x, y: m.alto - (alto + s), ancho: m.portada.ancho + s, alto: alto + s }, color: PAPEL_FRANJA })
    }
  }

  // --- La portada ---------------------------------------------------------------------

  private portada(estilo: EstiloPortada): boolean {
    const m = this.m
    const A = this.A
    const conTitulo = this.c.titulo ?? estilo.conTitulo
    const base = m.portada.y + m.portada.alto - LINEA_BASE
    const colocadas = new Map<QuePieza, Caja>()
    for (const p of estilo.piezas) {
      if (p.que === 'titulo' && (!conTitulo || !this.d.titulo.trim())) continue
      if (p.que === 'autor' && (!this.c.autor || !this.d.autor.trim())) continue
      const x0 = p.alinear === 'derecha' ? m.portada.x + m.portada.ancho - A / 10 - (p.ancho ?? 0.8) * A : p.alinear === 'izquierda' ? m.portada.x + A / 10 : m.portada.x + (m.portada.ancho - (p.ancho ?? 0.8) * A) / 2
      const x1 = x0 + (p.ancho ?? 0.8) * A
      // Donde cae su ultima linea base (o el pie de su logo).
      const referencia = (de: QuePieza): Caja | undefined => colocadas.get(de)
      const baseDe = (alto: number): number => {
        const a = p.ancla
        if (a.a === 'base') return base
        if (a.a === 'arriba') return m.portada.y + a.d * A + alto
        const r = referencia(a.de)
        if (!r) return base
        if (a.a === 'sobre') return r.y - a.d * A
        return r.y + r.alto + a.d * A + alto
      }

      if (p.que === 'sello' && p.logo) {
        const logo = this.d.imagenes.sello
        if (logo) {
          const ancho = p.logo * A
          const alto = Math.min((ancho * logo.alto) / logo.ancho, 0.12 * A)
          const w = (alto * logo.ancho) / logo.alto
          const pie = baseDe(alto)
          const x = p.alinear === 'centro' ? m.portada.x + (m.portada.ancho - w) / 2 : p.alinear === 'derecha' ? x1 - w : x0
          const caja = { x, y: pie - alto, ancho: w, alto }
          const gris = this.tinta('sello', caja, true, this.c.tintas.sello)
          this.capas.push({ que: 'logo', rol: gris === TINTA_CLARA && this.d.imagenes.selloBlanco ? 'selloBlanco' : 'sello', caja })
          colocadas.set('sello', caja)
          this.piezas.push({ que: 'sello', caja })
          continue
        }
        if (!this.d.sello.trim()) continue
      }

      const texto = p.que === 'titulo' ? this.d.titulo : p.que === 'autor' ? this.d.autor : this.d.sello
      if (p.girado) {
        this.girado(p, texto)
        continue
      }
      let cuerpo = p.cuerpo * A
      let b = this.bloque(texto, { letra: p.letra, cuerpo, mayusculas: p.mayusculas, espaciado: p.espaciado, ancho: x1 - x0, modo: p.alinear === 'centro' ? 'centrado' : 'bandera', interlinea: p.interlinea })
      if (p.llenar && b.ancho > 0) {
        // Que la linea mas larga llene el ancho, sin pasar de 0,3 A de cuerpo.
        cuerpo = Math.min(0.3 * A, (cuerpo * (x1 - x0)) / b.ancho)
        b = this.bloque(texto, { letra: p.letra, cuerpo, mayusculas: p.mayusculas, espaciado: p.espaciado, ancho: (x1 - x0) * 1.001, modo: 'centrado', interlinea: p.interlinea })
      }
      // Si no cabe a lo ancho (una palabra larguisima), o el titulo pasa del
      // 40 % del alto (un titulo largo en un corte apaisado), se reduce.
      const altoMaximo = p.que === 'titulo' ? 0.4 * m.portada.alto : Infinity
      while ((b.ancho > x1 - x0 + 0.01 || this.altoDe(b) + b.baja > altoMaximo) && cuerpo > 6) {
        cuerpo *= 0.92
        b = this.bloque(texto, { letra: p.letra, cuerpo, mayusculas: p.mayusculas, espaciado: p.espaciado, ancho: x1 - x0, modo: p.alinear === 'centro' ? 'centrado' : 'bandera', interlinea: p.interlinea })
      }
      const ultima = baseDe(this.altoDe(b))
      const prevista = { x: x0, y: ultima - this.altoDe(b), ancho: x1 - x0, alto: this.altoDe(b) + b.baja }
      const gris = this.tinta(p.que, this.ajustada(prevista, b, p.alinear, x0, x1), cuerpo >= 18, this.c.tintas[p.que])
      const caja = this.poner(b, ultima, x0, x1, p.alinear, gris)
      colocadas.set(p.que, caja)
      this.piezas.push({ que: p.que, caja })
    }
    return conTitulo && Boolean(this.d.titulo.trim())
  }

  /** La caja de verdad de un bloque (las lineas son mas cortas que la medida). */
  private ajustada(c: Caja, b: Bloque, alinear: PiezaEstilo['alinear'], x0: number, x1: number): Caja {
    const w = b.ancho
    const x = alinear === 'centro' ? x0 + (x1 - x0 - w) / 2 : alinear === 'derecha' ? x1 - w : x0
    return { ...c, x, ancho: w }
  }

  /** El titulo girado a lo largo del borde de fuera de la portada, de arriba abajo. */
  private girado(p: PiezaEstilo, texto: string): void {
    const m = this.m
    const A = this.A
    const margen = p.ancla.a === 'arriba' ? p.ancla.d * A : A / 10
    const largo = m.portada.alto - 2 * margen
    let cuerpo = p.cuerpo * A
    let b = this.bloque(texto, { letra: p.letra, cuerpo, mayusculas: p.mayusculas, espaciado: p.espaciado, ancho: 1e6, modo: 'bandera' })
    if (p.llenar && b.ancho > 0) cuerpo = Math.min(0.16 * A, (cuerpo * largo * 0.8) / b.ancho)
    else if (b.ancho > largo) cuerpo = (cuerpo * largo) / b.ancho
    b = this.bloque(texto, { letra: p.letra, cuerpo, mayusculas: p.mayusculas, espaciado: p.espaciado, ancho: 1e6, modo: 'bandera' })
    const arriba = m.portada.y + margen
    // De arriba abajo, lo alto de las letras mira hacia fuera: la linea base, a la izquierda.
    const borde = m.portada.x + m.portada.ancho - A / 10
    const xBase = borde - b.sube
    const caja = { x: xBase - b.baja, y: arriba, ancho: b.sube + b.baja, alto: b.ancho }
    const gris = this.tinta('titulo', caja, true, this.c.tintas.titulo)
    const l = b.lineas[0]
    if (l) for (const pz of l.piezas) this.ops.push({ op: 'texto', letra: b.letra, cara: pz.cara, cuerpo, x: xBase, y: arriba + pz.x - l.desde, glifos: pz.glifos, gris, giro: 90 })
    this.piezas.push({ que: 'titulo', caja })
  }

  // --- El lomo --------------------------------------------------------------------------

  private lomo(estilo: EstiloPortada): void {
    const m = this.m
    const A = this.A
    const e = m.espina
    const base = e.y + e.alto - LINEA_BASE
    let tope = base
    // El isotipo, centrado y sobre la linea base, si el lomo pasa de 8 mm.
    const iso = this.d.imagenes.isotipo
    if (iso && m.lomo >= ISOTIPO_MINIMO) {
      const ancho = Math.min(m.lomo - 2 * MARGEN_LOMO, 0.07 * A)
      const alto = Math.min((ancho * iso.alto) / iso.ancho, 0.07 * A)
      const w = (alto * iso.ancho) / iso.alto
      const caja = { x: e.x + (m.lomo - w) / 2, y: base - alto, ancho: w, alto }
      const gris = this.tinta('isotipo', caja, true, this.c.tintas.lomo)
      this.capas.push({ que: 'logo', rol: gris === TINTA_CLARA && this.d.imagenes.isotipoBlanco ? 'isotipoBlanco' : 'isotipo', caja })
      this.piezas.push({ que: 'isotipo', caja })
      tope = caja.y - 0.04 * A
    } else if (iso) this.avisos.push({ codigo: 'isotipoOmitido', lomo: Math.round((m.lomo / MM) * 10) / 10 })
    else if (m.lomo >= ISOTIPO_MINIMO) this.avisos.push({ codigo: 'sinIsotipo' })

    const minimo = PAGINAS_TEXTO_LOMO[this.d.destino]
    if (this.d.paginas < minimo) {
      this.avisos.push({ codigo: 'lomoSinTexto', paginas: this.d.paginas, minimo })
      return
    }
    // El texto: tan alto como deje el lomo con 1,6 mm a cada lado (contando
    // lo que suben los acentos), y no mas de lo que pide el estilo.
    const libre = m.lomo - 2 * MARGEN_LOMO
    const desde = e.y + 0.08 * A
    const hasta = tope - 0.04 * A
    const hueco = hasta - desde
    const titulo = this.d.titulo.trim()
    const autor = this.d.autor.trim()
    const medir = (t: string, c: number, letra: LetraCubierta, esp: number): Bloque => this.bloque(t, { letra, cuerpo: c, mayusculas: true, espaciado: esp, ancho: 1e6, modo: 'bandera' })
    const grueso = (t: string, letra: LetraCubierta): number => {
      const b = medir(t, 10, letra, 0)
      return (b.sube + b.baja) / 10
    }
    const porPunto = Math.max(titulo ? grueso(titulo, estilo.letraLomo) : 0, autor ? grueso(autor, 'jost') * 0.8 : 0, 0.5)
    let cuerpo = Math.min(0.034 * A, libre / porPunto)
    if (cuerpo < 5) {
      this.avisos.push({ codigo: 'lomoEstrecho' })
      return
    }
    let bt = titulo ? medir(titulo, cuerpo, estilo.letraLomo, 0.1) : null
    let ba = autor ? medir(autor, cuerpo * 0.8, 'jost', 0.12) : null
    const separacion = 0.08 * A
    const total = (): number => (bt?.ancho ?? 0) + (ba?.ancho ?? 0) + (bt && ba ? separacion : 0)
    if (total() > hueco) {
      cuerpo *= hueco / total()
      bt = titulo ? medir(titulo, cuerpo, estilo.letraLomo, 0.1) : null
      ba = autor ? medir(autor, cuerpo * 0.8, 'jost', 0.12) : null
    }
    const centro = e.x + m.lomo / 2
    const descendente = this.c.lomo === 'descendente'
    const ponerEnLomo = (b: Bloque, inicio: number, que: PiezaColocada): void => {
      // El titulo, arriba; el autor, al final del hueco. La caja, a lo largo del lomo.
      const caja = { x: centro - (b.sube + b.baja) / 2, y: inicio, ancho: b.sube + b.baja, alto: b.ancho }
      const gris = this.tinta(que, caja, b.cuerpo >= 18, this.c.tintas.lomo)
      const l = b.lineas[0]
      if (!l) return
      // De arriba abajo, lo alto de las letras mira a la portada y la linea
      // base queda a su izquierda; de abajo arriba, al reves. Centrado lo que
      // ocupa de verdad, de lo mas bajo a lo mas alto.
      const xBase = descendente ? centro - (b.sube - b.baja) / 2 : centro + (b.sube - b.baja) / 2
      for (const pz of l.piezas) {
        const a = pz.x - l.desde
        this.ops.push({ op: 'texto', letra: b.letra, cara: pz.cara, cuerpo: b.cuerpo, x: xBase, y: descendente ? inicio + a : inicio + b.ancho - a, glifos: pz.glifos, gris, giro: descendente ? 90 : -90 })
      }
      this.piezas.push({ que, caja })
    }
    if (bt) ponerEnLomo(bt, desde, 'lomoTitulo')
    if (ba) ponerEnLomo(ba, hasta - ba.ancho, 'lomoAutor')
  }

  // --- La contraportada ----------------------------------------------------------------

  private contraportada(): Caja {
    const m = this.m
    const A = this.A
    const k = m.contra
    const base = k.y + k.alto - LINEA_BASE
    const codigo = cajaDelCodigo(m)

    // El logo del sello: 1/3 A, a 1/10 A del borde de fuera, sobre la linea base.
    let techo = codigo.y
    const logo = this.d.imagenes.sello
    if (logo) {
      const ancho = A / 3
      const alto = Math.min((ancho * logo.alto) / logo.ancho, 0.18 * A)
      const w = (alto * logo.ancho) / logo.alto
      const caja = { x: k.x + A / 10, y: base - alto, ancho: w, alto }
      const gris = this.tinta('selloContra', caja, true, this.c.tintas.sello)
      this.capas.push({ que: 'logo', rol: gris === TINTA_CLARA && this.d.imagenes.selloBlanco ? 'selloBlanco' : 'sello', caja })
      this.piezas.push({ que: 'selloContra', caja })
      techo = Math.min(techo, caja.y)
    } else if (this.d.sello.trim()) {
      const b = this.bloque(this.d.sello, { letra: 'playfair', cuerpo: 0.035 * A, mayusculas: true, espaciado: 0.25, ancho: A / 3, modo: 'bandera' })
      const prevista = { x: k.x + A / 10, y: base - this.altoDe(b), ancho: b.ancho, alto: this.altoDe(b) }
      const gris = this.tinta('selloContra', prevista, true, this.c.tintas.sello)
      const caja = this.poner(b, base, k.x + A / 10, k.x + A / 10 + A / 3, 'izquierda', gris)
      this.piezas.push({ que: 'selloContra', caja })
      techo = Math.min(techo, caja.y)
    }

    // El codigo: el nuestro, o la caja libre para el de KDP.
    const cifras = this.c.codigo === 'generar' ? cifrasDeIsbn(this.d.isbn) : null
    if (this.c.codigo === 'generar' && !cifras) this.avisos.push({ codigo: 'codigoSinIsbn' })
    if (cifras) this.codigoDeBarras(codigo, cifras)
    else this.avisos.push({ codigo: 'codigoKdp' })
    this.piezas.push({ que: 'codigo', caja: codigo })

    // La sinopsis, arriba, sin bajar nunca a la caja del codigo ni al logo.
    if (this.c.sinopsis && this.d.descripcion.trim()) this.sinopsis({ x: k.x + A / 10, y: k.y + A / 10, ancho: k.ancho - A / 5, alto: techo - 0.06 * A - (k.y + A / 10) })
    return codigo
  }

  private sinopsis(caja: Caja): void {
    const fu = this.f.libro.regular
    let cuerpo = 11
    let b = this.bloque(this.d.descripcion, { letra: 'libro', cuerpo, ancho: caja.ancho, modo: 'bandera', interlinea: 1.38 })
    // Si no cabe, mas pequeña (hasta 9 pt); si aun no, se corta y se dice.
    while (b.sube + b.lineas.length * b.paso > caja.alto && cuerpo > 9) {
      cuerpo -= 0.5
      b = this.bloque(this.d.descripcion, { letra: 'libro', cuerpo, ancho: caja.ancho, modo: 'bandera', interlinea: 1.38 })
    }
    const caben = Math.max(0, Math.floor((caja.alto - b.sube - (Math.abs(fu.descendente) * cuerpo) / fu.upm) / b.paso) + 1)
    if (caben < b.lineas.length) {
      this.avisos.push({ codigo: 'sinopsisCortada' })
      b = { ...b, lineas: b.lineas.slice(0, caben) }
    }
    if (b.lineas.length === 0) return
    const ultima = caja.y + b.sube + (b.lineas.length - 1) * b.paso
    const gris = this.tinta('sinopsis', { x: caja.x, y: caja.y, ancho: b.ancho, alto: this.altoDe(b) + b.baja }, false, this.c.tintas.sinopsis)
    const puesta = this.poner(b, ultima, caja.x, caja.x + caja.ancho, 'izquierda', gris)
    this.piezas.push({ que: 'sinopsis', caja: puesta })
  }

  /** El EAN-13 en vectores, en su caja blanca: el ISBN encima, las barras y las cifras debajo (codigo.ts). */
  private codigoDeBarras(caja: Caja, cifras: string): void {
    this.ops.push(...componerCodigo(caja, { cifras, arriba: isbnLegible(this.d.isbn, cifras), conCifras: true, gris: 0 }, this.f))
  }

  componer(): CubiertaCompuesta {
    const estilo = ESTILOS[this.c.estilo]
    if (estilo.franja && this.altoFranja <= 0) {
      // Una vuelta en seco para ver hasta donde sube el texto de la portada:
      // la franja lo tiene que cubrir entero, con 1/20 A de aire por arriba.
      const minimo = estilo.franja * this.A
      const prueba = new Cubierta(this.d, this.c, this.f, minimo)
      prueba.fondoDeHoja(estilo)
      prueba.portada(estilo)
      const tope = Math.min(...prueba.piezas.map((p) => p.caja.y))
      const pie = this.m.portada.y + this.m.portada.alto
      this.altoFranja = Math.max(minimo, Number.isFinite(tope) ? pie - tope + this.A / 20 : 0)
    }
    this.fondoDeHoja(estilo)
    const conTitulo = this.portada(estilo)
    this.lomo(estilo)
    const codigo = this.contraportada()
    this.avisos.push({ codigo: 'colorRgb' })
    if (this.d.destino === 'ingram' && this.c.lomoManual <= 0) this.avisos.push({ codigo: 'lomoDeIngram' })
    return { medidas: this.m, capas: this.capas, ops: this.ops, codigo, piezas: this.piezas, avisos: this.avisos, estilo: estilo.id, conTitulo }
  }
}

export function componerCubierta(d: DatosCubierta, c: ConfigCubierta, f: FuentesCubierta): CubiertaCompuesta {
  return new Cubierta(d, c, f).componer()
}
