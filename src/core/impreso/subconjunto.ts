/**
 * El subconjunto de una fuente TrueType para incrustarla en el PDF: solo los
 * glifos que el libro usa.
 *
 * Se CONSERVAN los ids de glifo y se vacian los que no se usan (decision del
 * plan): asi el PDF puede seguir nombrando cada glifo por su id original
 * (`CIDToGIDMap /Identity`) y no hay que renumerar nada. Un glifo vacio ocupa
 * cero bytes en `glyf`; la tabla `loca` sigue teniendo una entrada por glifo.
 *
 * Se guardan las tablas que pide el PDF para una CIDFontType2 (9.9 de ISO
 * 32000): `head`, `hhea`, `maxp`, `hmtx`, `loca`, `glyf`, y `cvt `, `fpgm` y
 * `prep` si las hay; mas `OS/2`, que algunas RIP leen. Sin `cmap`: con
 * `/Identity` el PDF no la usa.
 *
 * Determinista: los mismos glifos dan los mismos bytes (no se toca la fecha
 * de la cabecera).
 */
import type { Fuente } from './sfnt'

const TABLAS = ['head', 'hhea', 'maxp', 'OS/2', 'hmtx', 'cvt ', 'fpgm', 'prep'] as const

/** La suma de control de una tabla: palabras de 32 bits, la ultima rellenada con ceros. */
export function sumaTabla(d: Uint8Array): number {
  let s = 0
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const enteros = d.length - (d.length % 4)
  for (let i = 0; i < enteros; i += 4) s = (s + v.getUint32(i)) >>> 0
  if (d.length % 4) {
    const r = new Uint8Array(4)
    r.set(d.subarray(enteros))
    s = (s + new DataView(r.buffer).getUint32(0)) >>> 0
  }
  return s
}

/** Los glifos que hay que guardar: los usados, el .notdef y las piezas de los compuestos («é» = «e» + «´»). */
export function glifosNecesarios(f: Fuente, usados: Iterable<number>): Set<number> {
  const dv = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength)
  const loca = (f.tablas.get('loca') as { off: number }).off
  const glyf = (f.tablas.get('glyf') as { off: number }).off
  const pos = (g: number): number => (f.locaLarga ? dv.getUint32(loca + g * 4) : dv.getUint16(loca + g * 2) * 2)
  const todos = new Set<number>([0])
  const pendientes = [...usados]
  while (pendientes.length > 0) {
    const g = pendientes.pop() as number
    if (g < 0 || g >= f.numGlifos || todos.has(g)) continue
    todos.add(g)
    const a = pos(g)
    const z = pos(g + 1)
    // Un glifo compuesto tiene numberOfContours < 0 y lista sus piezas.
    if (z <= a || dv.getInt16(glyf + a) >= 0) continue
    let p = glyf + a + 10
    for (;;) {
      const banderas = dv.getUint16(p)
      pendientes.push(dv.getUint16(p + 2))
      p += 4 + (banderas & 0x0001 ? 4 : 2)
      if (banderas & 0x0008) p += 2
      else if (banderas & 0x0040) p += 4
      else if (banderas & 0x0080) p += 8
      if (!(banderas & 0x0020)) break
    }
  }
  return todos
}

/** La fuente con solo esos glifos (mas los que necesitan), lista para `FontFile2`. */
export function subconjunto(f: Fuente, usados: Iterable<number>): Uint8Array {
  const b = f.bytes
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const tabla = (n: string): Uint8Array => {
    const t = f.tablas.get(n) as { off: number; len: number }
    return b.slice(t.off, t.off + t.len)
  }
  const loca = (f.tablas.get('loca') as { off: number }).off
  const glyf = (f.tablas.get('glyf') as { off: number }).off
  const pos = (g: number): number => (f.locaLarga ? dv.getUint32(loca + g * 4) : dv.getUint16(loca + g * 2) * 2)
  const todos = glifosNecesarios(f, usados)

  // glyf y loca nuevas: los glifos guardados, cada uno alineado a 4 bytes.
  const nuevaLoca = new Uint8Array((f.numGlifos + 1) * 4)
  const ldv = new DataView(nuevaLoca.buffer)
  let largo = 0
  for (const g of todos) largo += (pos(g + 1) - pos(g) + 3) & ~3
  const nuevoGlyf = new Uint8Array(largo)
  let off = 0
  for (let g = 0; g < f.numGlifos; g++) {
    ldv.setUint32(g * 4, off)
    if (!todos.has(g)) continue
    const datos = b.subarray(glyf + pos(g), glyf + pos(g + 1))
    nuevoGlyf.set(datos, off)
    off += (datos.length + 3) & ~3
  }
  ldv.setUint32(f.numGlifos * 4, off)

  // head: loca larga, y la suma de control del archivo a cero hasta el final.
  const head = tabla('head')
  const hdv = new DataView(head.buffer)
  hdv.setInt16(50, 1)
  hdv.setUint32(8, 0)

  const tablas = new Map<string, Uint8Array>([
    ['loca', nuevaLoca],
    ['glyf', nuevoGlyf],
  ])
  for (const n of TABLAS) if (f.tablas.has(n)) tablas.set(n, n === 'head' ? head : tabla(n))
  // El directorio va ordenado por etiqueta (por bytes, como pide el formato).
  const nombres = [...tablas.keys()].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
  const n = nombres.length
  let total = 12 + n * 16
  for (const k of nombres) total += ((tablas.get(k) as Uint8Array).length + 3) & ~3
  const sal = new Uint8Array(total)
  const sdv = new DataView(sal.buffer)
  const e = Math.floor(Math.log2(n))
  sdv.setUint32(0, 0x00010000)
  sdv.setUint16(4, n)
  sdv.setUint16(6, 16 << e)
  sdv.setUint16(8, e)
  sdv.setUint16(10, n * 16 - (16 << e))
  let p = 12 + n * 16
  let enHead = 0
  nombres.forEach((k, i) => {
    const t = tablas.get(k) as Uint8Array
    const r = 12 + i * 16
    for (let c = 0; c < 4; c++) sal[r + c] = k.charCodeAt(c)
    sdv.setUint32(r + 4, sumaTabla(t))
    sdv.setUint32(r + 8, p)
    sdv.setUint32(r + 12, t.length)
    sal.set(t, p)
    if (k === 'head') enHead = p
    p += (t.length + 3) & ~3
  })
  sdv.setUint32(enHead + 8, (0xb1b0afba - sumaTabla(sal)) >>> 0)
  return sal
}
