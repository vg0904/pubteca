/**
 * El lienzo: recortar, redimensionar, pasar a grises y volver a codificar.
 *
 * Es lo UNICO que toca el navegador en todo el ajuste de imagenes. Lo que se
 * decide esta en `imagen-ajuste.ts`, en funciones puras con sus tests; aqui
 * solo se decodifica, se dibuja y se codifica.
 *
 * Tres cosas que no son obvias y que dan fallos silenciosos:
 *
 *  1. **JPEG no tiene transparencia, y cada navegador decide sola que hacer
 *     con ella.** Chrome compone lo transparente sobre NEGRO: un logo o una
 *     ilustracion con fondo transparente saldria sobre un rectangulo negro.
 *     Asi que el lienzo se pide OPACO y se pinta de blanco antes de dibujar
 *     siempre que la salida no lleve alfa. Blanco es ademas lo que hace Kindle
 *     con la transparencia, asi que es lo que el autor va a ver en su lector.
 *     Un lienzo opaco tiene ademas otra ventaja: su PNG sale RGB en vez de
 *     RGBA, y asi ajustar una imagen opaca no le inventa un canal alfa que el
 *     motor leeria como transparencia (ver `necesitaAlfa`).
 *  2. **Reducir de golpe a menos de la mitad produce dientes de sierra**,
 *     porque el navegador muestrea sin promediar lo que descarta. Se baja a la
 *     mitad por pasos hasta estar cerca del tamano pedido.
 *  3. **El perfil ICC se pierde en cuanto la imagen entra al lienzo**: aqui ya
 *     da igual (la inspeccion de bytes ya se hizo al subirla, ver `subir.ts`),
 *     pero significa que una imagen ajustada sale en sRGB. Eso ARREGLA el
 *     aviso de Display P3 en vez de romperlo.
 */
import type { Ajuste, Recorte } from './imagen-ajuste'

/** Debajo de esto, reducir de una vez deja dientes de sierra: se baja por pasos. */
const PASO_MAXIMO = 2

/**
 * El mismo dibujo en grises, con la luminancia de la recomendacion BT.709.
 *
 * Es la que usan los navegadores en `filter: grayscale(1)`, pero `ctx.filter`
 * no esta en todas partes (ni en los Safari que esta app soporta), y ademas
 * una funcion pura se puede probar. Se conserva el alfa: una ilustracion con
 * transparencia sigue teniendola si sale en PNG.
 */
export function aGrises(rgba: ArrayLike<number>): Uint8ClampedArray<ArrayBuffer> {
  const salida = new Uint8ClampedArray(rgba.length)
  salida.set(rgba)
  for (let i = 0; i < salida.length; i += 4) {
    const g = Math.round(
      0.2126 * (salida[i] as number) + 0.7152 * (salida[i + 1] as number) + 0.0722 * (salida[i + 2] as number),
    )
    salida[i] = g
    salida[i + 1] = g
    salida[i + 2] = g
  }
  return salida
}

export interface Medidas {
  readonly ancho: number
  readonly alto: number
}

/**
 * Los tamanos por los que se pasa para llegar del recorte al tamano pedido.
 *
 * Siempre hay al menos un escalon (el propio tamano pedido): ese paso es el
 * que aplica el recorte. Si hay que reducir a menos de la mitad, se anaden
 * escalones intermedios de forma que cada uno reduzca por el MISMO factor, y
 * ninguno pase de 2x. El ultimo escalon es exacto: la proporcion que se pidio
 * es la que sale, sin arrastrar redondeos.
 */
export function escalones(desde: Medidas, hasta: Medidas): Medidas[] {
  const fin = { ancho: Math.max(1, Math.round(hasta.ancho)), alto: Math.max(1, Math.round(hasta.alto)) }
  const factor = Math.max(desde.ancho / fin.ancho, desde.alto / fin.alto)
  const cuantos = factor <= PASO_MAXIMO ? 1 : Math.ceil(Math.log2(factor) / Math.log2(PASO_MAXIMO))
  const salida: Medidas[] = []
  for (let i = 1; i <= cuantos; i += 1) {
    const t = i / cuantos
    salida.push({
      ancho: Math.max(1, Math.round(desde.ancho * (fin.ancho / desde.ancho) ** t)),
      alto: Math.max(1, Math.round(desde.alto * (fin.alto / desde.alto) ** t)),
    })
  }
  salida[salida.length - 1] = fin
  return salida
}

/** El tipo MIME de un formato de salida. */
export function mediaDe(formato: Ajuste['formato']): string {
  return formato === 'png' ? 'image/png' : 'image/jpeg'
}

interface Lienzo {
  readonly ancho: number
  readonly alto: number
  readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  blob(formato: Ajuste['formato'], calidad: number): Promise<Blob>
}

/**
 * Un lienzo del tamano que haga falta.
 *
 * `OffscreenCanvas` cuando esta (no toca el DOM y es mas barato); el
 * `<canvas>` de siempre cuando no, que es el caso de Safari 16.
 */
function lienzo(ancho: number, alto: number, conAlfa: boolean): Lienzo {
  if (typeof OffscreenCanvas === 'function') {
    const c = new OffscreenCanvas(ancho, alto)
    const ctx = c.getContext('2d', { alpha: conAlfa })
    if (!ctx) throw new Error('Este navegador no deja dibujar en un lienzo.')
    return {
      ancho,
      alto,
      ctx,
      blob: (formato, calidad) => c.convertToBlob({ type: mediaDe(formato), quality: calidad / 100 }),
    }
  }
  const c = document.createElement('canvas')
  c.width = ancho
  c.height = alto
  const ctx = c.getContext('2d', { alpha: conAlfa })
  if (!ctx) throw new Error('Este navegador no deja dibujar en un lienzo.')
  return {
    ancho,
    alto,
    ctx,
    blob: (formato, calidad) =>
      new Promise((resolver, rechazar) => {
        c.toBlob(
          (b) => (b ? resolver(b) : rechazar(new Error('El lienzo no devolvió ninguna imagen.'))),
          mediaDe(formato),
          calidad / 100,
        )
      }),
  }
}

/** Pinta el lienzo de blanco: para lo que no lleva alfa. */
function fondoBlanco(l: Lienzo): void {
  l.ctx.fillStyle = '#ffffff'
  l.ctx.fillRect(0, 0, l.ancho, l.alto)
}

export interface Ajustada {
  readonly blob: Blob
  readonly ancho: number
  readonly alto: number
  readonly tipo: 'png' | 'jpeg'
}

/**
 * Aplica el ajuste y devuelve la imagen nueva.
 *
 * El original NO se toca: sale un Blob aparte, y es la app la que decide
 * sustituir una imagen por otra (ver la accion `sustituirImagen`), asi que
 * «Deshacer» devuelve el original intacto.
 */
export async function ajustarImagen(origen: Blob, a: Ajuste): Promise<Ajustada> {
  const bmp = await createImageBitmap(origen)
  try {
    const r = recorteValido(a.recorte, bmp.width, bmp.height)
    const pasos = escalones({ ancho: r.ancho, alto: r.alto }, { ancho: a.ancho, alto: a.alto })

    // El primer paso es el que aplica el recorte: se dibuja el trozo del
    // original, no la imagen entera.
    let actual = preparar(pasos[0] as Medidas, a)
    actual.ctx.drawImage(bmp, r.x, r.y, r.ancho, r.alto, 0, 0, actual.ancho, actual.alto)

    for (const medida of pasos.slice(1)) {
      const siguiente = preparar(medida, a)
      siguiente.ctx.drawImage(
        actual.ctx.canvas as unknown as CanvasImageSource,
        0,
        0,
        actual.ancho,
        actual.alto,
        0,
        0,
        siguiente.ancho,
        siguiente.alto,
      )
      actual = siguiente
    }

    if (a.grises) {
      // Despues de reducir: así se recorren los pixeles que quedan, no los del
      // original, y con una imagen de Procreate eso son 20 veces menos.
      const pixeles = actual.ctx.getImageData(0, 0, actual.ancho, actual.alto)
      actual.ctx.putImageData(new ImageData(aGrises(pixeles.data), actual.ancho, actual.alto), 0, 0)
    }

    const blob = await actual.blob(a.formato, a.calidad)
    return { blob, ancho: actual.ancho, alto: actual.alto, tipo: a.formato }
  } finally {
    bmp.close()
  }
}

/** Un lienzo listo para recibir el dibujo: suavizado, y blanco si no lleva alfa. */
function preparar(m: Medidas, a: Ajuste): Lienzo {
  const l = lienzo(m.ancho, m.alto, a.conservarAlfa)
  l.ctx.imageSmoothingEnabled = true
  l.ctx.imageSmoothingQuality = 'high'
  // Un lienzo opaco empieza en negro, asi que hay que pintarlo: si no, lo que
  // era transparente saldria negro en vez de blanco.
  if (!a.conservarAlfa) fondoBlanco(l)
  return l
}

/**
 * Recorta el recorte a lo que de verdad hay.
 *
 * Las medidas que trae el modelo salieron de la inspeccion de bytes, y un
 * JPEG raro puede decir en su cabecera un tamano y decodificar otro. Pedirle
 * al lienzo un trozo que no existe no lanza: dibuja cualquier cosa.
 */
export function recorteValido(r: Recorte, ancho: number, alto: number): Recorte {
  const x = Math.max(0, Math.min(Math.round(r.x), Math.max(0, ancho - 1)))
  const y = Math.max(0, Math.min(Math.round(r.y), Math.max(0, alto - 1)))
  return {
    x,
    y,
    ancho: Math.max(1, Math.min(Math.round(r.ancho), ancho - x)),
    alto: Math.max(1, Math.min(Math.round(r.alto), alto - y)),
  }
}
