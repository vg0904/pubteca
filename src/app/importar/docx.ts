/**
 * Importar Word (.docx) -> una PROPUESTA que el autor revisa.
 *
 * Es la via de entrada que de verdad justifica Pubteca: la mayoria de los
 * autores escriben en Word, y obligarles a convertir a Markdown primero
 * reintroduce el problema que la app viene a resolver.
 *
 * DISENO: este modulo NO decide por el autor. Devuelve el documento como una
 * lista PLANA de bloques, mas una lista de cortes SUGERIDOS con el motivo de
 * cada uno, mas las imagenes extraidas y lo que hubo que descartar. La interfaz
 * lo muestra, el autor ajusta donde empieza cada capitulo y donde va cada
 * ilustracion, y solo entonces se llama a `aplicarCortes`.
 *
 * El motivo es que la deteccion automatica falla de formas que el autor ve al
 * instante y nosotros no: un «Capitulo» que era una cita, un salto que no
 * estaba, un titulo con el estilo equivocado. Una importacion que reorganiza
 * 400 parrafos en silencio es la forma mas rapida de que cierre la pestana y no
 * vuelva.
 *
 * DOS CUIDADOS CON MAMMOTH, los dos documentados por su propio README:
 *
 * 1. NO SANEA SU SALIDA. El HTML que devuelve no se inyecta nunca: se recorre
 *    nodo a nodo con DOMParser y se mapea al modelo. Nada de innerHTML ni de
 *    dangerouslySetInnerHTML.
 * 2. POR DEFECTO INCRUSTA LAS IMAGENES COMO data:URI EN BASE64. Con un libro
 *    ilustrado eso es un string de decenas de MB en memoria, un 33 % mas
 *    grande que los bytes originales, y en Safari un camino directo a que el
 *    sistema mate la pestana. Se pasa `convertImage` desde el primer dia.
 */
import { RE_TITULO } from '../../core/parser'
import {
  normalizarLinea,
  textoDeTramos,
  type Bloque,
  type Capitulo,
  type Marca,
  type Tramo,
} from '../modelo'
import { partirCabecera } from './dialecto'
import { alinear, parrafosDeDocx, SOLO_IMAGEN, type ParrafoDocx } from './saltos'

/** Prefijo del `src` con el que se marcan las imagenes extraidas. */
const MARCADOR = 'pubteca-imagen:'

export interface ImagenExtraida {
  readonly id: string
  readonly nombreOriginal: string
  readonly contentType: string
  readonly bytes: Uint8Array
}

export interface Descartado {
  readonly que: string
  readonly cuantos: number
  readonly porque: string
}

/** Por que se sugiere un corte. El autor necesita saberlo para confiar o corregir. */
export type MotivoCorte = 'estiloTitulo' | 'lineaCapitulo' | 'saltoDePagina'

export interface CorteSugerido {
  /** Indice, en la lista plana, del bloque que seria la cabecera del capitulo. */
  readonly indice: number
  /**
   * Ultimo bloque que forma parte de la cabecera. Igual a `indice` salvo cuando
   * el titulo viene en la linea SIGUIENTE a la etiqueta, que en un manuscrito
   * de Word es la forma mas comun:
   *
   *     CAPITULO UNO
   *     El despertar
   *
   * Sin esto, «El despertar» acababa siendo el primer parrafo del capitulo.
   * Si falta, vale `indice`.
   */
  readonly finCabecera?: number
  readonly etiqueta: string
  readonly titulo: string
  readonly motivo: MotivoCorte
  /**
   * Si la app lo propone ya marcado. Un estilo «Titulo 1» o una linea que dice
   * «Capitulo 3» son señales fuertes; un salto de pagina solo, no: tambien se
   * usa para separar la dedicatoria o los agradecimientos. Los flojos se
   * enseñan sin marcar, que el autor los vea y decida.
   *
   * Si falta, cuenta como marcado: un corte que pone el autor a mano no es una
   * sugerencia, y no tiene por que repetirlo.
   */
  readonly marcado?: boolean
}

/** El `finCabecera` efectivo de un corte. */
export const finDeCabecera = (c: CorteSugerido): number => c.finCabecera ?? c.indice

/** Si un corte entra marcado. */
export const vieneMarcado = (c: CorteSugerido): boolean => c.marcado !== false

export interface Propuesta {
  /** TODO el documento como una lista plana, en el orden en que venia. */
  readonly bloques: readonly Bloque[]
  /** Cortes SUGERIDOS. La interfaz los muestra con casillas y el autor decide. */
  readonly cortes: readonly CorteSugerido[]
  readonly imagenes: readonly ImagenExtraida[]
  /** Lo que el documento traia y el EPUB no puede representar. Nunca en silencio. */
  readonly descartado: readonly Descartado[]
}

const RAZONES: Record<string, string> = {
  table: 'Un EPUB de novela no lleva tablas, y en la pantalla de un movil no caben.',
  ul: 'Las listas no forman parte del formato del libro.',
  ol: 'Las listas no forman parte del formato del libro.',
  s: 'El tachado no se conserva.',
  u: 'El subrayado no se conserva: en un libro se usa la cursiva.',
  a: 'Los enlaces se quedan como texto.',
  sup: 'Los superindices no se conservan.',
  sub: 'Los subindices no se conservan.',
  br: 'Un salto de linea suelto se convierte en un parrafo nuevo.',
}

const MARCAS_EN_LINEA: Record<string, Marca> = {
  em: 'cursiva',
  i: 'cursiva',
  strong: 'negrita',
  b: 'negrita',
}

/** Recorre los nodos en linea de un elemento y acumula los tramos. */
function tramosDeNodo(
  nodo: Node,
  marcas: readonly Marca[],
  salida: Tramo[],
  descartes: Map<string, number>,
): void {
  for (const hijo of Array.from(nodo.childNodes)) {
    if (hijo.nodeType === 3) {
      salida.push({ texto: hijo.textContent ?? '', marcas: [...marcas] })
      continue
    }
    if (hijo.nodeType !== 1) continue
    const el = hijo as Element
    const etiqueta = el.tagName.toLowerCase()
    const marca = MARCAS_EN_LINEA[etiqueta]
    if (marca) {
      tramosDeNodo(el, marcas.includes(marca) ? marcas : [...marcas, marca], salida, descartes)
      continue
    }
    // Una imagen dentro de un parrafo se saca como bloque propio: el motor las
    // pone a pagina completa y no sabe ponerlas en linea.
    if (etiqueta === 'img') continue
    if (RAZONES[etiqueta]) descartes.set(etiqueta, (descartes.get(etiqueta) ?? 0) + 1)
    // El contenido se conserva aunque la etiqueta se descarte: el texto del
    // autor no se pierde nunca.
    tramosDeNodo(el, marcas, salida, descartes)
  }
}

function tramosDeElemento(el: Element, descartes: Map<string, number>): Tramo[] {
  const salida: Tramo[] = []
  tramosDeNodo(el, [], salida, descartes)
  return normalizarLinea(salida)
}

const textoDe = (tramos: readonly Tramo[]): string => tramos.map((t) => t.texto).join('')

export interface OpcionesDocx {
  /** Nombre del archivo, para nombrar las imagenes extraidas. */
  readonly nombreArchivo: string
  /** Genera ids. Se inyecta para que los tests sean deterministas. */
  readonly nuevoId: (prefijo: string) => string
}

interface Contexto {
  readonly opciones: OpcionesDocx
  readonly imagenPorSrc: Map<string, string>
  readonly descartes: Map<string, number>
}

/** Las imagenes de un elemento, en orden, ya extraidas. */
function imagenesDe(el: Element, ctx: Contexto): { imagenId: string; alt: string }[] {
  return Array.from(el.querySelectorAll('img')).flatMap((img) => {
    const id = ctx.imagenPorSrc.get(img.getAttribute('src') ?? '')
    return id ? [{ imagenId: id, alt: img.getAttribute('alt') ?? '' }] : []
  })
}

/**
 * Lo que produce un elemento del HTML de mammoth.
 *
 * Ademas de los bloques lleva los PARRAFOS que representa, con el bloque al que
 * fue a parar cada uno (indice relativo a `bloques`). Eso es lo que permite
 * emparejar el HTML con los `w:p` del `.docx` y recuperar los saltos de pagina
 * que mammoth descarta. Casi siempre es un parrafo y un bloque; una tabla da
 * varios, y una cita da varios parrafos que caen todos en el mismo bloque de
 * versos.
 */
interface Trozo {
  readonly bloques: readonly Bloque[]
  readonly parrafos: readonly { readonly texto: string; readonly bloque: number }[]
}

/** Un elemento de bloque del HTML de mammoth -> bloques del modelo. */
function bloquesDeElemento(el: Element, ctx: Contexto): Trozo {
  const etiqueta = el.tagName.toLowerCase()
  const nuevo = (): string => ctx.opciones.nuevoId('b')
  const salida: Bloque[] = []
  const parrafos: { texto: string; bloque: number }[] = []

  if (etiqueta === 'hr') {
    salida.push({ id: nuevo(), tipo: 'escena' })
    return { bloques: salida, parrafos }
  }

  if (etiqueta === 'blockquote') {
    // Word marca las citas con el estilo Quote; en una novela eso es casi
    // siempre una cancion, un poema o una carta: el bloque de versos.
    const versos = Array.from(el.querySelectorAll('p'))
      .map((p) => tramosDeElemento(p, ctx.descartes))
      .filter((t) => textoDe(t).trim() !== '')
      .map((t) => ({ texto: textoDe(t), marcas: t[0]?.marcas ?? [] }))
    if (versos.length > 0) {
      salida.push({ id: nuevo(), tipo: 'versos', estrofas: [versos] })
      // Todos los versos son el mismo bloque, pero cada uno era un `w:p`.
      for (const v of versos) parrafos.push({ texto: v.texto, bloque: 0 })
    }
    return { bloques: salida, parrafos }
  }

  if (/^h[2-6]$/u.test(etiqueta)) {
    const tramos = tramosDeElemento(el, ctx.descartes)
    if (tramos.length > 0) {
      salida.push({ id: nuevo(), tipo: 'subtitulo', tramos })
      parrafos.push({ texto: textoDe(tramos), bloque: 0 })
    }
    return { bloques: salida, parrafos }
  }

  if (etiqueta === 'table' || etiqueta === 'ul' || etiqueta === 'ol') {
    ctx.descartes.set(etiqueta, (ctx.descartes.get(etiqueta) ?? 0) + 1)
    // El texto que hubiera dentro se recupera como parrafos, para no perderlo.
    for (const p of Array.from(el.querySelectorAll('p, li'))) {
      const tramos = tramosDeElemento(p, ctx.descartes)
      if (tramos.length > 0) {
        parrafos.push({ texto: textoDe(tramos), bloque: salida.length })
        salida.push({ id: nuevo(), tipo: 'parrafo', tramos })
      }
    }
    return { bloques: salida, parrafos }
  }

  // Parrafo (y h1, que aqui es un parrafo mas: lo que lo convierte en cabecera
  // es un corte, y el corte lo confirma el autor).
  const tramos = tramosDeElemento(el, ctx.descartes)
  if (tramos.length > 0) {
    parrafos.push({ texto: textoDe(tramos), bloque: 0 })
    salida.push({ id: nuevo(), tipo: 'parrafo', tramos })
  }
  const imagenes = imagenesDe(el, ctx)
  // Un parrafo que es SOLO una imagen no tiene texto, pero mammoth si lo emite
  // como `<p><img/></p>`: tiene que ocupar su ranura, y distinguirse de un
  // parrafo vacio de verdad, para que la alineacion no se desplace.
  if (tramos.length === 0 && imagenes.length > 0) {
    parrafos.push({ texto: SOLO_IMAGEN, bloque: 0 })
  }
  for (const img of imagenes) {
    salida.push({
      id: nuevo(),
      tipo: 'ilustracion',
      imagenId: img.imagenId,
      alt: img.alt,
      decorativa: false,
    })
  }
  return { bloques: salida, parrafos }
}

/** El texto plano de un bloque, vacio si el bloque no lleva texto. */
function textoDeBloque(b: Bloque | undefined): string {
  if (!b) return ''
  return b.tipo === 'parrafo' || b.tipo === 'subtitulo' ? textoDeTramos(b.tramos) : ''
}

/**
 * Un comienzo de linea que descarta que sea un titulo: minuscula, raya de
 * dialogo, o una comilla de apertura.
 */
const RE_NO_TITULO = /^[\p{Ll}\u2014\u2013\-«"'(]/u

/** Si una linea tiene pinta de ser el titulo del capitulo y no su primer parrafo. */
function pareceTitulo(s: string): boolean {
  return (
    s !== '' &&
    s.length <= 70 &&
    !/[.,;:]$/u.test(s) &&
    !RE_NO_TITULO.test(s) &&
    !RE_TITULO.test(s)
  )
}

/**
 * La cabecera que se PROPONE para un corte.
 *
 * No es lo mismo que `partirCabecera`, y la diferencia es deliberada: aquella
 * calca al motor porque es el inverso exacto de lo que el motor escribe. Esta
 * esta adivinando lo que el autor quiso decir en su Word, donde la etiqueta y
 * el titulo van casi siempre en DOS lineas:
 *
 *     CAPITULO UNO
 *     El despertar
 *
 * Una etiqueta a solas («Capitulo 13», «Prologo») se queda como titulo y no
 * pasa al campo de etiqueta: el motor pinta la etiqueta encima de un `<h1>`, y
 * con el titulo vacio saldria una cabecera a medias.
 */
export function cabeceraSugerida(
  bloques: readonly Bloque[],
  indice: number,
): { etiqueta: string; titulo: string; finCabecera: number } {
  const texto = textoDeBloque(bloques[indice])
  const partida = partirCabecera(texto)
  if (partida.etiqueta !== '') {
    return { etiqueta: partida.etiqueta, titulo: partida.titulo, finCabecera: indice }
  }

  if (RE_TITULO.test(texto)) {
    const siguiente = bloques[indice + 1]
    const textoSiguiente = textoDeBloque(siguiente)
    if (siguiente?.tipo === 'parrafo' && pareceTitulo(textoSiguiente)) {
      return { etiqueta: texto, titulo: textoSiguiente, finCabecera: indice + 1 }
    }
  }
  return { etiqueta: '', titulo: texto, finCabecera: indice }
}

/**
 * HTML de mammoth -> propuesta.
 *
 * Los cortes se SUGIEREN por tres vias, y cada una deja su motivo para que la
 * interfaz lo diga:
 *
 *   - el estilo «Titulo 1» de Word;
 *   - una linea que ya parece una cabecera («Capitulo 3: ...», «Prologo»);
 *   - un salto de pagina, que es como se separan los capitulos en un documento
 *     unico y que mammoth descarta (ver `saltos.ts`).
 *
 * Las tres juntas cubren los casos reales: el autor que usa estilos, el que
 * escribe la cabecera a mano, y el que solo pulsa Ctrl+Enter. Aun asi la
 * deteccion NUNCA va a acertar siempre —un capitulo marcado solo con un «4», o
 * con un titulo que no lleva la palabra «capitulo»— y por eso «Cortar aqui» no
 * puede estar escondido en la interfaz. Lo que salva el caso real no es acertar
 * siempre, es que corregirlo cueste un clic.
 *
 * Va en tres pasadas porque proponer la cabecera exige mirar el bloque
 * SIGUIENTE, y durante el recorrido todavia no existe.
 */
export function propuestaDesdeHtml(
  html: string,
  opciones: OpcionesDocx,
  imagenPorSrc: Map<string, string>,
  parrafosDelDocx: readonly ParrafoDocx[] | null = null,
): { bloques: Bloque[]; cortes: CorteSugerido[]; descartado: Descartado[] } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const ctx: Contexto = { opciones, imagenPorSrc, descartes: new Map() }

  const bloques: Bloque[] = []
  /** Los parrafos del HTML en orden, con el bloque de cada uno. Para alinear. */
  const parrafosDelHtml: { texto: string; bloque: number }[] = []
  /** Candidatos a cabecera: el primer bloque con texto de cada elemento. */
  const cabezas: { indice: number; esTitulo1: boolean }[] = []

  // Pasada 1: los bloques.
  for (const el of Array.from(doc.body.children)) {
    const base = bloques.length
    const trozo = bloquesDeElemento(el, ctx)
    bloques.push(...trozo.bloques)
    for (const par of trozo.parrafos) {
      parrafosDelHtml.push({ texto: par.texto, bloque: base + par.bloque })
    }

    const primerParrafo = trozo.bloques.findIndex((b) => b.tipo === 'parrafo')
    if (primerParrafo === -1) continue
    cabezas.push({
      indice: base + primerParrafo,
      esTitulo1: el.tagName.toLowerCase() === 'h1',
    })
  }

  const cortes: CorteSugerido[] = []
  const vistos = new Set<number>()
  const proponer = (indice: number, motivo: MotivoCorte): void => {
    // El primero gana: las pasadas van de la señal mas fuerte a la mas floja.
    if (vistos.has(indice)) return
    const cabecera = cabeceraSugerida(bloques, indice)
    // Los bloques que la cabecera se lleva quedan tomados: si otra señal
    // propusiera un corte en la linea del titulo saldria un capitulo vacio.
    for (let i = indice; i <= cabecera.finCabecera; i += 1) vistos.add(i)
    cortes.push({
      indice,
      finCabecera: cabecera.finCabecera,
      etiqueta: cabecera.etiqueta,
      titulo: cabecera.titulo,
      motivo,
      marcado: motivo !== 'saltoDePagina' || pareceTitulo(textoDeBloque(bloques[indice])),
    })
  }

  // Pasada 2: los cortes por el titulo.
  for (const cabeza of cabezas) {
    const texto = textoDeBloque(bloques[cabeza.indice])
    if (cabeza.esTitulo1) {
      proponer(cabeza.indice, 'estiloTitulo')
    } else if (partirCabecera(texto).etiqueta !== '' || RE_TITULO.test(texto)) {
      proponer(cabeza.indice, 'lineaCapitulo')
    }
  }

  // Pasada 3: los cortes por salto de pagina.
  if (parrafosDelDocx) {
    const emparejado = alinear(parrafosDelDocx, parrafosDelHtml)
    // Un salto cuyo parrafo no encontro pareja (porque mammoth lo descarto)
    // pasa al siguiente que si la tenga: el salto sigue estando ahi.
    let arrastrado = false
    for (const [i, par] of parrafosDelDocx.entries()) {
      const j = emparejado[i]
      if (j === null || j === undefined) {
        arrastrado = arrastrado || par.saltoAntes
        continue
      }
      const salto = par.saltoAntes || arrastrado
      arrastrado = false
      if (!salto) continue
      const indice = (parrafosDelHtml[j] as { bloque: number }).bloque
      const bloque = bloques[indice]
      // Un salto antes de una pagina de ilustracion es una lamina, no un
      // capitulo nuevo.
      if (bloque?.tipo !== 'parrafo' && bloque?.tipo !== 'subtitulo') continue
      proponer(indice, 'saltoDePagina')
    }
  }

  cortes.sort((a, b) => a.indice - b.indice)

  const descartado: Descartado[] = [...ctx.descartes.entries()].map(([que, cuantos]) => ({
    que,
    cuantos,
    porque: RAZONES[que] ?? 'No forma parte del formato del libro.',
  }))

  return { bloques, cortes, descartado }
}

export interface Aplicado {
  readonly capitulos: readonly Capitulo[]
  /**
   * Bloques que quedan ANTES del primer corte. No se reparten por nuestra
   * cuenta: la interfaz pregunta si son el arranque del primer capitulo o una
   * pagina de cortesia.
   */
  readonly huerfanos: readonly Bloque[]
}

/**
 * Aplica los cortes que el autor haya CONFIRMADO y produce los capitulos.
 *
 * Es una funcion pura sobre la propuesta, asi que la interfaz puede recalcular
 * la vista entera cada vez que el autor activa o desactiva un corte, o anade
 * uno con «Cortar aqui».
 *
 * Las ilustraciones que estan justo antes de una cabecera pasan a ser las
 * laminas de apertura de ese capitulo, que es como las coloca quien abre un
 * capitulo con un dibujo.
 */
export function aplicarCortes(
  bloques: readonly Bloque[],
  cortes: readonly CorteSugerido[],
  nuevoId: (prefijo: string) => string,
): Aplicado {
  const ordenados = [...cortes].sort((a, b) => a.indice - b.indice)
  if (ordenados.length === 0) return { capitulos: [], huerfanos: [...bloques] }

  // Para cada corte, donde empieza su tanda de ilustraciones de apertura: la
  // racha de ilustraciones pegadas justo ANTES de la cabecera, sin pasarse del
  // corte anterior. Es como coloca las laminas quien abre un capitulo con un
  // dibujo, y hay que calcularlo antes de repartir para que esos bloques no
  // cuenten dos veces (ni se queden en el capitulo anterior, ni en huerfanos).
  const inicioAperturas = ordenados.map((corte, i) => {
    const limite = i === 0 ? 0 : finDeCabecera(ordenados[i - 1] as CorteSugerido) + 1
    let j = corte.indice - 1
    while (j >= limite && bloques[j]?.tipo === 'ilustracion') j -= 1
    return j + 1
  })

  const capitulos: Capitulo[] = ordenados.map((corte, i) => {
    const finCuerpo = i + 1 < ordenados.length ? (inicioAperturas[i + 1] as number) : bloques.length
    // Si el titulo propuesto es exactamente el texto del bloque del que salio,
    // se conservan sus tramos: asi un titulo en cursiva en Word llega en
    // cursiva en vez de aplanarse.
    const fin = finDeCabecera(corte)
    const bloqueTitulo = bloques[fin]
    const tramos =
      (bloqueTitulo?.tipo === 'parrafo' || bloqueTitulo?.tipo === 'subtitulo') &&
      textoDeTramos(bloqueTitulo.tramos) === corte.titulo
        ? bloqueTitulo.tramos
        : [{ texto: corte.titulo, marcas: [] }]
    return {
      id: nuevoId('cap'),
      etiqueta: corte.etiqueta,
      titulo: tramos,
      aperturas: bloques
        .slice(inicioAperturas[i] as number, corte.indice)
        .flatMap((b) => (b.tipo === 'ilustracion' ? [{ imagenId: b.imagenId, alt: b.alt }] : [])),
      bloques: bloques.slice(fin + 1, finCuerpo),
    }
  })

  return { capitulos, huerfanos: bloques.slice(0, inicioAperturas[0] as number) }
}

/**
 * Lee un `.docx` y devuelve la propuesta.
 *
 * mammoth se carga con `import()` dinamico: pesa unos 90 kB comprimidos y solo
 * hace falta cuando el autor suelta un Word, asi que no entra en la carga
 * inicial de la app.
 *
 * `externalFileAccess` se queda DESACTIVADO, que es el valor por defecto: un
 * .docx podria referenciar archivos externos, y el que sube el autor no siempre
 * es suyo (los correctores y las editoriales devuelven .docx).
 */
export async function importarDocx(
  bytes: ArrayBuffer,
  opciones: OpcionesDocx,
): Promise<Propuesta> {
  const mammoth = await import('mammoth')
  const imagenes: ImagenExtraida[] = []
  const imagenPorSrc = new Map<string, string>()

  // OJO: la clave es `buffer`, NO `arrayBuffer`. En mammoth 1.13 `openZip`
  // acepta `path`, `buffer` o `file`, y con cualquier otra clave falla con
  // «Could not find file in options», que no dice nada de la causa.
  type EntradaMammoth = Parameters<typeof mammoth.convertToHtml>[0]
  const resultado = await mammoth.convertToHtml(
    { buffer: bytes } as unknown as EntradaMammoth,
    {
      // SIN esto, mammoth incrusta cada imagen como data:URI en base64 dentro
      // del HTML: decenas de MB en memoria con un libro ilustrado.
      convertImage: mammoth.images.imgElement(async (image) => {
        const id = opciones.nuevoId('img')
        const crudos = (await image.read()) as unknown as Uint8Array
        const src = `${MARCADOR}${id}`
        imagenPorSrc.set(src, id)
        imagenes.push({
          id,
          nombreOriginal: `${opciones.nombreArchivo}-${imagenes.length + 1}`,
          contentType: image.contentType ?? 'application/octet-stream',
          bytes: new Uint8Array(crudos),
        })
        return { src }
      }),
    },
  )

  // Los saltos de pagina se leen del XML, no del HTML: mammoth los descarta.
  // Si el archivo no se puede abrir a mano, la importacion sigue sin la señal.
  const { bloques, cortes, descartado } = propuestaDesdeHtml(
    resultado.value,
    opciones,
    imagenPorSrc,
    parrafosDeDocx(new Uint8Array(bytes)),
  )
  return { bloques, cortes, imagenes, descartado }
}

export { MARCADOR }
