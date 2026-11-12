/**
 * Del RGB de la pantalla al CMYK de la imprenta, con un perfil ICC.
 *
 * El camino de cada color: sRGB → XYZ (D50, adaptado con Bradford, como el
 * perfil sRGB del ICC) → Lab → la tabla B2A0 del perfil (perceptual: comprime
 * el gamut de la pantalla en el del papel sin cortar los degradados) → CMYK.
 * Hacer eso en cada pixel de una cubierta a 300 ppi (diez millones) seria
 * lento: se calcula en una rejilla de 33 × 33 × 33 sobre el RGB y cada pixel
 * se interpola en ella, en tetraedros, como hacen los motores de color.
 *
 * El limite de tinta (la suma de C, M, Y y K) se aplica en cada punto de la
 * rejilla, quitando cian, magenta y amarillo bajo el negro: como la
 * interpolacion es una media ponderada de puntos que ya cumplen, cada pixel
 * cumple tambien (y al redondear se corrige el sobrante). IngramSpark pide
 * 240 %; el perfil, 300 %.
 *
 * La prueba en pantalla hace el camino de vuelta (CMYK → A2B1, colorimetrica
 * relativa → Lab → sRGB): enseña los colores que el papel puede dar.
 */
import { aplicar, type Perfil, type Tabla } from './icc'

/** Del sRGB codificado (0..1) al Lab D50. */
export function srgbALab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const X = 0.4360747 * R + 0.3850649 * G + 0.1430804 * B
  const Y = 0.2225045 * R + 0.7168786 * G + 0.0606169 * B
  const Z = 0.0139322 * R + 0.0971045 * G + 0.7141733 * B
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f(X / 0.96422)
  const fy = f(Y)
  const fz = f(Z / 0.82521)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Del Lab D50 al sRGB codificado (0..1), recortado a lo que la pantalla puede dar. */
export function labASrgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const inv = (t: number): number => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))
  const X = inv(fx) * 0.96422
  const Y = inv(fy)
  const Z = inv(fz) * 0.82521
  const R = 3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z
  const G = -0.9787684 * X + 1.9161415 * Y + 0.033454 * Z
  const B = 0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z
  const cod = (c: number): number => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.min(1, Math.max(0, v))
  }
  return [cod(R), cod(G), cod(B)]
}

/** El Lab como lo lee una tabla del perfil (la codificacion «legacy» de la version 2). */
export function labATabla(t: Tabla, L: number, a: number, b: number, salida: Float64Array): void {
  if (t.bits === 16) {
    salida[0] = (Math.min(100, Math.max(0, L)) * 0xff00) / 100 / 0xffff
    salida[1] = (Math.min(127.99, Math.max(-128, a)) + 128) * 256 / 0xffff
    salida[2] = (Math.min(127.99, Math.max(-128, b)) + 128) * 256 / 0xffff
  } else {
    salida[0] = Math.min(100, Math.max(0, L)) / 100
    salida[1] = (Math.min(127, Math.max(-128, a)) + 128) / 255
    salida[2] = (Math.min(127, Math.max(-128, b)) + 128) / 255
  }
}

/** Lo que devuelve una tabla A2B, en Lab. */
export function tablaALab(t: Tabla, x: ArrayLike<number>): [number, number, number] {
  if (t.bits === 16) return [((x[0] as number) * 0xffff * 100) / 0xff00, ((x[1] as number) * 0xffff) / 256 - 128, ((x[2] as number) * 0xffff) / 256 - 128]
  return [(x[0] as number) * 100, (x[1] as number) * 255 - 128, (x[2] as number) * 255 - 128]
}

/** Quita cian, magenta y amarillo (no negro) hasta que la suma no pase de `limite` (3 = 300 %). */
export function limitarTinta(cmyk: Float64Array, limite: number): void {
  const k = cmyk[3] as number
  const cmy = (cmyk[0] as number) + (cmyk[1] as number) + (cmyk[2] as number)
  if (cmy + k <= limite || cmy <= 0) return
  const f = Math.max(0, limite - k) / cmy
  cmyk[0] = (cmyk[0] as number) * f
  cmyk[1] = (cmyk[1] as number) * f
  cmyk[2] = (cmyk[2] as number) * f
}

const PUNTOS = 33

/**
 * Una rejilla sobre el RGB de 8 bits: cada punto, los `canales` valores de
 * lo que se calculo para ese color. Se aplica a pixeles en tetraedros.
 */
export class RejillaRgb {
  readonly canales: number
  readonly valores: Float32Array
  private readonly indice = new Uint16Array(256)
  private readonly fraccion = new Float32Array(256)

  constructor(canales: number, calcular: (r: number, g: number, b: number, salida: Float64Array) => void) {
    this.canales = canales
    this.valores = new Float32Array(PUNTOS ** 3 * canales)
    const s = new Float64Array(canales)
    let o = 0
    for (let i = 0; i < PUNTOS; i++) {
      for (let j = 0; j < PUNTOS; j++) {
        for (let k = 0; k < PUNTOS; k++) {
          calcular(i / (PUNTOS - 1), j / (PUNTOS - 1), k / (PUNTOS - 1), s)
          for (let c = 0; c < canales; c++) this.valores[o++] = s[c] as number
        }
      }
    }
    for (let v = 0; v < 256; v++) {
      const p = (v / 255) * (PUNTOS - 1)
      const i = Math.min(PUNTOS - 2, Math.floor(p))
      this.indice[v] = i
      this.fraccion[v] = p - i
    }
  }

  /** Un color de 8 bits: sus valores, interpolados en tetraedros, en `salida`. */
  aplicar(r: number, g: number, b: number, salida: Float64Array | Float32Array): void {
    const n = this.canales
    const dx = PUNTOS * PUNTOS * n
    const dy = PUNTOS * n
    const dz = n
    const fx = this.fraccion[r] as number
    const fy = this.fraccion[g] as number
    const fz = this.fraccion[b] as number
    const c000 = (this.indice[r] as number) * dx + (this.indice[g] as number) * dy + (this.indice[b] as number) * dz
    let a: number
    let bb: number
    let fa: number
    let fb: number
    let fc: number
    if (fx >= fy) {
      if (fy >= fz) [a, bb, fa, fb, fc] = [dx, dx + dy, fx, fy, fz]
      else if (fx >= fz) [a, bb, fa, fb, fc] = [dx, dx + dz, fx, fz, fy]
      else [a, bb, fa, fb, fc] = [dz, dx + dz, fz, fx, fy]
    } else if (fz >= fy) [a, bb, fa, fb, fc] = [dz, dy + dz, fz, fy, fx]
    else if (fz >= fx) [a, bb, fa, fb, fc] = [dy, dy + dz, fy, fz, fx]
    else [a, bb, fa, fb, fc] = [dy, dx + dy, fy, fx, fz]
    const v = this.valores
    const c111 = c000 + dx + dy + dz
    for (let k = 0; k < n; k++) {
      const v0 = v[c000 + k] as number
      const va = v[c000 + a + k] as number
      const vb = v[c000 + bb + k] as number
      salida[k] = v0 + (va - v0) * fa + (vb - va) * fb + ((v[c111 + k] as number) - vb) * fc
    }
  }
}

export interface Separacion {
  /** RGB de 8 bits → C, M, Y, K en [0, 1]. */
  readonly rejilla: RejillaRgb
  /** La suma maxima de las cuatro tintas, en 0..4 (3 = 300 %). */
  readonly limite: number
}

/** La separacion de un perfil CMYK: perceptual, con el limite de tinta que se pida. */
export function separacion(p: Perfil, limite = 3): Separacion {
  const t = p.tablas.B2A0 ?? p.tablas.B2A1
  if (!t || p.espacio !== 'CMYK' || p.conexion !== 'Lab ' || t.salidas !== 4) throw new Error('El perfil no separa en CMYK desde Lab.')
  const lab = new Float64Array(3)
  const trabajo = new Float64Array(8)
  const rejilla = new RejillaRgb(4, (r, g, b, s) => {
    const [L, a, bb] = srgbALab(r, g, b)
    labATabla(t, L, a, bb, lab)
    aplicar(t, lab, s, trabajo)
    limitarTinta(s, limite)
  })
  return { rejilla, limite }
}

/** La prueba en pantalla: de RGB a lo que saldra impreso, otra vez en RGB. */
export function pruebaEnPantalla(p: Perfil, s: Separacion): RejillaRgb {
  const t = p.tablas.A2B1 ?? p.tablas.A2B0
  if (!t || t.entradas !== 4) throw new Error('El perfil no devuelve el CMYK a Lab.')
  const cmyk = new Float64Array(4)
  const lab = new Float64Array(8)
  const trabajo = new Float64Array(8)
  return new RejillaRgb(3, (r, g, b, salida) => {
    s.rejilla.aplicar(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), cmyk)
    aplicar(t, cmyk, lab, trabajo)
    const [L, a, bb] = tablaALab(t, lab)
    const rgb = labASrgb(L, a, bb)
    salida[0] = rgb[0]
    salida[1] = rgb[1]
    salida[2] = rgb[2]
  })
}

/**
 * Separa las filas [desde, hasta) de una imagen RGBA (la del lienzo, opaca) en
 * CMYK de 8 bits (255 es el 100 % de tinta, como lo lee DeviceCMYK). Por filas,
 * para que la app pueda soltar el hilo entre trozo y trozo.
 */
export function separarFilas(s: Separacion, rgba: Uint8Array | Uint8ClampedArray, ancho: number, desde: number, hasta: number, cmyk: Uint8Array): void {
  const v = new Float32Array(4)
  const tope = Math.floor(s.limite * 255)
  for (let y = desde; y < hasta; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4
      s.rejilla.aplicar(rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number, v)
      let c = Math.round(Math.min(1, Math.max(0, v[0] as number)) * 255)
      let m = Math.round(Math.min(1, Math.max(0, v[1] as number)) * 255)
      let yy = Math.round(Math.min(1, Math.max(0, v[2] as number)) * 255)
      const k = Math.round(Math.min(1, Math.max(0, v[3] as number)) * 255)
      // El redondeo puede pasar el limite por una o dos unidades: se quitan del mayor de los tres.
      let sobra = c + m + yy + k - tope
      while (sobra > 0) {
        if (c >= m && c >= yy) c--
        else if (m >= yy) m--
        else yy--
        sobra--
      }
      const o = (y * ancho + x) * 4
      cmyk[o] = c
      cmyk[o + 1] = m
      cmyk[o + 2] = yy
      cmyk[o + 3] = k
    }
  }
}

/** La prueba en pantalla sobre una imagen RGBA, en su sitio. */
export function probarFilas(prueba: RejillaRgb, rgba: Uint8Array | Uint8ClampedArray, ancho: number, desde: number, hasta: number): void {
  const v = new Float32Array(3)
  for (let y = desde; y < hasta; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4
      prueba.aplicar(rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number, v)
      rgba[i] = Math.round((v[0] as number) * 255)
      rgba[i + 1] = Math.round((v[1] as number) * 255)
      rgba[i + 2] = Math.round((v[2] as number) * 255)
    }
  }
}
