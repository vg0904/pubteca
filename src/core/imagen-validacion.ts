/**
 * Avisos y notas de cada imagen. Port de generar_epub.py 189-223.
 *
 * Los umbrales y los textos estan congelados: son los que el golden test
 * compara. De donde sale cada numero esta en ESPECIFICACIONES_ILUSTRACIONES.md
 * y en el brief, seccion 6 (reglas de KDP y de Apple Books).
 */
import type { Diagnosticos } from './mensajes'
import type { InfoImagen } from './imagen-inspeccion'
import { formatoFijo } from './numero'

/** Limite de Apple Books: 5,6 millones de pixeles. */
export const MAX_PIXELES = 5_600_000
/** Minimo aceptable de una ilustracion interior. */
export const MIN_ANCHO = 1200
export const MIN_ALTO = 1800
/** Apple Books pide al menos esto en el lado corto de la portada. */
export const MIN_LADO_CORTO_PORTADA = 1400
/** KDP recomienda esto de alto en la portada. */
export const ALTO_RECOMENDADO_PORTADA = 2500
/** Por encima de esto conviene comprimir: la tarifa de Kindle se cobra por MB. */
export const PESO_NOTABLE = 600_000

export type RolImagen = 'ilustracion' | 'portada' | 'logo'

/**
 * `revisar_imagen()`. Emite avisos y notas segun el rol de la imagen.
 *
 * Las tres ramas RETORNAN antes de llegar a la siguiente, asi que el logo no se
 * revisa por CMYK, P3, tamano minimo, proporcion ni peso, y la portada no
 * recibe la nota de peso ni la de proporcion. Es intencionado.
 */
export function revisarImagen(
  etiqueta: string,
  info: InfoImagen,
  rol: RolImagen,
  dg: Diagnosticos,
): void {
  const w = info.ancho
  const h = info.alto

  if (rol === 'logo') {
    if (w * h > MAX_PIXELES) {
      dg.aviso(
        `${etiqueta}: ${w}×${h} px supera el límite de Apple Books (5.6 millones de píxeles). Redúcelo.`,
      )
    }
    if (!info.alfa) {
      dg.nota(
        `${etiqueta}: no tiene fondo transparente; en Apple Books con modo oscuro se verá un recuadro.`,
      )
    }
    return
  }

  // Orden fijo: alfa, cmyk, p3, pixeles.
  if (info.alfa) {
    dg.aviso(
      `${etiqueta}: tiene transparencia. Kindle la convierte en blanco; aplánala sobre su fondo.`,
    )
  }
  if (info.cmyk) {
    dg.aviso(`${etiqueta}: está en CMYK (modo de imprenta). Conviértela a sRGB.`)
  }
  if (info.p3) {
    dg.aviso(
      `${etiqueta}: usa el perfil Display P3. Conviértela a sRGB para que los colores se vean igual en todos lados.`,
    )
  }
  if (w * h > MAX_PIXELES) {
    dg.aviso(
      `${etiqueta}: ${w}×${h} px = ${formatoFijo((w * h) / 1e6, 1)} millones de píxeles; Apple Books admite hasta 5.6. Redúcela.`,
    )
  }

  if (rol === 'portada') {
    if (Math.min(w, h) < MIN_LADO_CORTO_PORTADA) {
      dg.aviso(
        `${etiqueta}: el lado corto mide ${Math.min(w, h)} px; Apple Books pide al menos 1400.`,
      )
    }
    if (h < ALTO_RECOMENDADO_PORTADA) {
      dg.nota(
        `${etiqueta}: mide ${h} px de alto; KDP recomienda 2500 o más para pantallas de alta resolución.`,
      )
    }
    return
  }

  if (w < MIN_ANCHO || h < MIN_ALTO) {
    if (w > h) {
      // Una horizontal solo se avisa si ademas es chica para ser horizontal.
      if (w < 1800) {
        dg.aviso(
          `${etiqueta}: mide ${w}×${h} px (horizontal); lo recomendado es 2400×1600. Se verá borrosa en pantallas grandes.`,
        )
      }
    } else {
      dg.aviso(
        `${etiqueta}: mide ${w}×${h} px; lo recomendado es 1600×2400 (mínimo 1200×1800). Se verá borrosa en pantallas grandes.`,
      )
    }
  }

  if (w > h) {
    dg.nota(`${etiqueta}: es horizontal; en pantallas verticales se mostrará reducida.`)
  } else if (w && !(h / w >= 1.3 && h / w <= 1.8)) {
    dg.nota(
      `${etiqueta}: proporción 1:${formatoFijo(h / w, 2)} (lo recomendado es 1:1.5); en algunas pantallas quedará con franjas vacías.`,
    )
  }

  if (info.bytes > PESO_NOTABLE) {
    dg.nota(
      `${etiqueta}: pesa ${formatoFijo(info.bytes / 1e6, 1)} MB; considera comprimirla (la tarifa de entrega de Kindle se cobra por MB).`,
    )
  }
}
