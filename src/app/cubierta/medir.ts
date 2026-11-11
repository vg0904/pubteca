/**
 * Lo que la cubierta necesita medir de cada dibujo, con el lienzo del
 * navegador: su luminancia en una rejilla pequeña (para elegir la tinta de
 * cada pieza) y el color de la parte baja de su borde izquierdo (el que sigue
 * en el lomo y en la contraportada si el autor no elige otro).
 */
import type { Luminancias } from '../../core/impreso/cubierta'
import type { Medicion } from './preparar'

const lineal = (v: number): number => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** La luminancia relativa (WCAG) de cada pixel RGBA. Pura: se prueba en Node. */
export function luminanciasDe(rgba: ArrayLike<number>, ancho: number, alto: number): Luminancias {
  const valores = new Float32Array(ancho * alto)
  for (let i = 0; i < valores.length; i++) {
    valores[i] = 0.2126 * lineal(rgba[i * 4] as number) + 0.7152 * lineal(rgba[i * 4 + 1] as number) + 0.0722 * lineal(rgba[i * 4 + 2] as number)
  }
  return { ancho, alto, valores }
}

/**
 * El color medio de las primeras `columnas` de pixeles RGBA, de la fila
 * `desde` hacia abajo, como «#rrggbb».
 */
export function colorMedio(rgba: ArrayLike<number>, ancho: number, alto: number, columnas: number, desde = 0): string {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = Math.max(0, Math.floor(desde)); y < alto; y++) {
    for (let x = 0; x < Math.min(columnas, ancho); x++) {
      const i = (y * ancho + x) * 4
      r += rgba[i] as number
      g += rgba[i + 1] as number
      b += rgba[i + 2] as number
      n++
    }
  }
  const h = (v: number): string => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export async function medirDibujo(blob: Blob): Promise<Medicion> {
  const bmp = await createImageBitmap(blob)
  try {
    const ancho = 48
    const alto = Math.max(8, Math.round((48 * bmp.height) / bmp.width))
    const lienzo = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(ancho, alto) : Object.assign(document.createElement('canvas'), { width: ancho, height: alto })
    const ctx = lienzo.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) throw new Error('Este navegador no deja medir la imagen.')
    ctx.drawImage(bmp, 0, 0, ancho, alto)
    const datos = ctx.getImageData(0, 0, ancho, alto).data
    // El borde izquierdo, su tercio de abajo: el «suelo» del dibujo, que es lo
    // que mejor sigue en el lomo (la media de todo el borde mezcla cielo y mar).
    return { luz: luminanciasDe(datos, ancho, alto), borde: colorMedio(datos, ancho, alto, 2, (alto * 2) / 3) }
  } finally {
    bmp.close()
  }
}
