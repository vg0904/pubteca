import { describe, expect, it } from 'vitest'
import { enBlanco, MINIMO_TRANSPARENTE, porcionTransparente } from '../src/app/subir'

/** Pixeles RGBA: `n` de un color con alfa `a`. */
function pixeles(...grupos: [n: number, rgb: number, a: number][]): Uint8ClampedArray {
  const salida: number[] = []
  for (const [n, rgb, a] of grupos) for (let i = 0; i < n; i++) salida.push(rgb, rgb, rgb, a)
  return new Uint8ClampedArray(salida)
}

const admiteBlanco = (rgba: Uint8ClampedArray): boolean => porcionTransparente(rgba) >= MINIMO_TRANSPARENTE

describe('el logo para el modo oscuro', () => {
  it('EL FALLO: un PNG con canal alfa pero el fondo pintado NO admite version blanca', () => {
    // Es como exporta Procreate con la capa de fondo visible: canal alfa, y
    // todos los pixeles opacos. Antes se pintaba de blanco y salia un
    // rectangulo blanco en el modo oscuro de Apple Books.
    expect(admiteBlanco(pixeles([1000, 255, 255]))).toBe(false)
  })

  it('ni uno con el fondo pintado y solo las esquinas suavizadas', () => {
    expect(admiteBlanco(pixeles([995, 255, 255], [5, 0, 120]))).toBe(false)
  })

  it('un logo en negro sobre fondo transparente si', () => {
    expect(admiteBlanco(pixeles([300, 0, 255], [700, 0, 0]))).toBe(true)
  })

  it('pinta de blanco y CONSERVA el alfa de cada pixel, el suavizado incluido', () => {
    const logo = pixeles([1, 0, 255], [1, 30, 128], [1, 0, 0])
    expect([...enBlanco(logo)]).toEqual([255, 255, 255, 255, 255, 255, 255, 128, 255, 255, 255, 0])
    // Sin tocar el original.
    expect(logo[0]).toBe(0)
  })

  it('una imagen vacia no cuenta como transparente', () => {
    expect(porcionTransparente(new Uint8ClampedArray())).toBe(0)
  })
})
