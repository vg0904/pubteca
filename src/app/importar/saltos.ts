/**
 * Los saltos de pagina de un `.docx`, que mammoth descarta.
 *
 * Es el hueco mas importante del importador. El salto de pagina es como la
 * mayoria de los escritores separa capitulos dentro de un documento unico
 * —Ctrl+Enter al acabar el capitulo— y mammoth lo borra por completo: no deja
 * ni un `<p></p>` en su HTML. Medido: en un manuscrito de cinco capitulos
 * separados asi, la deteccion por patron del titulo acertaba tres.
 *
 * Se recupera abriendo el `.docx` a mano. Ya es un `.zip` y fflate ya es
 * dependencia, asi que solo hay que descomprimir `word/document.xml` y mirar
 * donde estan los `<w:br w:type="page"/>`.
 *
 * NADA de esto puede tirar la importacion: un `.docx` raro, de otra suite o con
 * el XML comprimido de otra forma, tiene que seguir importandose aunque sea sin
 * esta señal. Todos los fallos devuelven `null`.
 */
import { unzipSync } from 'fflate'

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const DOCUMENTO = 'word/document.xml'

/**
 * Texto con el que se marca un parrafo que no tiene texto pero si una imagen.
 *
 * mammoth descarta los parrafos vacios, pero NO el que lleva solo una imagen:
 * ese sale como `<p><img/></p>`. Sin distinguirlos, la alineacion empareja el
 * parrafo del salto con la ranura de la imagen, la imagen se queda sin pareja,
 * y su salto se arrastra hasta la prosa de detras y parte el capitulo por la
 * mitad. Se midio con `manuscrito-con-lamina.docx`.
 */
export const SOLO_IMAGEN = '\u0000imagen'

export interface ParrafoDocx {
  /** Texto plano del parrafo, o `SOLO_IMAGEN` si solo lleva un dibujo. */
  readonly texto: string
  /** Empieza pagina nueva en este parrafo. */
  readonly saltoAntes: boolean
}

interface Hechos {
  texto: string
  tieneImagen: boolean
  /** Hay un salto y no queda texto detras: el salto cae al final del parrafo. */
  saltoAlFinal: boolean
  /** Se vio un salto cuando el parrafo aun no tenia texto. */
  saltoAntesDelTexto: boolean
}

const esW = (el: Element, nombre: string): boolean =>
  el.namespaceURI === NS_W && el.localName === nombre

/**
 * Recorre un `w:p` acumulando lo que importa.
 *
 * No desciende a los `w:p` anidados (un parrafo dentro de un cuadro de texto es
 * otro parrafo, y aparece por su cuenta en la lista).
 */
function hechosDe(p: Element): Hechos {
  const h: Hechos = {
    texto: '',
    tieneImagen: false,
    saltoAlFinal: false,
    saltoAntesDelTexto: false,
  }

  const recorrer = (nodo: Element): void => {
    for (const hijo of Array.from(nodo.children)) {
      if (esW(hijo, 'p')) continue
      // `w:delText` es texto borrado con control de cambios: mammoth no lo
      // emite, asi que aqui tampoco, o la alineacion se desajustaria.
      if (esW(hijo, 't')) {
        h.texto += hijo.textContent ?? ''
        if (h.saltoAlFinal) h.saltoAlFinal = false
        continue
      }
      if (esW(hijo, 'br') && hijo.getAttributeNS(NS_W, 'type') === 'page') {
        if (h.texto === '') h.saltoAntesDelTexto = true
        h.saltoAlFinal = true
        continue
      }
      // Lo que mammoth convierte en un caracter: si aqui no contara, el
      // parrafo no se reconoceria por el otro lado.
      if (esW(hijo, 'noBreakHyphen')) {
        h.texto += '\u2011'
        continue
      }
      if (esW(hijo, 'softHyphen')) {
        h.texto += '\u00ad'
        continue
      }
      if (esW(hijo, 'drawing') || esW(hijo, 'pict') || esW(hijo, 'object')) {
        h.tieneImagen = true
        continue
      }
      recorrer(hijo)
    }
  }
  recorrer(p)
  return h
}

/** `<w:pPr><w:pageBreakBefore/>`, que es lo que trae el estilo «Titulo 1». */
function saltoPorEstilo(p: Element): boolean {
  for (const hijo of Array.from(p.children)) {
    if (!esW(hijo, 'pPr')) continue
    for (const prop of Array.from(hijo.children)) {
      if (!esW(prop, 'pageBreakBefore')) continue
      const val = prop.getAttributeNS(NS_W, 'val')
      return val !== '0' && val !== 'false'
    }
  }
  return false
}

/**
 * Los parrafos de un `.docx` con la marca de donde empieza pagina nueva.
 *
 * Devuelve `null` si el archivo no se puede leer: la importacion sigue sin esta
 * señal, que es mucho mejor que fallar.
 */
export function parrafosDeDocx(bytes: Uint8Array): ParrafoDocx[] | null {
  let xml: string
  try {
    const dentro = unzipSync(bytes, { filter: (f) => f.name === DOCUMENTO })
    const crudo = dentro[DOCUMENTO]
    if (!crudo) return null
    xml = new TextDecoder('utf-8').decode(crudo)
  } catch {
    return null
  }

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml')
  } catch {
    return null
  }
  // DOMParser no lanza con XML mal formado: devuelve un documento con un
  // <parsererror> dentro, y hay que mirarlo a mano.
  if (doc.getElementsByTagName('parsererror').length > 0) return null

  const salida: ParrafoDocx[] = []
  let pendiente = false
  for (const p of Array.from(doc.getElementsByTagNameNS(NS_W, 'p'))) {
    const h = hechosDe(p)
    // `saltoAntes` significa «aqui empieza el contenido de la pagina nueva», y
    // un parrafo vacio no es contenido: un parrafo que es SOLO el salto no se
    // marca a si mismo, pasa la marca al siguiente con `pendiente`. Sin esa
    // distincion la marca salia dos veces y la segunda caia en el parrafo
    // equivocado cuando el siguiente era una lamina.
    salida.push({
      texto: h.texto === '' && h.tieneImagen ? SOLO_IMAGEN : h.texto,
      saltoAntes:
        pendiente || (h.saltoAntesDelTexto && h.texto !== '') || saltoPorEstilo(p),
    })
    pendiente = h.saltoAlFinal
  }
  return salida
}

/**
 * Sin espacio en blanco ninguno, para comparar los dos lados. El espacio es lo
 * que mas cambia entre el XML y el HTML (un tabulador de Word, un salto de
 * linea suelto que en el HTML parte el parrafo, un espacio que el modelo
 * recorta), y nunca distingue un parrafo de otro.
 */
function normalizar(s: string): string {
  return s === SOLO_IMAGEN ? s : s.replace(/\s+/gu, '')
}

/**
 * Empareja los parrafos del `.docx` con los del HTML de mammoth.
 *
 * Son la misma secuencia vista dos veces, y la unica diferencia esperada es que
 * mammoth descarta los parrafos vacios. Aun asi la alineacion se repara sola
 * mirando una posicion adelante en cada lado: si nuestro modelo de lo que hace
 * mammoth se queda corto con algun documento, el desajuste afecta a un parrafo
 * y no arrastra al resto. Un parrafo sin pareja devuelve `null`.
 */
export function alinear(
  docx: readonly { readonly texto: string }[],
  html: readonly { readonly texto: string }[],
): (number | null)[] {
  const nd = docx.map((p) => normalizar(p.texto))
  const nh = html.map((p) => normalizar(p.texto))
  const salida: (number | null)[] = docx.map(() => null)

  let i = 0
  let j = 0
  while (i < docx.length && j < html.length) {
    if (nd[i] === nh[j]) {
      salida[i] = j
      i += 1
      j += 1
    } else if (nd[i] === '') {
      i += 1
    } else if (nh[j] === '') {
      j += 1
    } else if (j + 1 < html.length && nd[i] === nh[j + 1]) {
      j += 1
    } else if (i + 1 < docx.length && nd[i + 1] === nh[j]) {
      i += 1
    } else {
      i += 1
      j += 1
    }
  }
  return salida
}
