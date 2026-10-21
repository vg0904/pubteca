/**
 * El estado de la pantalla de IMPORTAR, puro y sin navegador.
 *
 * Una importacion es una propuesta que el autor corrige antes de aplicar nada:
 * el documento como lista plana de bloques, los cortes (los que propone la app
 * y los que pone el autor) y lo que hubo que descartar. Cada clic en «Cortar
 * aqui» o «No cortar aqui» pasa por `reducirImportacion`, y la vista entera se
 * recalcula con `vistaImportacion`, que es `aplicarCortes` sobre los cortes
 * marcados. Nada toca el proyecto hasta que el autor confirma.
 *
 * La deteccion acierta mucho pero nunca siempre. Lo que salva el caso real no
 * es acertar siempre: es que corregirla cueste un clic, y que se vea.
 */
import type { InfoImagen } from '../core/imagen-inspeccion'
import { inspeccionarImagen } from '../core/imagen-inspeccion'
import { RE_ESCENA, RE_TITULO } from '../core/parser'
import { ordenarNatural } from '../core/texto'
import {
  aplicarCortes,
  cabeceraSugerida,
  finDeCabecera,
  vieneMarcado,
  type CorteSugerido,
  type Descartado,
  type Propuesta,
} from './importar/docx'
import { capituloDesdeDialecto, partirCabecera, resumir, type ResumenImportacion } from './importar/dialecto'
import { textoDeTramos, type Bloque, type Capitulo, type Extra, type Tramo } from './modelo'

/** Una imagen que vino con la importacion, ya inspeccionada por sus bytes. */
export interface ImagenImportada {
  readonly id: string
  readonly nombreOriginal: string
  readonly bytes: Uint8Array
  readonly info: InfoImagen
}

/** Que hacer con lo que hay antes del primer capitulo. */
export type DestinoHuerfanos = 'dedicatoria' | 'fuera'

/** Un corte con su `marcado` siempre explicito: aqui es el estado de una casilla. */
export interface Corte extends CorteSugerido {
  readonly marcado: boolean
}

export interface Importacion {
  readonly origen: 'docx' | 'texto'
  /** El nombre del archivo, o «Texto pegado». */
  readonly nombre: string
  readonly bloques: readonly Bloque[]
  /** Ordenados por indice. Incluye los sugeridos sin marcar. */
  readonly cortes: readonly Corte[]
  readonly imagenes: readonly ImagenImportada[]
  readonly descartado: readonly Descartado[]
  /** Nombres de imagen que piden las marcas de un `.md` y no venian. */
  readonly faltan: readonly string[]
  /**
   * Imagenes que vinieron con los archivos pero no las pide ninguna marca. No
   * se importan (no se sabe donde van), pero se dice: nunca en silencio.
   */
  readonly sobrantes: readonly string[]
  readonly huerfanos: DestinoHuerfanos
  /** Que capitulo se esta mirando en la vista previa. */
  readonly viendo: number
}

export type AccionImportacion =
  | { readonly tipo: 'marcar'; readonly indice: number; readonly marcado: boolean }
  | { readonly tipo: 'cortarAqui'; readonly indice: number }
  | { readonly tipo: 'lineaSiguiente'; readonly indice: number; readonly usar: boolean }
  | { readonly tipo: 'quitarVacios' }
  | { readonly tipo: 'huerfanos'; readonly destino: DestinoHuerfanos }
  | { readonly tipo: 'ver'; readonly capitulo: number }

const textoDe = (b: Bloque | undefined): string =>
  b && (b.tipo === 'parrafo' || b.tipo === 'subtitulo') ? textoDeTramos(b.tramos) : ''

const esTexto = (b: Bloque | undefined): boolean =>
  b !== undefined && (b.tipo === 'parrafo' || b.tipo === 'subtitulo')

/**
 * La cabecera de un corte en una linea o en dos.
 *
 * En una linea: «Capitulo 3: El bosque» se parte en etiqueta y titulo, y
 * cualquier otra cosa es titulo entero. En dos: la linea es la etiqueta y la
 * siguiente el titulo, que es como se escribe en Word.
 */
export function cabeceraDe(
  bloques: readonly Bloque[],
  indice: number,
  dosLineas: boolean,
): { etiqueta: string; titulo: string; finCabecera: number } {
  const texto = textoDe(bloques[indice])
  if (dosLineas && esTexto(bloques[indice + 1])) {
    return { etiqueta: texto, titulo: textoDe(bloques[indice + 1]), finCabecera: indice + 1 }
  }
  const partida = partirCabecera(texto)
  return { etiqueta: partida.etiqueta, titulo: partida.titulo, finCabecera: indice }
}

/** Si el corte usa la linea siguiente como titulo. */
export const usaLineaSiguiente = (c: CorteSugerido): boolean => finDeCabecera(c) > c.indice

/**
 * Deja los cortes sin solapes: una cabecera de dos lineas no puede tragarse la
 * linea donde empieza otro corte marcado, o saldria un capitulo vacio con el
 * titulo del anterior. La de dos lineas vuelve a ser de una, sea cual sea el
 * corte que el autor acaba de tocar: asi ninguno de los dos desaparece.
 */
function sinSolapes(cortes: readonly Corte[], bloques: readonly Bloque[]): Corte[] {
  const marcados = new Set(cortes.filter((c) => c.marcado).map((c) => c.indice))
  return cortes.map((c) =>
    c.marcado && usaLineaSiguiente(c) && marcados.has(finDeCabecera(c))
      ? { ...c, ...cabeceraDe(bloques, c.indice, false) }
      : c,
  )
}

function ordenar(cortes: readonly Corte[]): Corte[] {
  return [...cortes].sort((a, b) => a.indice - b.indice)
}

/** El corte que empieza en `indice`, si lo hay. */
export function corteEn(imp: Importacion, indice: number): Corte | undefined {
  return imp.cortes.find((c) => c.indice === indice)
}

/** Si el bloque es la SEGUNDA linea de la cabecera de un corte marcado. */
export function esLineaDeTitulo(imp: Importacion, indice: number): boolean {
  return imp.cortes.some((c) => c.marcado && c.indice < indice && finDeCabecera(c) >= indice)
}

export function reducirImportacion(imp: Importacion, a: AccionImportacion): Importacion {
  switch (a.tipo) {
    case 'marcar': {
      const corte = corteEn(imp, a.indice)
      if (!corte) return imp
      // Un corte que puso el autor y luego quita no era una sugerencia: se va.
      const cortes =
        !a.marcado && corte.motivo === 'manual'
          ? imp.cortes.filter((c) => c !== corte)
          : imp.cortes.map((c) => (c === corte ? { ...c, marcado: a.marcado } : c))
      return { ...imp, cortes: sinSolapes(cortes, imp.bloques) }
    }

    case 'cortarAqui': {
      if (corteEn(imp, a.indice)) return reducirImportacion(imp, { tipo: 'marcar', indice: a.indice, marcado: true })
      // Un capitulo solo puede empezar en una linea de texto: su cabecera.
      if (!esTexto(imp.bloques[a.indice])) return imp
      const sugerida = cabeceraSugerida(imp.bloques, a.indice)
      // Si la linea siguiente ya es el comienzo de otro corte, no se la lleva.
      const cabecera =
        sugerida.finCabecera > a.indice && corteEn(imp, sugerida.finCabecera)
          ? cabeceraDe(imp.bloques, a.indice, false)
          : sugerida
      const nuevo: Corte = { indice: a.indice, ...cabecera, motivo: 'manual', marcado: true }
      return { ...imp, cortes: sinSolapes(ordenar([...imp.cortes, nuevo]), imp.bloques) }
    }

    case 'lineaSiguiente': {
      const corte = corteEn(imp, a.indice)
      if (!corte) return imp
      // La linea siguiente no puede ser el titulo si es donde empieza otro corte.
      if (a.usar && (!esTexto(imp.bloques[a.indice + 1]) || corteEn(imp, a.indice + 1)?.marcado)) {
        return imp
      }
      const cabecera = cabeceraDe(imp.bloques, a.indice, a.usar)
      return {
        ...imp,
        cortes: imp.cortes.map((c) => (c === corte ? { ...c, ...cabecera } : c)),
      }
    }

    case 'quitarVacios': {
      const vacios = new Set(capitulosVacios(imp))
      if (vacios.size === 0) return imp
      return {
        ...imp,
        cortes: imp.cortes
          .filter((c) => !(vacios.has(c.indice) && c.motivo === 'manual'))
          .map((c) => (vacios.has(c.indice) ? { ...c, marcado: false } : c)),
      }
    }

    case 'huerfanos':
      return { ...imp, huerfanos: a.destino }

    case 'ver':
      return { ...imp, viendo: Math.max(0, a.capitulo) }
  }
}

/** Ids deterministas para la vista previa: la vista se recalcula en cada clic. */
function idsDeVista(): (prefijo: string) => string {
  let n = 0
  return (prefijo) => `vista-${prefijo}-${++n}`
}

export interface VistaImportacion {
  readonly capitulos: readonly Capitulo[]
  /** El indice, en `bloques`, del corte de cada capitulo. */
  readonly indices: readonly number[]
  readonly huerfanos: readonly Bloque[]
  readonly resumen: ResumenImportacion
}

/** Lo que saldria si el autor confirmara ahora mismo. */
export function vistaImportacion(imp: Importacion): VistaImportacion {
  const marcados = imp.cortes.filter((c) => c.marcado)
  const { capitulos, huerfanos } = aplicarCortes(imp.bloques, marcados, idsDeVista())
  return {
    capitulos,
    indices: marcados.map((c) => c.indice),
    huerfanos,
    resumen: resumir(capitulos),
  }
}

/**
 * Los cortes marcados cuyo capitulo no tiene ni una linea de texto.
 *
 * Es la huella de un indice escrito a mano al principio del Word: cada linea
 * «Capitulo 3: ...» parece una cabecera, y salen veinte capitulos vacios.
 */
export function capitulosVacios(imp: Importacion): number[] {
  const v = vistaImportacion(imp)
  return v.capitulos.flatMap((c, i) =>
    c.bloques.some((b) => b.tipo !== 'escena') || c.aperturas.length > 0 ? [] : [v.indices[i] as number],
  )
}

/** Si un bloque del documento es solo un simbolo de cambio de escena («* * *», «#»). */
function esLineaDeEscena(b: Bloque): boolean {
  if (b.tipo !== 'parrafo') return false
  const t = textoDeTramos(b.tramos).trim()
  return t === '#' || RE_ESCENA.test(t)
}

/**
 * Un parrafo que solo es «* * *» es un cambio de escena: es lo que el escritor
 * escribe en Word para marcarlo. Sin esto llegaba al EPUB como un parrafo con
 * sangria y tres asteriscos. Se cambia en el mismo sitio, asi que los indices
 * de los cortes siguen valiendo; un corte que cayera ahi se descarta.
 */
function escenasDeLinea(bloques: readonly Bloque[]): Bloque[] {
  return bloques.map((b) => (esLineaDeEscena(b) ? { id: b.id, tipo: 'escena' as const } : b))
}

/** Desde la propuesta del importador de Word. */
export function desdePropuesta(propuesta: Propuesta, nombre: string, tieneDedicatoria: boolean): Importacion {
  const bloques = escenasDeLinea(propuesta.bloques)
  const cortes: Corte[] = propuesta.cortes
    .filter((c) => esTexto(bloques[c.indice]))
    .map((c) => ({ ...c, marcado: vieneMarcado(c) }))
  const imp: Importacion = {
    origen: 'docx',
    nombre,
    bloques,
    cortes: ordenar(cortes),
    imagenes: propuesta.imagenes.map((i) => ({
      id: i.id,
      nombreOriginal: i.nombreOriginal,
      bytes: i.bytes,
      info: inspeccionarImagen(i.bytes),
    })),
    descartado: propuesta.descartado,
    faltan: [],
    sobrantes: [],
    huerfanos: 'fuera',
    viendo: 0,
  }
  return { ...imp, huerfanos: destinoInicial(imp, tieneDedicatoria) }
}

/**
 * Lo que hay antes del primer capitulo va por defecto a la dedicatoria, si es
 * corto y el libro no tiene ya una: borrar una pagina de mas es un clic, y
 * recuperar un texto que no se importo no se puede.
 */
function destinoInicial(imp: Importacion, tieneDedicatoria: boolean): DestinoHuerfanos {
  if (tieneDedicatoria) return 'fuera'
  const textos = vistaImportacion(imp).huerfanos.filter(esTexto)
  return textos.length > 0 && textos.length <= 6 ? 'dedicatoria' : 'fuera'
}

/** Cortes sugeridos por linea («Capitulo 3: ...», «Prologo») en una lista de bloques. */
function cortesPorLinea(bloques: readonly Bloque[], desde: number, hasta: number): Corte[] {
  const cortes: Corte[] = []
  let i = desde
  while (i < hasta) {
    const texto = textoDe(bloques[i])
    if (bloques[i]?.tipo === 'parrafo' && (partirCabecera(texto).etiqueta !== '' || RE_TITULO.test(texto))) {
      const cabecera = cabeceraSugerida(bloques, i)
      const fin = Math.min(cabecera.finCabecera, hasta - 1)
      cortes.push({
        indice: i,
        ...(fin === cabecera.finCabecera ? cabecera : cabeceraDe(bloques, i, false)),
        motivo: 'lineaCapitulo',
        marcado: true,
      })
      i = fin + 1
      continue
    }
    i += 1
  }
  return cortes
}

const p = (id: string, tramos: readonly Tramo[]): Bloque => ({ id, tipo: 'parrafo', tramos })

/**
 * Desde uno o varios `.md`/`.txt` en el dialecto del generador.
 *
 * Cada archivo empieza un capitulo (motivo `archivo`), en el orden natural de
 * sus nombres, que es el mismo en que los lee el motor. Dentro de un archivo
 * tambien se proponen cortes por linea: un unico `.md` con el libro entero es
 * tan comun como el `.docx` unico.
 *
 * Las marcas de ilustracion piden imagenes por NOMBRE. Las que vinieron entre
 * los archivos se emparejan como lo hace el motor (sin mayusculas ni
 * extension); las que no, quedan en `faltan` para decirlo.
 */
export function desdeDialecto(
  archivos: readonly { readonly nombre: string; readonly texto: string }[],
  imagenes: readonly ImagenImportada[],
  nuevoId: (prefijo: string) => string,
): Importacion {
  const porNombre = new Map(archivos.map((a) => [a.nombre, a]))
  const porStem = new Map(
    imagenes.map((i) => [i.nombreOriginal.toLowerCase().replace(/\.(png|jpe?g)$/u, ''), i]),
  )
  const faltan = new Set<string>()
  const pedidas = new Set<string>()
  const resolver = (nombre: string): string => {
    const clave = nombre.trim().toLowerCase().replace(/\.(png|jpe?g)$/u, '')
    const img = porStem.get(clave)
    if (img) {
      pedidas.add(img.id)
      return img.id
    }
    faltan.add(nombre)
    return nombre
  }

  const bloques: Bloque[] = []
  const cortes: Corte[] = []
  for (const nombre of ordenarNatural([...porNombre.keys()])) {
    const cap = capituloDesdeDialecto((porNombre.get(nombre) as { texto: string }).texto)
    if (!cap) continue
    const inicioAperturas = bloques.length
    for (const a of cap.aperturas) {
      bloques.push({ id: nuevoId('b'), tipo: 'ilustracion', imagenId: resolver(a.imagenId), alt: a.alt, decorativa: false })
    }
    const indice = bloques.length
    // La cabecera se aplana en una o dos lineas para que el autor la vea como
    // en su archivo y `aplicarCortes` conserve los tramos del titulo.
    if (cap.etiqueta) {
      bloques.push(p(nuevoId('b'), [{ texto: cap.etiqueta, marcas: [] }]))
      bloques.push(p(nuevoId('b'), cap.titulo))
    } else {
      bloques.push(p(nuevoId('b'), cap.titulo))
    }
    const finCabecera = bloques.length - 1
    cortes.push({
      indice,
      finCabecera,
      etiqueta: cap.etiqueta,
      titulo: textoDeTramos(cap.titulo),
      motivo: 'archivo',
      marcado: true,
      inicioAperturas,
    })
    const desde = bloques.length
    for (const b of cap.bloques) {
      bloques.push(b.tipo === 'ilustracion' ? { ...b, imagenId: resolver(b.imagenId) } : b)
    }
    cortes.push(...cortesPorLinea(bloques, desde, bloques.length))
  }

  return {
    origen: 'texto',
    nombre: archivos.length === 1 ? (archivos[0] as { nombre: string }).nombre : `${archivos.length} archivos`,
    bloques,
    cortes: ordenar(cortes),
    imagenes,
    descartado: [],
    faltan: [...faltan],
    sobrantes: imagenes.filter((i) => !pedidas.has(i.id)).map((i) => i.nombreOriginal),
    huerfanos: 'fuera',
    viendo: 0,
  }
}

/**
 * Desde texto pegado o una lista de parrafos ya leidos: cada parrafo es un
 * bloque, los «* * *» son cambios de escena y los cortes se proponen por linea.
 */
export function desdeParrafos(
  parrafos: readonly (readonly Tramo[])[],
  nombre: string,
  nuevoId: (prefijo: string) => string,
  tieneDedicatoria: boolean,
): Importacion {
  const bloques = escenasDeLinea(
    parrafos.filter((t) => textoDeTramos(t).trim() !== '').map((t) => p(nuevoId('b'), t)),
  )
  const imp: Importacion = {
    origen: 'texto',
    nombre,
    bloques,
    cortes: cortesPorLinea(bloques, 0, bloques.length),
    imagenes: [],
    descartado: [],
    faltan: [],
    sobrantes: [],
    huerfanos: 'fuera',
    viendo: 0,
  }
  return { ...imp, huerfanos: destinoInicial(imp, tieneDedicatoria) }
}

export interface Resultado {
  readonly capitulos: readonly Capitulo[]
  readonly extras: readonly Extra[]
  /** Solo las imagenes que se usan y que el EPUB puede llevar (PNG o JPG). */
  readonly imagenes: readonly ImagenImportada[]
  /** Las que venian pero no son PNG ni JPG. Se dicen, no se tiran en silencio. */
  readonly inservibles: readonly ImagenImportada[]
}

/** El nombre con el que se ve una imagen que el EPUB no puede llevar. */
function nombreInservible(i: ImagenImportada): string {
  const formato = i.info.impostor && i.info.impostor !== 'desconocido' ? i.info.impostor.toUpperCase() : 'formato desconocido'
  return `${i.nombreOriginal} (${formato})`
}

/**
 * Lo que entra al proyecto al confirmar, con ids NUEVOS para todo.
 *
 * Los ids de la importacion pueden repetirse entre sesiones (los del dialecto
 * salen de un contador), y dos bloques con el mismo id en un proyecto se
 * pisarian en el editor.
 */
export function resultadoImportacion(imp: Importacion, nuevoId: (prefijo: string) => string): Resultado {
  const marcados = imp.cortes.filter((c) => c.marcado)
  const { capitulos, huerfanos } = aplicarCortes(imp.bloques, marcados, nuevoId)

  const porId = new Map(imp.imagenes.map((i) => [i.id, i]))
  const usadas = new Set<string>()
  const inservibles = new Map<string, ImagenImportada>()
  const imagen = (id: string): string => {
    const i = porId.get(id)
    if (!i) return id
    if (i.info.tipo === null) {
      inservibles.set(i.id, i)
      return nombreInservible(i)
    }
    usadas.add(id)
    return id
  }
  const rehacer = (b: Bloque): Bloque =>
    b.tipo === 'ilustracion' ? { ...b, id: nuevoId('b'), imagenId: imagen(b.imagenId) } : { ...b, id: nuevoId('b') }

  const caps: Capitulo[] = capitulos.map((c) => ({
    ...c,
    aperturas: c.aperturas.map((a) => ({ imagenId: imagen(a.imagenId), alt: a.alt })),
    bloques: c.bloques.map(rehacer),
  }))

  const extras: Extra[] = []
  if (imp.huerfanos === 'dedicatoria') {
    // La dedicatoria solo lleva parrafos y versos: el motor ignora lo demas,
    // asi que el subtitulo pasa a parrafo y no se cuela nada que no saldria.
    const bloques = huerfanos.flatMap((b): Bloque[] =>
      b.tipo === 'parrafo' || b.tipo === 'versos'
        ? [{ ...b, id: nuevoId('b') }]
        : b.tipo === 'subtitulo'
          ? [{ id: nuevoId('b'), tipo: 'parrafo', tramos: b.tramos }]
          : [],
    )
    if (bloques.length > 0) {
      extras.push({
        id: nuevoId('extra'),
        donde: 'inicio',
        tipo: 'dedicatoria',
        titulo: [],
        bloques,
        nombreArchivo: 'dedicatoria',
      })
    }
  }

  return {
    capitulos: caps,
    extras,
    imagenes: imp.imagenes.filter((i) => usadas.has(i.id)),
    inservibles: [...inservibles.values()],
  }
}
