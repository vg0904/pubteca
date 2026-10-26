/**
 * Las imagenes que recibe cada tienda.
 *
 * Apple Books no cobra por el tamano del archivo y admite hasta 2 GB, asi que
 * alli van las imagenes TAL CUAL las subio el autor: no hay nada que decidir y
 * no se toca un solo byte. Amazon cobra la entrega por MB sobre la regalia del
 * 70 %, asi que a Kindle se le puede mandar una version mas ligera.
 *
 * Por que esto vive aqui y no en el cuadro de ajustar una imagen: comprimir
 * para Kindle es una decision de ENTREGA y vale igual para las treinta
 * ilustraciones del libro. Configurarlas una por una seria treinta veces el
 * mismo gesto, y lo que el autor quiere decidir imagen por imagen es otra cosa
 * (que trozo se ve, a que resolucion), que es justo lo que si esta en
 * `imagen-ajuste.ts`.
 *
 * El motor NO sabe de esto: construye los dos EPUB de un solo proyecto. Para
 * que las dos tiendas lleven imagenes distintas se le pide dos veces, cada vez
 * con los bytes de una (ver `generar.ts`). Asi el core se queda intacto, con
 * sus golden tests y su frontera, y la diferencia entre tiendas se decide donde
 * se puede probar.
 *
 * Aqui esta lo que se DECIDE, sin navegador: que imagenes, con que ajuste y
 * sobre que muestra se estima el peso. Codificar lo hace quien llame, que es
 * el unico que necesita un lienzo.
 */
import { tamanoPorResolucion, type Ajuste, type KindlePropio } from './imagen-ajuste'
import { ENTREGA_KINDLE_POR_DEFECTO, type EntregaKindle, type Imagen, type Proyecto } from './modelo'

/** Lo que el libro tenga guardado, o el valor por defecto. */
export function entregaKindle(p: Proyecto): EntregaKindle {
  return p.kindle ?? ENTREGA_KINDLE_POR_DEFECTO
}

/**
 * Los ids de las imagenes que de verdad entran al EPUB de Kindle.
 *
 * Se arma por lo que SI entra, no quitando lo que no.
 *
 * El primer intento lo hacia al reves — todas las del proyecto menos la
 * portada y los logos, salvo que se usaran en otro sitio — y se le colaba un
 * caso: la misma imagen puesta como logo Y como version blanca se tapaba a si
 * misma, porque al mirar el logo «se usa en el logo blanco» y al mirar el logo
 * blanco «se usa en el logo». Se quedaba dentro, y se comprimia una imagen que
 * Kindle no recibe. Enumerar lo que entra no tiene esa trampa.
 *
 * Lo que entra: las ilustraciones de los capitulos y de las paginas extra, las
 * que abren capitulo, las laminas a color y la CONTRAPORTADA. Lo que no: la
 * portada (KDP la pide aparte al subir el libro, y ese campo no acepta ni un
 * EPUB) y el logo con su version blanca (en Kindle el titulo va en texto).
 *
 * La contraportada entra aunque el autor la tenga desmarcada ahora mismo: la
 * casilla se cambia de un clic, y comprimir algo que al final no viaja solo
 * cuesta un momento, mientras que no comprimir lo que si viaja se nota en la
 * tarifa.
 */
export function idsParaKindle(p: Proyecto): Set<string> {
  const ids = new Set<string>(p.laminas)
  if (p.portada.contraportada !== undefined) ids.add(p.portada.contraportada)
  for (const c of p.capitulos) {
    for (const a of c.aperturas) ids.add(a.imagenId)
    for (const b of c.bloques) if (b.tipo === 'ilustracion') ids.add(b.imagenId)
  }
  for (const x of p.extras) {
    for (const b of x.bloques) if (b.tipo === 'ilustracion') ids.add(b.imagenId)
  }
  return ids
}

/** El ajuste propio de una imagen, si el autor le dio uno. */
export function kindlePropioDe(p: Proyecto, id: string): KindlePropio | undefined {
  return p.kindlePorImagen?.[id]
}

/** Las imagenes de Kindle con ajuste propio, de entre las que de verdad viajan. */
export function conAjustePropio(p: Proyecto): string[] {
  const propios = p.kindlePorImagen
  if (!propios) return []
  return [...idsParaKindle(p)].filter((id) => propios[id] !== undefined)
}

/**
 * El ajuste que se le aplica a una imagen para Kindle.
 *
 * El recorte no se toca: que trozo del dibujo se ve es decision de autor y es
 * UNA sola para las dos tiendas. Lo que si puede cambiar por tienda es cuanto
 * pesa, asi que de `propio` salen la calidad, el gris y el lado largo.
 *
 * `ladoLargo` 0 (o sin ajuste propio) deja el tamaño tal cual: el autor tiene
 * que pedir expresamente que Kindle lleve la imagen mas pequeña.
 */
export function ajusteKindle(imagen: Imagen, k: EntregaKindle, propio?: KindlePropio): Ajuste {
  const entero = { x: 0, y: 0, ancho: imagen.ancho, alto: imagen.alto }
  const medidas =
    propio && propio.ladoLargo > 0 && propio.ladoLargo < Math.max(imagen.ancho, imagen.alto)
      ? tamanoPorResolucion(entero, propio.ladoLargo)
      : { ancho: imagen.ancho, alto: imagen.alto }
  return {
    recorte: entero,
    ancho: medidas.ancho,
    alto: medidas.alto,
    formato: 'jpeg',
    calidad: propio?.calidad ?? k.calidad,
    grises: propio?.grises ?? k.grises,
    // JPEG nunca lleva alfa: lo transparente se aplana sobre blanco, que es
    // lo que Kindle hace de todos modos.
    conservarAlfa: false,
  }
}

/** Lo que devuelve quien codifica: ya con las medidas que salieron de verdad. */
export interface Codificada {
  readonly bytes: Uint8Array
  readonly ancho: number
  readonly alto: number
  readonly tipo: 'png' | 'jpeg'
}

export type Codificador = (origen: Uint8Array, imagen: Imagen, ajuste: Ajuste) => Promise<Codificada>

export interface ParaTienda {
  readonly bytes: ReadonlyMap<string, Uint8Array>
  readonly imagenes: ReadonlyMap<string, Imagen>
  /** Cuantas se comprimieron y cuanto se ahorro, para decirlo. */
  readonly antes: number
  readonly ahora: number
}

/**
 * Los bytes y los metadatos que recibe Kindle.
 *
 * Si una imagen no se puede codificar, se queda la original: mas vale un libro
 * un poco mas gordo que un libro al que le falta un dibujo. Y las que Kindle no
 * recibe se dejan tal cual, porque el proyecto que se le pasa al motor es el
 * mismo para los dos y tiene que seguir completo.
 */
export async function paraKindle(
  p: Proyecto,
  imagenes: ReadonlyMap<string, Imagen>,
  bytes: ReadonlyMap<string, Uint8Array>,
  k: EntregaKindle,
  codificar: Codificador,
): Promise<ParaTienda> {
  const salidaBytes = new Map(bytes)
  const salidaImagenes = new Map(imagenes)
  let antes = 0
  let ahora = 0
  const propios = p.kindlePorImagen ?? {}
  // Con el general apagado solo se tocan las que el autor marco una por una:
  // entrar a una imagen y darle un ajuste propio ES pedirlo.
  const aTocar = [...idsParaKindle(p)].filter((id) => k.comprimir || propios[id] !== undefined)
  if (aTocar.length === 0) return { bytes: salidaBytes, imagenes: salidaImagenes, antes: 0, ahora: 0 }

  for (const id of aTocar) {
    const imagen = imagenes.get(id)
    const origen = bytes.get(id)
    if (!imagen || !origen) continue
    antes += origen.length
    try {
      const c = await codificar(origen, imagen, ajusteKindle(imagen, k, propios[id]))
      // Si al comprimir sale MAS grande (pasa con un dibujo de linea plana, que
      // el PNG guarda mejor que el JPEG), se queda el original: el autor pidio
      // un libro mas ligero, no un libro distinto.
      if (c.bytes.length >= origen.length) {
        ahora += origen.length
        continue
      }
      salidaBytes.set(id, c.bytes)
      salidaImagenes.set(id, {
        ...imagen,
        tipo: c.tipo,
        bytes: c.bytes.length,
        ancho: c.ancho,
        alto: c.alto,
        // El JPEG no guarda transparencia y el lienzo deja la imagen en sRGB,
        // asi que estas tres banderas dejan de ser verdad para esta copia.
        alfa: false,
        cmyk: false,
        p3: false,
      })
      ahora += c.bytes.length
    } catch {
      ahora += origen.length
    }
  }
  return { bytes: salidaBytes, imagenes: salidaImagenes, antes, ahora }
}

// ---------------------------------------------------------------------------
// Prediccion del peso
// ---------------------------------------------------------------------------

/**
 * Las imagenes sobre las que se mide, de mas grande a mas pequena.
 *
 * Se mide en vez de estimar con una tabla porque los bytes por pixel de un
 * JPEG dependen del DIBUJO, no de la calidad nada mas: una acuarela comprime
 * fatal y una linea plana comprime muchisimo, y entre las dos hay un factor de
 * cinco. Con una tabla fija, el numero que ve el autor puede estar al doble del
 * real. Codificando dos o tres de SUS imagenes, el numero es de su libro.
 *
 * Se eligen las mas grandes porque son las que deciden el total.
 */
export function muestrasPara(imagenes: readonly Imagen[], cuantas = 3): Imagen[] {
  return [...imagenes].sort((a, b) => b.ancho * b.alto - a.ancho * a.alto).slice(0, Math.max(0, cuantas))
}

/** Las imagenes de Kindle, con sus metadatos, en el orden del proyecto. */
export function imagenesDeKindle(p: Proyecto, imagenes: ReadonlyMap<string, Imagen>): Imagen[] {
  return [...idsParaKindle(p)].flatMap((id) => {
    const i = imagenes.get(id)
    return i ? [i] : []
  })
}
