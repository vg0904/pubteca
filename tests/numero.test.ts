import { describe, expect, it } from 'vitest'
import { formatoFijo } from '../src/core/numero'
import { oraculo } from './oraculo'

describe(`formatoFijo contra Python (${oraculo.formato.length} valores)`, () => {
  it('coincide a 0, 1, 2 y 3 decimales en todos los valores', () => {
    const fallos: string[] = []
    for (const c of oraculo.formato) {
      const comparar = [
        [0, c.f0],
        [1, c.f1],
        [2, c.f2],
        [3, c.f3],
      ] as const
      for (const [d, esperado] of comparar) {
        const obtenido = formatoFijo(c.valor, d)
        if (obtenido !== esperado) {
          fallos.push(`${c.valor} a ${d} decimales: Python ${esperado}, nosotros ${obtenido}`)
        }
      }
    }
    expect(fallos).toEqual([])
  })

  it('cubre de verdad los empates, que es donde esta la diferencia', () => {
    const empates = oraculo.formato.filter((c) => {
      const x = c.valor * 10
      return Number.isInteger(x * 2) && !Number.isInteger(x)
    })
    expect(empates.length).toBeGreaterThan(50)
  })
})

describe('los empates concretos donde toFixed se equivoca', () => {
  // Estos son los dos casos que aparecieron al barrer 9012 valores
  // plausibles del generador. El de 1.25 es alcanzable de verdad: una
  // ilustracion de exactamente 1.250.000 bytes.
  it('1.25 a una decimal: Python da 1.2 (al par), toFixed da 1.3', () => {
    expect(formatoFijo(1.25, 1)).toBe('1.2')
    expect((1.25).toFixed(1)).toBe('1.3')
  })

  it('0.625 a dos decimales: Python da 0.62, toFixed da 0.63', () => {
    expect(formatoFijo(0.625, 2)).toBe('0.62')
    expect((0.625).toFixed(2)).toBe('0.63')
  })

  it('redondea al par en las dos direcciones', () => {
    expect(formatoFijo(0.25, 1)).toBe('0.2')
    expect(formatoFijo(0.75, 1)).toBe('0.8')
    expect(formatoFijo(1.75, 1)).toBe('1.8')
    expect(formatoFijo(2.25, 1)).toBe('2.2')
  })

  it('lo que no es empate se redondea al mas cercano, como siempre', () => {
    expect(formatoFijo(0.26, 1)).toBe('0.3')
    expect(formatoFijo(0.24, 1)).toBe('0.2')
    expect(formatoFijo(6.0, 1)).toBe('6.0')
    expect(formatoFijo(0.710302, 1)).toBe('0.7')
  })

  it('rellena con ceros y respeta el cero y el negativo', () => {
    expect(formatoFijo(0, 2)).toBe('0.00')
    expect(formatoFijo(1, 3)).toBe('1.000')
    expect(formatoFijo(-1.25, 1)).toBe('-1.2')
    expect(formatoFijo(0.0001, 1)).toBe('0.0')
  })
})
