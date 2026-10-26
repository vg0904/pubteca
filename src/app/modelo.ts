/**
 * El modelo del proyecto en la app.
 *
 * DECISION: el texto se guarda como un AST de bloques tipados, NUNCA como
 * Markdown con asteriscos. El dialecto de Markdown es solo el formato de
 * serializacion (para alimentar al motor y para el .zip del proyecto).
 *
 * El modelo es ISOMORFO al del motor: los bloques de aqui son exactamente los
 * seis que el EPUB sabe representar, y la unica riqueza en linea es cursiva y
 * negrita. Asi es imposible que el escritor cree algo que el generador tire en
 * silencio, que es el fallo mas caro de esta herramienta: ver una cosa en la
 * app y otra en su Kindle.
 */
import type { KindlePropio } from './imagen-ajuste'
import { textosLibro } from '../core/textos-libro'

/** Las unicas dos marcas en linea que el EPUB entiende. */
export type Marca = 'cursiva' | 'negrita'

/**
 * Orden canonico de las marcas. El orden no significa nada (un texto en
 * cursiva y negrita es el mismo sea cual sea el orden de la lista), asi que se
 * canoniza para que dos modelos equivalentes se comparen iguales. Sin esto,
 * importar lo que se acaba de serializar daba ['negrita','cursiva'] porque el
 * motor emite `<strong><em>`.
 */
const ORDEN_MARCAS: readonly Marca[] = ['cursiva', 'negrita']

function canonizarMarcas(marcas: readonly Marca[]): Marca[] {
  const presentes = new Set(marcas)
  return ORDEN_MARCAS.filter((m) => presentes.has(m))
}

/** Un tramo de texto con sus marcas. El escritor nunca ve un asterisco. */
export interface Tramo {
  readonly texto: string
  readonly marcas: readonly Marca[]
}

export type Bloque =
  | { readonly id: string; readonly tipo: 'parrafo'; readonly tramos: readonly Tramo[] }
  | { readonly id: string; readonly tipo: 'subtitulo'; readonly tramos: readonly Tramo[] }
  | { readonly id: string; readonly tipo: 'escena' }
  | {
      readonly id: string
      readonly tipo: 'versos'
      /** Cada estrofa es una lista de versos. */
      readonly estrofas: readonly (readonly Tramo[])[]
    }
  | {
      readonly id: string
      readonly tipo: 'ilustracion'
      /** Referencia al almacen de imagenes, NO un nombre de archivo. */
      readonly imagenId: string
      readonly alt: string
      /** El autor dijo explicitamente que no necesita descripcion. */
      readonly decorativa: boolean
    }

export interface Capitulo {
  readonly id: string
  /** «Capitulo 3», «Prologo», «Interludio» o vacio. Campo aparte del titulo. */
  readonly etiqueta: string
  readonly titulo: readonly Tramo[]
  /** Ilustraciones que van ANTES de la cabecera: el capitulo abre con dibujo. */
  readonly aperturas: readonly { readonly imagenId: string; readonly alt: string }[]
  readonly bloques: readonly Bloque[]
}

export type DondeExtra = 'inicio' | 'final'
export type TipoExtra = 'dedicatoria' | 'epigrafe' | 'conTitulo'

export interface Extra {
  readonly id: string
  readonly donde: DondeExtra
  readonly tipo: TipoExtra
  /** Solo para los de tipo conTitulo. */
  readonly titulo: readonly Tramo[]
  readonly bloques: readonly Bloque[]
  /** Nombre base del archivo en el .zip, para que el enrutado sea estable. */
  readonly nombreArchivo: string
}

/** Una imagen del proyecto. Los bytes viven en el almacen, no aqui. */
export interface Imagen {
  readonly id: string
  /** Como lo llamo el autor, para mostrarselo. */
  readonly nombreOriginal: string
  readonly tipo: 'png' | 'jpeg'
  readonly bytes: number
  readonly ancho: number
  readonly alto: number
  /**
   * Lo que la inspeccion de bytes encontro al subirla, para avisar en la propia
   * tarjeta sin esperar a generar. Opcionales: el motor vuelve a inspeccionar
   * los bytes al construir, asi que esto solo adelanta el aviso.
   */
  readonly alfa?: boolean
  readonly cmyk?: boolean
  readonly p3?: boolean
}

export type RolPortada = 'portada' | 'contraportada' | 'logo' | 'logoBlanco'

/**
 * Como se entregan las imagenes a Kindle.
 *
 * Es una decision de ENTREGA, no de autor: no cambia el libro, cambia el
 * archivo que recibe una tienda. Por eso vale para TODAS las imagenes de una
 * vez y se elige en la pantalla de descarga, no imagen por imagen (eso, el
 * encuadre y la resolucion, si es decision de autor: ver `imagen-ajuste.ts`).
 *
 * Apple Books no cobra por el tamano del archivo y admite hasta 2 GB, asi que
 * alli van las imagenes TAL CUAL las subio el autor y no hay nada que elegir.
 * Amazon cobra la entrega por MB sobre la regalia del 70 %, asi que a Kindle
 * se le puede mandar una version mas ligera: JPEG con la calidad que el autor
 * elija y, si quiere, en grises (casi todos los Kindle son de tinta
 * electronica en gris, asi que ahi no se nota y pesa bastante menos).
 */
export interface EntregaKindle {
  readonly comprimir: boolean
  /** 1..100. La que se pasa al codificador JPEG. */
  readonly calidad: number
  readonly grises: boolean
}

/**
 * Comprimir NO viene puesto: cambiar el archivo que se publica sin que el
 * autor lo haya pedido no es cosa de una herramienta de publicacion. La
 * pantalla de descarga lo ofrece con el ahorro delante.
 */
export const ENTREGA_KINDLE_POR_DEFECTO: EntregaKindle = { comprimir: false, calidad: 80, grises: false }

/**
 * Que es lo que el autor subio en «Logo del título».
 *
 * `logo` es la pieza del titulo y Pubteca le pone debajo el subtitulo, el autor
 * y el sello. `pagina` es un diseño de portadilla que ocupa la pagina entera y
 * ya los trae dibujados: se trata como una imagen normal y no se le añade nada.
 */
export type DisenoPortadilla = 'logo' | 'pagina'

export const DISENOS_PORTADILLA: readonly DisenoPortadilla[] = ['logo', 'pagina']

export function disenoPortadilla(v: unknown): DisenoPortadilla {
  return v === 'pagina' ? 'pagina' : 'logo'
}

export interface DatosLibro {
  readonly titulo: string
  readonly subtitulo: string
  readonly autor: string
  readonly sello: string
  readonly idioma: string
  readonly descripcion: string
  readonly isbn: string
  readonly fechaPublicacion: string
  readonly derechos: string
  readonly incluirContraportada: boolean
  readonly separadorDeEscena: string
  readonly fuente: string
  /** Si lo de «Logo del título» es un logo o la portadilla entera. */
  readonly portadilla: DisenoPortadilla
}

export interface Proyecto {
  readonly id: string
  readonly version: number
  readonly datos: DatosLibro
  readonly capitulos: readonly Capitulo[]
  readonly extras: readonly Extra[]
  /** Laminas a color de apertura, en orden. */
  readonly laminas: readonly string[]
  /** rol -> id de imagen. */
  readonly portada: Readonly<Partial<Record<RolPortada, string>>>
  /**
   * Como se entregan las imagenes a Kindle. Opcional: un libro guardado antes
   * de que esto existiera no lo trae, y entonces manda el valor por defecto.
   */
  readonly kindle?: EntregaKindle
  /**
   * id de imagen -> el ajuste PROPIO que esa imagen tiene para Kindle, puesto
   * desde la pestaña Kindle del cuadro de ajustar.
   *
   * Solo estan las que el autor toco: la que no aparece sigue lo que diga
   * `kindle`, que es lo normal. Un ajuste propio manda sobre el general, aunque
   * el general tenga comprimir apagado: si el autor entro a esta imagen y le
   * dijo algo, es que lo queria.
   *
   * No guarda una segunda IMAGEN: guarda lo que hay que hacerle a la unica que
   * hay, y la version de Kindle se codifica al generar (ver `entrega.ts`). Por
   * eso el almacen sigue con un blob por imagen y la copia (.zip) con un
   * archivo por imagen.
   */
  readonly kindlePorImagen?: Readonly<Record<string, KindlePropio>>
  /**
   * Cuando se guardo la ultima copia (.zip), en ms. Sin ella, nunca. La
   * interfaz la ensena siempre: el navegador puede borrar lo que guarda.
   */
  readonly ultimaCopia?: number
  /**
   * Con que identidad se descargo el libro por ultima vez. El identificador
   * del EPUB sale de titulo|autor (sin ISBN), asi que si cambian despues de
   * publicar, para las tiendas es OTRO libro, y hay que avisar.
   */
  readonly descargado?: {
    readonly uid: string
    readonly titulo: string
    readonly autor: string
    readonly cuando: number
  }
}

/** La version del formato guardado. Subirla obliga a escribir una migracion. */
export const VERSION_PROYECTO = 1

export const DATOS_POR_DEFECTO: DatosLibro = {
  titulo: '',
  subtitulo: '',
  autor: '',
  sello: '',
  idioma: 'es',
  descripcion: '',
  isbn: '',
  fechaPublicacion: '',
  derechos: textosLibro('es').derechosPorDefecto,
  incluirContraportada: true,
  separadorDeEscena: '* * *',
  fuente: 'Baskerville',
  // Un logo, que es lo que se asumia hasta ahora: un libro guardado antes de
  // que esto existiera se sigue viendo igual.
  portadilla: 'logo',
}

/**
 * Todas las imagenes que el proyecto usa, por id.
 *
 * Un sitio olvidado aqui es una imagen que se borra del almacen estando en uso
 * (la limpieza de huerfanas se guia por esta lista) o que no entra al libro, asi
 * que tiene su test con un proyecto que usa una imagen en cada papel posible.
 */
export function idsDeImagenes(p: Proyecto): Set<string> {
  const ids = new Set<string>([...p.laminas, ...Object.values(p.portada)])
  for (const c of p.capitulos) {
    for (const a of c.aperturas) ids.add(a.imagenId)
    for (const b of c.bloques) if (b.tipo === 'ilustracion') ids.add(b.imagenId)
  }
  for (const x of p.extras) for (const b of x.bloques) if (b.tipo === 'ilustracion') ids.add(b.imagenId)
  return ids
}

/** Texto plano de una secuencia de tramos, sin marcas. */
export function textoDeTramos(tramos: readonly Tramo[]): string {
  return tramos.map((t) => t.texto).join('')
}

/** true si el tramo no aporta nada. */
export function tramoVacio(t: Tramo): boolean {
  return t.texto === ''
}

/**
 * Normaliza una LINEA: como normalizarTramos, pero ademas recorta el espacio de
 * los extremos.
 *
 * El motor recorta cada linea (`lineasDe` hace trim) y tambien el contenido de
 * un verso, asi que el espacio al principio o al final de una linea no es
 * contenido: no hay forma de representarlo en el dialecto. Mejor que el modelo
 * lo sepa que fingir que lo conserva y perderlo al guardar.
 */
export function normalizarLinea(tramos: readonly Tramo[]): Tramo[] {
  let t = normalizarTramos(tramos)
  // En bucle: al recortar, un tramo puede quedarse vacio y dejar al descubierto
  // otro que tambien empieza por espacio.
  for (;;) {
    if (t.length === 0) return t
    const primero = t[0] as Tramo
    const recortado = [...t]
    recortado[0] = { texto: primero.texto.replace(/^\s+/u, ''), marcas: primero.marcas }
    const u = recortado[recortado.length - 1] as Tramo
    recortado[recortado.length - 1] = {
      texto: u.texto.replace(/\s+$/u, ''),
      marcas: u.marcas,
    }
    const limpio = normalizarTramos(recortado)
    if (limpio.length === t.length && limpio.every((x, i) => x.texto === (t[i] as Tramo).texto)) {
      return limpio
    }
    t = limpio
  }
}

/** Normaliza: quita tramos vacios y une los adyacentes con las mismas marcas. */
export function normalizarTramos(tramos: readonly Tramo[]): Tramo[] {
  const salida: Tramo[] = []
  for (const t of tramos) {
    if (tramoVacio(t)) continue
    const previo = salida[salida.length - 1]
    const mismas =
      previo !== undefined &&
      previo.marcas.length === t.marcas.length &&
      previo.marcas.every((m) => t.marcas.includes(m))
    if (mismas && previo) {
      salida[salida.length - 1] = { texto: previo.texto + t.texto, marcas: previo.marcas }
    } else {
      salida.push({ texto: t.texto, marcas: canonizarMarcas(t.marcas) })
    }
  }
  return salida
}
