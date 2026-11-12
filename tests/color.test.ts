import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { labASrgb, labATabla, limitarTinta, probarFilas, pruebaEnPantalla, separacion, separarFilas, srgbALab, tablaALab } from '../src/core/impreso/color'
import { aplicar, curva, leerPerfil, type Tabla } from '../src/core/impreso/icc'
import { comprimirCmyk, predictorPng } from '../src/core/impreso/pdf-cubierta'
import { separacionDe, separarYComprimir } from '../src/app/cubierta/cmyk-motor'

// El CMYK de la cubierta (M10): leer el perfil ICC, separar el sRGB con su
// tabla perceptual, el limite de tinta, la prueba en pantalla y los filtros de
// PNG del flujo del PDF. La separacion se compara con la de LittleCMS 2.19 (la
// de Photoshop, GIMP y Pillow) para el mismo perfil: los valores de referencia
// los escribio LittleCMS, no este codigo.

const PERFIL = leerPerfil(new Uint8Array(readFileSync(join(import.meta.dirname, '..', 'public', 'perfiles', 'ISOcoated_v2_300_bas.icc'))))

describe('el perfil ICC', () => {
  it('se lee: impresora CMYK con Lab de conexion, las seis tablas y su licencia', () => {
    expect(PERFIL).toMatchObject({ version: 2, clase: 'prtr', espacio: 'CMYK', conexion: 'Lab ', descripcion: 'ISO Coated v2 300% (basICColor)' })
    expect(Object.keys(PERFIL.tablas).sort()).toEqual(['A2B0', 'A2B1', 'A2B2', 'B2A0', 'B2A1', 'B2A2'])
    expect(PERFIL.tablas.B2A0).toMatchObject({ entradas: 3, salidas: 4, rejilla: 33, bits: 16 })
    expect(PERFIL.tablas.A2B1).toMatchObject({ entradas: 4, salidas: 3, rejilla: 11 })
    expect(PERFIL.copyright).toContain('zlib/libpng')
  })

  it('lo que no es un perfil no se lee', () => {
    expect(() => leerPerfil(new Uint8Array(200))).toThrow()
  })

  it('las curvas, lineales entre sus puntos; la rejilla, exacta en sus puntos', () => {
    const c = new Float64Array([0, 0.5, 1])
    expect(curva(c, 0.25)).toBeCloseTo(0.25, 12)
    expect(curva(c, 2)).toBe(1)
    // Una tabla de 3 entradas y 2 puntos por lado: en cada esquina, el valor de la esquina.
    const ident = new Float64Array([0, 1])
    const t: Tabla = { entradas: 3, salidas: 1, rejilla: 2, curvasEntrada: [ident, ident, ident], curvasSalida: [ident], clut: new Float64Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]), bits: 16 }
    const s = new Float64Array(1)
    for (let i = 0; i < 8; i++) {
      aplicar(t, [(i >> 2) & 1, (i >> 1) & 1, i & 1], s)
      expect(s[0]).toBeCloseTo(i / 10, 12)
    }
    // Y en medio del cubo, la media (los seis tetraedros coinciden en la diagonal).
    aplicar(t, [0.5, 0.5, 0.5], s)
    expect(s[0]).toBeCloseTo(0.35, 12)
    // Las curvas de salida se aplican despues de la rejilla (las de este perfil son rectas: aqui no).
    aplicar({ ...t, curvasSalida: [new Float64Array([0, 0.1, 1])] }, [0.5, 0.5, 0.5], s)
    expect(s[0]).toBeCloseTo(0.07, 12)
  })
})

describe('del sRGB al Lab y vuelta', () => {
  it('blanco, negro y el rojo de sRGB en Lab D50 (el de Bradford, como el perfil sRGB del ICC)', () => {
    expect(srgbALab(1, 1, 1).map((x) => Math.round(x * 100) / 100)).toEqual([100, 0, 0])
    expect(srgbALab(0, 0, 0).map((x) => Math.round(x * 100) / 100)).toEqual([0, 0, 0])
    const rojo = srgbALab(1, 0, 0)
    expect(rojo[0]).toBeCloseTo(54.29, 1)
    expect(rojo[1]).toBeCloseTo(80.8, 1)
    expect(rojo[2]).toBeCloseTo(69.89, 1)
  })

  it('ida y vuelta: el mismo color', () => {
    for (const c of [[0.2, 0.4, 0.6], [0.9, 0.1, 0.3], [0.5, 0.5, 0.5]] as const) {
      const [L, a, b] = srgbALab(c[0], c[1], c[2])
      labASrgb(L, a, b).forEach((v, i) => expect(v).toBeCloseTo(c[i] as number, 5))
    }
  })

  it('el Lab de la version 2: L hasta 0xFF00, a y b con el cero en 0x8000', () => {
    const t = PERFIL.tablas.B2A0 as Tabla
    const s = new Float64Array(3)
    labATabla(t, 100, 0, 0, s)
    expect([s[0] as number, s[1] as number, s[2] as number].map((x) => Math.round(x * 0xffff))).toEqual([0xff00, 0x8000, 0x8000])
    expect(tablaALab(t, s).map((x) => Math.round(x * 1000) / 1000)).toEqual([100, 0, 0])
    // Las de 8 bits: L hasta 255 y el cero de a y b en 128.
    labATabla({ ...t, bits: 8 }, 100, 0, 0, s)
    expect([s[0] as number, s[1] as number, s[2] as number].map((x) => Math.round(x * 255))).toEqual([255, 128, 128])
  })
})

describe('la separacion, como la hace LittleCMS con el mismo perfil (perceptual)', () => {
  // [R, G, B] → [C, M, Y, K] en %, escritos por LittleCMS 2.19 (Pillow ImageCms).
  const LCMS: readonly (readonly [readonly number[], readonly number[]])[] = [
    [[255, 255, 255], [0, 0, 0, 0]],
    [[0, 0, 0], [75.3, 66.3, 63.5, 94.9]],
    [[255, 0, 0], [0, 89.8, 97.6, 0]],
    [[0, 255, 0], [53.7, 0, 88.6, 0]],
    [[0, 0, 255], [100, 76.1, 0, 0]],
    [[128, 128, 128], [48.2, 38.4, 38, 19.6]],
    [[230, 180, 120], [11, 31.4, 55.7, 1.6]],
    [[30, 40, 90], [96.9, 87.1, 23.9, 30.2]],
    [[200, 30, 120], [17.6, 94.1, 11.8, 1.6]],
    [[250, 220, 40], [6.7, 8.2, 83.9, 0]],
  ]
  const s = separacion(PERFIL, 3)

  it('cada tinta, a menos de un punto de la de LittleCMS', () => {
    const v = new Float32Array(4)
    for (const [rgb, cmyk] of LCMS) {
      s.rejilla.aplicar(rgb[0] as number, rgb[1] as number, rgb[2] as number, v)
      cmyk.forEach((c, i) => expect(Math.abs((v[i] as number) * 100 - c), `${rgb.join(',')} tinta ${i}`).toBeLessThan(1))
    }
  })

  it('el blanco no lleva tinta; el negro, la de un negro enriquecido hasta el 300 %', () => {
    const cmyk = new Uint8Array(8)
    separarFilas(s, new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]), 2, 0, 1, cmyk)
    expect([...cmyk.subarray(0, 4)]).toEqual([0, 0, 0, 0])
    expect(cmyk.subarray(4).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(765)
    expect(cmyk[7]).toBeGreaterThan(230)
  })
})

describe('el limite de tinta', () => {
  // Una muestra de todo el cubo RGB, con los oscuros (donde se acumula la tinta) mas apretados.
  const muestra = (): Uint8Array => {
    const valores = [0, 8, 16, 24, 32, 48, 64, 96, 128, 160, 192, 224, 255]
    const rgba: number[] = []
    for (const r of valores) for (const g of valores) for (const b of valores) rgba.push(r, g, b, 255)
    return new Uint8Array(rgba)
  }

  for (const [limite, quien] of [[3, 'el perfil'], [2.4, 'IngramSpark']] as const) {
    it(`${limite * 100} % (${quien}): ningun pixel lo pasa, ni redondeado`, () => {
      const rgba = muestra()
      const n = rgba.length / 4
      const cmyk = new Uint8Array(n * 4)
      separarFilas(separacion(PERFIL, limite), rgba, n, 0, 1, cmyk)
      let peor = 0
      for (let i = 0; i < n; i++) peor = Math.max(peor, (cmyk[i * 4] as number) + (cmyk[i * 4 + 1] as number) + (cmyk[i * 4 + 2] as number) + (cmyk[i * 4 + 3] as number))
      expect(peor).toBeLessThanOrEqual(Math.floor(limite * 255))
      // Y se llega cerca: el limite no se queda corto.
      expect(peor).toBeGreaterThan(Math.floor(limite * 255) - 8)
    })
  }

  it('en la rejilla, no solo al redondear: el negro a 240 % lleva el mismo negro que a 300 %, con menos de los otros tres en la misma proporcion', () => {
    const v300 = new Float32Array(4)
    const v240 = new Float32Array(4)
    separacion(PERFIL, 3).rejilla.aplicar(0, 0, 0, v300)
    separacion(PERFIL, 2.4).rejilla.aplicar(0, 0, 0, v240)
    expect(v240[3]).toBeCloseTo(v300[3] as number, 5)
    expect((v240[0] as number) + (v240[1] as number) + (v240[2] as number) + (v240[3] as number)).toBeCloseTo(2.4, 4)
    expect((v240[0] as number) / (v240[1] as number)).toBeCloseTo((v300[0] as number) / (v300[1] as number), 4)
  })

  it('se quita cian, magenta y amarillo bajo el negro; el negro se queda', () => {
    const v = new Float64Array([0.8, 0.7, 0.7, 0.9])
    limitarTinta(v, 2.4)
    expect(v[3]).toBe(0.9)
    expect((v[0] as number) + (v[1] as number) + (v[2] as number) + (v[3] as number)).toBeCloseTo(2.4, 12)
    expect((v[0] as number) / (v[1] as number)).toBeCloseTo(0.8 / 0.7, 12)
    const bajo = new Float64Array([0.1, 0.1, 0.1, 0.1])
    limitarTinta(bajo, 2.4)
    expect([...bajo]).toEqual([0.1, 0.1, 0.1, 0.1])
  })
})

describe('la prueba en pantalla: como sale impreso', () => {
  const prueba = pruebaEnPantalla(PERFIL, separacion(PERFIL, 3))

  it('el blanco del papel se ve blanco; el azul puro de la pantalla, mas apagado', () => {
    const rgba = new Uint8Array([255, 255, 255, 255, 0, 0, 255, 255])
    probarFilas(prueba, rgba, 2, 0, 1)
    expect([...rgba.subarray(0, 3)].every((v) => v >= 250)).toBe(true)
    const [r, g, b] = [rgba[4] as number, rgba[5] as number, rgba[6] as number]
    // Menos saturado: el azul ya no es puro y el rojo y el verde suben.
    expect(b).toBeLessThan(255)
    expect(r + g).toBeGreaterThan(40)
    expect(rgba[7]).toBe(255)
  })
})

describe('el flujo CMYK del PDF: filtros de PNG y zlib, sin perdida', () => {
  /** Deshace los filtros de PNG: escrito aparte del codificador, segun la especificacion de PNG. */
  function deshacer(d: Uint8Array, ancho: number, alto: number, canales: number): Uint8Array {
    const fila = ancho * canales
    const r = new Uint8Array(fila * alto)
    for (let y = 0; y < alto; y++) {
      const tipo = d[y * (fila + 1)] as number
      for (let i = 0; i < fila; i++) {
        const x = d[y * (fila + 1) + 1 + i] as number
        const a = i >= canales ? (r[y * fila + i - canales] as number) : 0
        const b = y > 0 ? (r[(y - 1) * fila + i] as number) : 0
        const c = y > 0 && i >= canales ? (r[(y - 1) * fila + i - canales] as number) : 0
        const p = a + b - c
        const pred = [0, a, b, (a + b) >> 1, Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c][tipo] as number
        r[y * fila + i] = (x + pred) & 0xff
      }
    }
    return r
  }

  it('lo que sale es lo que entro, y cada fila elige su filtro', () => {
    const ancho = 37
    const alto = 23
    const datos = new Uint8Array(ancho * alto * 4)
    for (let i = 0; i < datos.length; i++) datos[i] = (i * 7 + ((i / 148) | 0) * 13) & 0xff
    const f = predictorPng(datos, ancho, alto, 4)
    expect(f.length).toBe(alto * (ancho * 4 + 1))
    expect(deshacer(f, ancho, alto, 4)).toEqual(datos)
    expect(new Set(Array.from({ length: alto }, (_, y) => f[y * (ancho * 4 + 1)])).size).toBeGreaterThan(1)
    expect(deshacer(unzlibSync(comprimirCmyk(datos, ancho, alto)), ancho, alto, 4)).toEqual(datos)
  })

  it('cada filtro donde es el bueno: Up en una fila igual a la de arriba; Paeth donde se mezclan franjas y bandas', () => {
    const ancho = 20
    const alto = 6
    // Filas iguales: Up deja todo a cero.
    const iguales = new Uint8Array(ancho * alto * 4).map((_, i) => ((i % (ancho * 4)) * 37) & 0xff)
    const fu = predictorPng(iguales, ancho, alto, 4)
    for (let y = 1; y < alto; y++) expect(fu[y * (ancho * 4 + 1)], `fila ${y}`).toBe(2)
    expect(deshacer(fu, ancho, alto, 4)).toEqual(iguales)
    // A la izquierda bandas (cada fila un valor: Sub acierta, Up no) y a la derecha franjas
    // (cada columna un valor: Up acierta, Sub no). Paeth elige el vecino bueno en cada lado.
    const mezcla = new Uint8Array(ancho * alto * 4).map((_, i) => {
      const x = (i >> 2) % ancho
      const y = Math.floor(i / (ancho * 4))
      return (x < ancho / 2 ? 10 * y : 7 * x) & 0xff
    })
    const fp = predictorPng(mezcla, ancho, alto, 4)
    for (let y = 1; y < alto; y++) expect(fp[y * (ancho * 4 + 1)], `fila ${y}`).toBe(4)
    expect(deshacer(fp, ancho, alto, 4)).toEqual(mezcla)
  })

  it('el motor de la app (el del hilo) da lo mismo que separar y comprimir a mano, y la separacion se hace una vez', () => {
    const ancho = 16
    const alto = 9
    const rgba = new Uint8ClampedArray(ancho * alto * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) & 0xff))
    const cmyk = new Uint8Array(ancho * alto * 4)
    separarFilas(separacionDe(PERFIL, 2.4), rgba, ancho, 0, alto, cmyk)
    expect(deshacer(unzlibSync(separarYComprimir(PERFIL, rgba, ancho, alto, 2.4)), ancho, alto, 4)).toEqual(cmyk)
    expect(separacionDe(PERFIL, 2.4)).toBe(separacionDe(PERFIL, 2.4))
    expect(separacionDe(PERFIL, 3)).not.toBe(separacionDe(PERFIL, 2.4))
  })
})
