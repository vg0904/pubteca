/**
 * Leer un perfil ICC y aplicar sus tablas: lo justo para pasar la cubierta de
 * RGB a CMYK con un perfil de imprenta, sin WASM ni motor de color externo.
 *
 * Un perfil de salida (clase `prtr`) de la version 2 trae sus transformaciones
 * como tablas `mft2` (o `mft1`, de 8 bits):
 *   A2B0/A2B1/A2B2   del dispositivo (CMYK) al espacio de conexion (Lab), en
 *                    las intenciones perceptual, colorimetrica relativa y
 *                    saturacion;
 *   B2A0/B2A1/B2A2   del Lab al CMYK: la separacion de verdad, con su
 *                    generacion de negro y su limite de tinta.
 *
 * Cada tabla: curvas de entrada por canal, una rejilla multidimensional (CLUT)
 * que se interpola, y curvas de salida. Todo en [0, 1]. Las rejillas de tres
 * entradas se interpolan en tetraedros (lo que hacen los motores de color);
 * las de cuatro, en multilineal.
 *
 * Fuera de alcance: los perfiles de la version 4 (`mAB`/`mBA`) y la matriz de
 * `mft2` (solo se usa con XYZ, y aqui el espacio de conexion es Lab).
 * Ver ICC.1:2001-04, 6.5.7 y 6.5.8.
 */

export interface Tabla {
  readonly entradas: number
  readonly salidas: number
  readonly rejilla: number
  /** Una curva por canal de entrada: valores en [0, 1] a intervalos iguales. */
  readonly curvasEntrada: readonly Float64Array[]
  /** La rejilla: rejilla^entradas puntos de `salidas` valores, en [0, 1]; la primera entrada varia mas despacio. */
  readonly clut: Float64Array
  readonly curvasSalida: readonly Float64Array[]
  /** mft1 (8) o mft2 (16): el Lab del espacio de conexion se codifica distinto en cada una. */
  readonly bits: 8 | 16
}

export type NombreTabla = 'A2B0' | 'A2B1' | 'A2B2' | 'B2A0' | 'B2A1' | 'B2A2'

export interface Perfil {
  readonly version: number
  readonly clase: string
  /** El espacio del dispositivo: «CMYK», «RGB », «GRAY». */
  readonly espacio: string
  /** El de conexion: «Lab » o «XYZ ». */
  readonly conexion: string
  readonly descripcion: string
  readonly copyright: string
  readonly tablas: Readonly<Partial<Record<NombreTabla, Tabla>>>
}

const texto4 = (b: Uint8Array, i: number): string => String.fromCharCode(b[i] as number, b[i + 1] as number, b[i + 2] as number, b[i + 3] as number)

export function leerPerfil(bytes: Uint8Array): Perfil {
  if (bytes.length < 132 || texto4(bytes, 36) !== 'acsp') throw new Error('No es un perfil ICC.')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const n = v.getUint32(128)
  const tablas: Partial<Record<NombreTabla, Tabla>> = {}
  let descripcion = ''
  let copyright = ''
  for (let i = 0; i < n; i++) {
    const firma = texto4(bytes, 132 + 12 * i)
    const desde = v.getUint32(136 + 12 * i)
    const largo = v.getUint32(140 + 12 * i)
    if (desde + largo > bytes.length) throw new Error(`La etiqueta ${firma} se sale del perfil.`)
    const tipo = texto4(bytes, desde)
    if (/^(A2B|B2A)[012]$/u.test(firma)) {
      if (tipo === 'mft2' || tipo === 'mft1') tablas[firma as NombreTabla] = leerTabla(bytes, v, desde, tipo === 'mft2')
    } else if (firma === 'desc' && tipo === 'desc') {
      const l = v.getUint32(desde + 8)
      descripcion = latin1(bytes.subarray(desde + 12, desde + 12 + l))
    } else if (firma === 'cprt' && tipo === 'text') {
      copyright = latin1(bytes.subarray(desde + 8, desde + largo))
    }
  }
  return { version: bytes[8] as number, clase: texto4(bytes, 12), espacio: texto4(bytes, 16), conexion: texto4(bytes, 20), descripcion, copyright, tablas }
}

function latin1(b: Uint8Array): string {
  let s = ''
  for (const c of b) {
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

function leerTabla(b: Uint8Array, v: DataView, desde: number, dieciseis: boolean): Tabla {
  const entradas = b[desde + 8] as number
  const salidas = b[desde + 9] as number
  const rejilla = b[desde + 10] as number
  if (entradas < 1 || entradas > 8 || salidas < 1 || salidas > 8 || rejilla < 2) throw new Error('Tabla ICC con medidas imposibles.')
  // mft1: curvas de 256 valores de 8 bits; mft2: tantos como digan, de 16.
  const nEntrada = dieciseis ? v.getUint16(desde + 48) : 256
  const nSalida = dieciseis ? v.getUint16(desde + 50) : 256
  let i = desde + (dieciseis ? 52 : 48)
  const leer = (): number => {
    const x = dieciseis ? v.getUint16(i) / 65535 : (b[i] as number) / 255
    i += dieciseis ? 2 : 1
    return x
  }
  const curva = (largo: number): Float64Array => {
    const c = new Float64Array(largo)
    for (let k = 0; k < largo; k++) c[k] = leer()
    return c
  }
  const curvasEntrada = Array.from({ length: entradas }, () => curva(nEntrada))
  const clut = curva(rejilla ** entradas * salidas)
  const curvasSalida = Array.from({ length: salidas }, () => curva(nSalida))
  return { entradas, salidas, rejilla, curvasEntrada, clut, curvasSalida, bits: dieciseis ? 16 : 8 }
}

/** Una curva en x (0..1): lineal entre sus puntos. */
export function curva(c: Float64Array, x: number): number {
  const t = Math.min(1, Math.max(0, x)) * (c.length - 1)
  const i = Math.min(c.length - 2, Math.floor(t))
  const f = t - i
  return (c[i] as number) * (1 - f) + (c[i + 1] as number) * f
}

/**
 * Aplica una tabla: `entrada` en [0, 1], el resultado en `salida` (en [0, 1]).
 * `trabajo` es un hueco de al menos `entradas` valores, para no crear nada en
 * el bucle de los pixeles.
 */
export function aplicar(t: Tabla, entrada: ArrayLike<number>, salida: Float64Array, trabajo: Float64Array = new Float64Array(8)): void {
  for (let k = 0; k < t.entradas; k++) trabajo[k] = curva(t.curvasEntrada[k] as Float64Array, entrada[k] as number)
  if (t.entradas === 3) tetraedrica(t, trabajo, salida)
  else multilineal(t, trabajo, salida)
  for (let k = 0; k < t.salidas; k++) salida[k] = curva(t.curvasSalida[k] as Float64Array, salida[k] as number)
}

/** Interpolacion en tetraedros (Sakamoto): el cubo se parte en seis segun el orden de las tres fracciones. */
function tetraedrica(t: Tabla, x: Float64Array, salida: Float64Array): void {
  const g = t.rejilla
  const s = t.salidas
  const pos = (v: number): [number, number] => {
    const p = Math.min(1, Math.max(0, v)) * (g - 1)
    const i = Math.min(g - 2, Math.floor(p))
    return [i, p - i]
  }
  const [i0, fx] = pos(x[0] as number)
  const [i1, fy] = pos(x[1] as number)
  const [i2, fz] = pos(x[2] as number)
  // Pasos en la rejilla: la primera entrada es la que varia mas despacio.
  const dx = g * g * s
  const dy = g * s
  const dz = s
  const c000 = i0 * dx + i1 * dy + i2 * dz
  const c111 = c000 + dx + dy + dz
  let a: number
  let b: number
  let fa: number
  let fb: number
  let fc: number
  if (fx >= fy) {
    if (fy >= fz) [a, b, fa, fb, fc] = [dx, dx + dy, fx, fy, fz]
    else if (fx >= fz) [a, b, fa, fb, fc] = [dx, dx + dz, fx, fz, fy]
    else [a, b, fa, fb, fc] = [dz, dx + dz, fz, fx, fy]
  } else if (fz >= fy) [a, b, fa, fb, fc] = [dz, dy + dz, fz, fy, fx]
  else if (fz >= fx) [a, b, fa, fb, fc] = [dy, dy + dz, fy, fz, fx]
  else [a, b, fa, fb, fc] = [dy, dx + dy, fy, fx, fz]
  const c = t.clut
  for (let k = 0; k < s; k++) {
    const v0 = c[c000 + k] as number
    const va = c[c000 + a + k] as number
    const vb = c[c000 + b + k] as number
    const v1 = c[c111 + k] as number
    salida[k] = v0 + (va - v0) * fa + (vb - va) * fb + (v1 - vb) * fc
  }
}

/** Interpolacion multilineal en n dimensiones: los 2^n vertices de la celda. */
function multilineal(t: Tabla, x: Float64Array, salida: Float64Array): void {
  const g = t.rejilla
  const n = t.entradas
  const s = t.salidas
  const base: number[] = []
  const f: number[] = []
  const paso: number[] = []
  let p = s
  for (let k = n - 1; k >= 0; k--) {
    paso[k] = p
    p *= g
  }
  for (let k = 0; k < n; k++) {
    const v = Math.min(1, Math.max(0, x[k] as number)) * (g - 1)
    const i = Math.min(g - 2, Math.floor(v))
    base[k] = i
    f[k] = v - i
  }
  salida.fill(0, 0, s)
  for (let esquina = 0; esquina < 1 << n; esquina++) {
    let peso = 1
    let indice = 0
    for (let k = 0; k < n; k++) {
      const arriba = (esquina >> k) & 1
      peso *= arriba ? (f[k] as number) : 1 - (f[k] as number)
      indice += ((base[k] as number) + arriba) * (paso[k] as number)
    }
    if (peso === 0) continue
    for (let o = 0; o < s; o++) salida[o] = (salida[o] as number) + peso * (t.clut[indice + o] as number)
  }
}
