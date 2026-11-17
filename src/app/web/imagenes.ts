/**
 * Las imagenes que recibe la web.
 *
 * Es la misma idea que la entrega a Kindle (`entrega.ts`), con otro motivo. A
 * Kindle se le aligeran porque Amazon cobra por MB; a la web, porque cada
 * visitante se las baja con su conexion, muchas veces la de un telefono. Una
 * ilustracion de Procreate a 4000 px y 6 MB se ve igual en una columna de
 * texto que a 1600 px y 300 kB, y carga veinte veces antes.
 *
 * Aqui se DECIDE, sin navegador. Codificar lo hace quien llame, con su lienzo.
 */
import type { ConfigWeb } from '../../core/web/config'
import type { Codificador, ParaTienda } from '../entrega'
import { conProporcion, ladoLargo, type Ajuste } from '../imagen-ajuste'
import type { Imagen, Proyecto } from '../modelo'

/**
 * El lado largo con el que una imagen llega a la web. La columna de texto mide
 * unos 600 px; con 1600 sobra para una pantalla de doble densidad y para la
 * portada a lo ancho.
 */
export const LADO_LARGO_WEB = 1600
export const CALIDAD_WEB = 82

/**
 * Lo que se le hace a una imagen para la web, o null si se queda como esta.
 *
 *   - Una imagen con transparencia sigue en PNG y con su transparencia: el
 *     lector tiene tema oscuro, y aplanarla sobre blanco le pondria un
 *     recuadro. Solo se encoge.
 *   - Un JPEG que ya cabe se deja: volver a comprimirlo lo estropea un poco
 *     para no ganar casi nada.
 *   - Todo lo demas va a JPEG, encogido si se pasa.
 */
export function ajusteWeb(imagen: Imagen): Ajuste | null {
  const entero = { x: 0, y: 0, ancho: imagen.ancho, alto: imagen.alto }
  const grande = ladoLargo(imagen.ancho, imagen.alto) > LADO_LARGO_WEB
  if (!grande && (imagen.alfa || imagen.tipo === 'jpeg')) return null
  const medidas = grande ? conProporcion(entero, imagen.ancho >= imagen.alto ? 'ancho' : 'alto', LADO_LARGO_WEB) : { ancho: imagen.ancho, alto: imagen.alto }
  return {
    recorte: entero,
    ancho: medidas.ancho,
    alto: medidas.alto,
    formato: imagen.alfa ? 'png' : 'jpeg',
    calidad: CALIDAD_WEB,
    grises: false,
    conservarAlfa: imagen.alfa === true,
  }
}

/**
 * Las imagenes que el libro web enseña: la portada, la contraportada, las
 * laminas y las ilustraciones de lo que SI se publica. Ni el logo ni el sello
 * (no salen), ni los dibujos de un capitulo que se queda fuera: codificarlos
 * seria esperar por algo que no viaja.
 */
export function idsParaLaWeb(p: Proyecto, c: ConfigWeb): Set<string> {
  const fuera = new Set(c.omitidos)
  const ids = new Set<string>(p.laminas)
  for (const rol of ['portada', 'contraportada'] as const) {
    const id = p.portada[rol]
    if (id !== undefined) ids.add(id)
  }
  for (const cap of p.capitulos) {
    if (fuera.has(cap.id)) continue
    for (const a of cap.aperturas) ids.add(a.imagenId)
    for (const b of cap.bloques) if (b.tipo === 'ilustracion') ids.add(b.imagenId)
  }
  for (const x of p.extras) {
    if (fuera.has(x.id)) continue
    for (const b of x.bloques) if (b.tipo === 'ilustracion') ids.add(b.imagenId)
  }
  return ids
}

/**
 * Los bytes y los metadatos que recibe la web.
 *
 * Como en Kindle: si una imagen no se puede codificar, o al codificarla sale
 * mas gorda, se queda la original. Mas vale un libro un poco mas pesado que
 * uno al que le falta un dibujo.
 */
export async function paraLaWeb(
  p: Proyecto,
  c: ConfigWeb,
  imagenes: ReadonlyMap<string, Imagen>,
  bytes: ReadonlyMap<string, Uint8Array>,
  codificar: Codificador,
): Promise<ParaTienda> {
  const salidaBytes = new Map(bytes)
  const salidaImagenes = new Map(imagenes)
  let antes = 0
  let ahora = 0
  for (const id of idsParaLaWeb(p, c)) {
    const imagen = imagenes.get(id)
    const origen = bytes.get(id)
    if (!imagen || !origen) continue
    antes += origen.length
    const ajuste = ajusteWeb(imagen)
    if (!ajuste) {
      ahora += origen.length
      continue
    }
    try {
      const hecha = await codificar(origen, imagen, ajuste)
      if (hecha.bytes.length >= origen.length) {
        ahora += origen.length
        continue
      }
      salidaBytes.set(id, hecha.bytes)
      salidaImagenes.set(id, {
        ...imagen,
        tipo: hecha.tipo,
        bytes: hecha.bytes.length,
        ancho: hecha.ancho,
        alto: hecha.alto,
        // El lienzo deja la imagen en sRGB; la transparencia solo sigue si se pidio.
        alfa: ajuste.conservarAlfa,
        cmyk: false,
        p3: false,
      })
      ahora += hecha.bytes.length
    } catch {
      ahora += origen.length
    }
  }
  return { bytes: salidaBytes, imagenes: salidaImagenes, antes, ahora }
}
