/**
 * Ajustar UNA imagen: que trozo se ve y a que tamano sale.
 *
 * Es la parte del ajuste que no necesita navegador, asi que vive aqui y se
 * prueba en node. El lienzo solo decodifica y vuelve a codificar; TODO lo que
 * se decide (el encuadre, el tamano que se recomienda, el peso que va a tener)
 * esta en funciones puras, igual que en `subir.ts` con el logo blanco.
 *
 * Por que hace falta: la queja real del autor es que una imagen de Procreate
 * llega a 4000 x 4000 px y 12 MB, y el aviso de «redúcela» le manda a otro
 * programa. Esto lo hace aqui. Y las PROPORCIONES no son un capricho: una
 * ilustracion que no es 2:3 sale con franjas vacias en la pantalla del lector,
 * que es alta y estrecha, pero 2:3 no vale para todo (un mapa es horizontal),
 * asi que se ofrecen varias y se recomienda una.
 */
import { MAX_PIXELES, MIN_ALTO, MIN_ANCHO } from '../core/imagen-validacion'
import type { ClaveGrupo } from './avisos'

/**
 * Las proporciones que se ofrecen.
 *
 * `original` conserva la de la imagen; el resto se nombran ancho:alto.
 *
 * NO hay un encuadre «a mano» con tiradores: el marco se elige con una
 * proporcion y un zoom, y se arrastra para moverlo. Con tiradores el autor
 * puede dejar una proporcion cualquiera sin darse cuenta, que es justo el
 * problema que esto viene a resolver.
 */
export type ClaveAspecto = '2:3' | '3:4' | '1:1' | '3:2' | '4:3' | 'original'

export const ASPECTOS: readonly ClaveAspecto[] = ['2:3', '3:4', '1:1', '3:2', '4:3', 'original']

/** La que se recomienda: es la que mejor cabe en la pantalla de un lector. */
export const ASPECTO_RECOMENDADO: ClaveAspecto = '2:3'

const RAZONES: Readonly<Partial<Record<ClaveAspecto, number>>> = {
  '2:3': 2 / 3,
  '3:4': 3 / 4,
  '1:1': 1,
  '3:2': 3 / 2,
  '4:3': 4 / 3,
}

/**
 * Ancho / alto de una proporcion, o `null` si no fija ninguna.
 *
 * `original` necesita las medidas de la imagen; `libre` no fija nada.
 */
export function razonDe(clave: ClaveAspecto, ancho: number, alto: number): number | null {
  if (clave === 'original') return alto > 0 ? ancho / alto : null
  return RAZONES[clave] ?? null
}

/**
 * Los avisos que ESTE cuadro puede arreglar de verdad.
 *
 * La lista es corta a proposito. Pasar una imagen por el lienzo la reduce
 * (`pixeles`, `peso`), la recorta a otra proporcion (`proporcion`,
 * `horizontal`), la aplana sobre blanco si sale en JPEG (`transparencia`) y la
 * deja en sRGB, porque el lienzo descarta el perfil al decodificar (`p3`,
 * `cmyk`).
 *
 * Lo que NO esta aqui es lo que el cuadro no puede arreglar aunque lo parezca:
 * una imagen pequena (`resolucion`, `portadaLadoCorto`, `portadaBaja`) no se
 * arregla agrandandola — no hay detalle que inventar, solo se emborrona —, y
 * un logo con el fondo pintado (`logoOpaco`) no recupera la transparencia.
 * Ofrecer «Arreglar» ahi seria mentirle al autor.
 */
export const ARREGLABLES: readonly ClaveGrupo[] = [
  'pixeles',
  'peso',
  'proporcion',
  'horizontal',
  'transparencia',
  'p3',
  'cmyk',
]

export const arreglable = (clave: ClaveGrupo): boolean => ARREGLABLES.includes(clave)

export type Formato = 'png' | 'jpeg'

/** Un trozo de la imagen, en pixeles de la imagen original. */
export interface Recorte {
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

/** El recorte que lo coge todo. */
export function recorteCompleto(ancho: number, alto: number): Recorte {
  return { x: 0, y: 0, ancho, alto }
}

/**
 * El recorte mas grande con esa proporcion, centrado.
 *
 * Centrado y no arriba porque en una ilustracion de libro lo que importa esta
 * casi siempre en el medio; el autor lo mueve si no.
 */
export function recorteCentrado(ancho: number, alto: number, clave: ClaveAspecto): Recorte {
  const razon = razonDe(clave, ancho, alto)
  if (razon === null || ancho <= 0 || alto <= 0) return recorteCompleto(ancho, alto)
  // El lado que sobra es el que se recorta.
  let w = ancho
  let h = Math.round(ancho / razon)
  if (h > alto) {
    h = alto
    w = Math.round(alto * razon)
  }
  return {
    x: Math.round((ancho - w) / 2),
    y: Math.round((alto - h) / 2),
    ancho: Math.min(w, ancho),
    alto: Math.min(h, alto),
  }
}

/** El centro de un recorte, en pixeles de la imagen. */
export function centroDe(r: Recorte): { x: number; y: number } {
  return { x: r.x + r.ancho / 2, y: r.y + r.alto / 2 }
}

/** Cuanto se puede acercar el marco. 1 es «lo mas grande que cabe». */
export const ZOOM_MINIMO = 1
export const ZOOM_MAXIMO = 4

/**
 * El marco: la proporcion elegida, al zoom pedido y alrededor de ese centro.
 *
 * Es lo que se recalcula cada vez que el autor cambia de proporcion o mueve el
 * zoom, y conserva el centro a proposito: si ya habia encuadrado la cara del
 * personaje, cambiar de 2:3 a 3:4 no se la quita de en medio.
 */
export function recorteDesde(
  ancho: number,
  alto: number,
  clave: ClaveAspecto,
  zoom: number,
  centro: { x: number; y: number },
): Recorte {
  const base = recorteCentrado(ancho, alto, clave)
  const z = Math.max(ZOOM_MINIMO, Math.min(ZOOM_MAXIMO, zoom))
  const w = Math.max(1, Math.min(ancho, Math.round(base.ancho / z)))
  const h = Math.max(1, Math.min(alto, Math.round(base.alto / z)))
  return {
    x: Math.max(0, Math.min(ancho - w, Math.round(centro.x - w / 2))),
    y: Math.max(0, Math.min(alto - h, Math.round(centro.y - h / 2))),
    ancho: w,
    alto: h,
  }
}

/** Mueve el recorte sin dejarlo salir de la imagen. */
export function moverRecorte(r: Recorte, dx: number, dy: number, ancho: number, alto: number): Recorte {
  return {
    ...r,
    x: Math.max(0, Math.min(ancho - r.ancho, Math.round(r.x + dx))),
    y: Math.max(0, Math.min(alto - r.alto, Math.round(r.y + dy))),
  }
}

/**
 * Escala unas medidas para que no pasen de `maxPixeles`, conservando la
 * proporcion. Nunca sube de tamano.
 */
export function limitarPixeles(
  ancho: number,
  alto: number,
  maxPixeles: number = MAX_PIXELES,
): { ancho: number; alto: number } {
  if (ancho <= 0 || alto <= 0) return { ancho: 0, alto: 0 }
  const pixeles = ancho * alto
  if (pixeles <= maxPixeles) return { ancho, alto }
  const factor = Math.sqrt(maxPixeles / pixeles)
  // Se redondea hacia abajo: con `round` el resultado puede volver a pasarse.
  return { ancho: Math.max(1, Math.floor(ancho * factor)), alto: Math.max(1, Math.floor(alto * factor)) }
}

/** El lado largo al que se apunta: 2400 px es 1600x2400 en 2:3, lo recomendado. */
export const LADO_LARGO_RECOMENDADO = 2400

/**
 * El tamano que se propone para un recorte.
 *
 * La regla es: el lado largo a 2400 px (de ahi sale el 1600 x 2400 que
 * recomienda `imagen-validacion`), NUNCA agrandando mas alla del trozo
 * encuadrado (agrandar no anade detalle, solo peso y borrosidad), y luego por
 * debajo del tope de Apple Books. El tope muerde de verdad: una imagen
 * cuadrada a 2400 x 2400 son 5,76 millones de pixeles y Apple admite 5,6.
 */
export function tamanoRecomendado(r: Recorte): { ancho: number; alto: number } {
  if (r.ancho <= 0 || r.alto <= 0) return { ancho: 0, alto: 0 }
  const largo = Math.max(r.ancho, r.alto)
  const factor = Math.min(1, LADO_LARGO_RECOMENDADO / largo)
  return limitarPixeles(Math.max(1, Math.round(r.ancho * factor)), Math.max(1, Math.round(r.alto * factor)))
}

/** Las medidas con la proporcion del recorte, dado uno de los dos lados. */
export function conProporcion(r: Recorte, lado: 'ancho' | 'alto', valor: number): { ancho: number; alto: number } {
  const v = Math.max(1, Math.round(valor))
  if (r.ancho <= 0 || r.alto <= 0) return { ancho: v, alto: v }
  return lado === 'ancho'
    ? { ancho: v, alto: Math.max(1, Math.round((v * r.alto) / r.ancho)) }
    : { ancho: Math.max(1, Math.round((v * r.ancho) / r.alto)), alto: v }
}

/** Lo que el autor pide: que trozo, a que tamano y en que formato. */
export interface Ajuste {
  readonly recorte: Recorte
  readonly ancho: number
  readonly alto: number
  readonly formato: Formato
  /** 1..100. Solo cuenta en JPEG. */
  readonly calidad: number
  readonly grises: boolean
  /** Si la imagen que sale lleva canal alfa. Ver `necesitaAlfa`. */
  readonly conservarAlfa: boolean
}

/**
 * Si la imagen que sale tiene que llevar canal alfa.
 *
 * Importa mas de lo que parece. Un lienzo normal escribe SIEMPRE un PNG RGBA,
 * aunque no haya un solo pixel transparente, y el motor avisa de transparencia
 * mirando el tipo de color del PNG, no sus pixeles. Resultado: ajustar una
 * ilustracion opaca para quitarle el aviso de «demasiado grande» le ponia
 * encima un aviso de «tiene transparencia» que era mentira. Pidiendole al
 * lienzo un contexto opaco, el PNG sale RGB — y encima pesa menos.
 *
 * Se decide por el canal del ORIGINAL, no por sus pixeles: un PNG sin canal
 * alfa no puede tener transparencia, y uno que lo tiene se respeta sin mirar,
 * porque equivocarse hacia ese lado aplanaria el logo de un autor contra un
 * fondo blanco. Un JPEG nunca lleva alfa.
 */
export function necesitaAlfa(formato: Formato, origenConAlfa: boolean): boolean {
  return formato === 'png' && origenConAlfa
}

/**
 * Si el ajuste deja la imagen tal como estaba. Evita gastar una imagen nueva
 * (y un paso de deshacer) en no hacer nada.
 */
export function sinCambios(a: Ajuste, imagen: { ancho: number; alto: number; tipo: Formato }): boolean {
  return (
    a.recorte.x === 0 &&
    a.recorte.y === 0 &&
    a.recorte.ancho === imagen.ancho &&
    a.recorte.alto === imagen.alto &&
    a.ancho === imagen.ancho &&
    a.alto === imagen.alto &&
    a.formato === imagen.tipo &&
    !a.grises
  )
}

/** Lo que hay que decirle al autor antes de aplicar, o null si no hay nada. */
export type ReparoAjuste = 'subira' | 'tope'

export function reparoDe(a: Ajuste): ReparoAjuste | null {
  if (a.ancho * a.alto > MAX_PIXELES) return 'tope'
  // Pedir mas pixeles de los que tiene el trozo encuadrado solo lo emborrona.
  if (a.ancho > a.recorte.ancho || a.alto > a.recorte.alto) return 'subira'
  return null
}

/**
 * El nombre de una imagen ajustada: el del autor, con la extension del formato
 * que sale. Lo lee en la lista de imagenes afectadas de un aviso y en la copia
 * (.zip), asi que tiene que reconocerlo.
 */
export function conSufijo(nombre: string, tipo: Formato): string {
  const base = nombre.replace(/\.(png|jpe?g)$/iu, '')
  return `${base}${tipo === 'png' ? '.png' : '.jpg'}`
}

/** Si el tamano se queda por debajo de lo que se recomienda para una ilustracion. */
export function quedaCorta(ancho: number, alto: number): boolean {
  return ancho < MIN_ANCHO || alto < MIN_ALTO
}

// ---------------------------------------------------------------------------
// Prediccion del peso
// ---------------------------------------------------------------------------

/**
 * Bytes por pixel tipicos. Son una ESTIMACION y se usan solo mientras no haya
 * una medida de verdad: en cuanto se codifica una imagen, `bppMedido` da el
 * numero real de ESTE libro, que depende mucho del dibujo (una acuarela
 * comprime fatal, una linea plana comprime mucho).
 */
export function bppJpeg(calidad: number, grises: boolean): number {
  const q = Math.max(1, Math.min(100, calidad))
  // Crece casi exponencialmente con la calidad: de 0,09 B/px a 40 a 0,55 a 95.
  const bpp = 0.045 * Math.exp(0.0255 * q)
  return grises ? bpp * 0.62 : bpp
}

export function bppPng(grises: boolean): number {
  return grises ? 0.75 : 1.5
}

/** Los bytes por pixel que salieron de verdad, o null sin muestras utiles. */
export function bppMedido(muestras: readonly { bytes: number; pixeles: number }[]): number | null {
  const utiles = muestras.filter((m) => m.pixeles > 0 && m.bytes > 0)
  if (utiles.length === 0) return null
  const bytes = utiles.reduce((n, m) => n + m.bytes, 0)
  const pixeles = utiles.reduce((n, m) => n + m.pixeles, 0)
  return bytes / pixeles
}

/**
 * Lo que van a pesar unas imagenes de ese tamano, en bytes.
 *
 * Es lo que la pantalla de descarga ensena al mover el deslizador: se suman
 * los pixeles de todas y se aplica el mismo bytes/pixel, medido sobre una
 * muestra de este mismo libro.
 *
 * Esto NO sirve para una imagen sola. Una tabla de bytes por pixel se equivoca
 * por mucho con un dibujo concreto, asi que el cuadro de ajustar una imagen la
 * codifica de verdad y mira sus bytes: ahi es una, y cuesta poco.
 */
export function pesoTotalEstimado(
  imagenes: readonly { readonly ancho: number; readonly alto: number }[],
  bpp: number,
): number {
  const pixeles = imagenes.reduce((n, i) => n + Math.max(0, i.ancho) * Math.max(0, i.alto), 0)
  return Math.max(0, Math.round(pixeles * bpp))
}
