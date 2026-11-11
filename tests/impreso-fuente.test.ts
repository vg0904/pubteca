import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Fuente } from '../src/core/impreso/sfnt'
import { fuentes } from './impreso/ayuda'

// El lector de fuentes del impreso: lo justo para componer (cmap, avances,
// kerning de GPOS, ligaduras de GSUB) y para saber si se puede incrustar.

const RUTA = join(import.meta.dirname, '..', 'public', 'fuentes', 'impreso', 'SourceSerif4-Regular.ttf')

describe('leer Source Serif 4', () => {
  const f = fuentes().regular

  it('lee las metricas de la cabecera', () => {
    expect(f.upm).toBe(1000)
    expect(f.ascendente).toBeGreaterThan(900)
    expect(f.descendente).toBeLessThan(-200)
    expect(f.alturaX).toBeGreaterThan(400)
    expect(f.alturaMayusculas).toBeGreaterThan(f.alturaX)
    expect(f.nombre).toMatch(/^SourceSerif4/u)
    expect(fuentes().cursiva.anguloCursiva).toBeLessThan(0)
    expect(f.anguloCursiva).toBe(0)
  })

  it('tiene un glifo para cada letra del español y para la raya', () => {
    for (const c of 'áéíóúüñÁÉÍÓÚÜÑ¿¡«»—–…') expect(f.tiene(c.codePointAt(0) as number), c).toBe(true)
  })

  it('dice que caracteres no tiene', () => {
    const forma = f.formar('a❦b⁂c❦')
    expect(forma.faltan).toEqual(['❦', '⁂'])
    expect(forma.glifos.filter((g) => g.id === 0)).toHaveLength(3)
  })

  it('aplica el kerning de GPOS: «AV» es mas estrecho que A + V', () => {
    const a = f.glifo(65)
    const v = f.glifo(86)
    expect(f.kern(a, v)).toBeLessThan(0)
    expect(f.formar('AV').ancho).toBe(f.avance(a) + f.avance(v) + f.kern(a, v))
    // El de la junta con lo que sigue, tambien.
    expect(f.formar('A', v).ancho).toBe(f.avance(a) + f.kern(a, v))
    expect(f.formar('A').ancho).toBe(f.avance(a))
  })

  it('forma las ligaduras de GSUB: fi, fl y la mas larga primero (ffi)', () => {
    expect(f.formar('fino').glifos.map((g) => g.texto)).toEqual(['fi', 'n', 'o'])
    expect(f.formar('flor').glifos.map((g) => g.texto)).toEqual(['fl', 'o', 'r'])
    expect(f.formar('affine').glifos.map((g) => g.texto)).toEqual(['a', 'ffi', 'n', 'e'])
    const fi = f.formar('fi').glifos[0]
    expect(fi?.id).not.toBe(f.glifo(0x66))
  })

  it('su licencia deja incrustarla y recortarla (OFL, fsType 0)', () => {
    expect(f.fsType).toBe(0)
    expect(f.incrustable()).toEqual({ puede: true, subconjunto: true })
  })
})

describe('fsType: lo que la licencia de una fuente deja hacer', () => {
  // Se cambia el campo en una copia de la fuente de verdad.
  const conFsType = (valor: number): Fuente => {
    const b = new Uint8Array(readFileSync(RUTA))
    const dv = new DataView(b.buffer)
    for (let i = 0, n = dv.getUint16(4); i < n; i++) {
      const o = 12 + i * 16
      if (String.fromCharCode(...b.subarray(o, o + 4)) === 'OS/2') dv.setUint16(dv.getUint32(o + 8) + 8, valor)
    }
    return new Fuente(b)
  }

  it('restringida (0x0002): no se puede incrustar', () => {
    expect(conFsType(0x0002).incrustable().puede).toBe(false)
  })
  it('solo mapas de bits (0x0200): no se puede', () => {
    expect(conFsType(0x0200).incrustable().puede).toBe(false)
  })
  it('sin subconjunto (0x0100): se puede, pero entera', () => {
    expect(conFsType(0x0100).incrustable()).toEqual({ puede: true, subconjunto: false })
  })
  it('de vista previa e impresion (0x0004): se puede', () => {
    expect(conFsType(0x0004).incrustable()).toEqual({ puede: true, subconjunto: true })
  })
})

describe('lo que no es una fuente TrueType', () => {
  it('rechaza bytes que no son una fuente', () => {
    expect(() => new Fuente(new Uint8Array(40))).toThrow(/TrueType/u)
    expect(() => new Fuente(new Uint8Array(4))).toThrow(/corta/u)
  })
  it('rechaza una OpenType con contornos CFF diciendo por que', () => {
    const b = new Uint8Array(64)
    b.set([0x4f, 0x54, 0x54, 0x4f])
    expect(() => new Fuente(b)).toThrow(/CFF/u)
  })
})

describe('trampa 7 del plan: Buffer de Node', () => {
  it('copia los bytes: tocar el Buffer de origen no cambia la fuente', () => {
    // Un Buffer comparte memoria con su pool; si la fuente no copiara, el
    // subconjunto de M5 escribiria en memoria ajena (paso en el prototipo).
    const buf = readFileSync(RUTA)
    const f = new Fuente(buf)
    const antes = f.formar('Hola').ancho
    buf.fill(0)
    expect(f.formar('Hola').ancho).toBe(antes)
    expect(f.bytes.buffer).not.toBe(buf.buffer)
  })
})

describe('el contorno de cada glifo (lo que pinta la vista previa)', () => {
  /** La caja que la propia fuente declara en la cabecera del glifo, leida a mano. */
  function cabecera(f: Fuente, g: number): { contornos: number; caja: [number, number, number, number] } | null {
    const dv = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength)
    const loca = (f.tablas.get('loca') as { off: number }).off
    const glyf = (f.tablas.get('glyf') as { off: number }).off
    const pos = (i: number): number => (f.locaLarga ? dv.getUint32(loca + i * 4) : dv.getUint16(loca + i * 2) * 2)
    if (pos(g + 1) <= pos(g)) return null
    const a = glyf + pos(g)
    return { contornos: dv.getInt16(a), caja: [dv.getInt16(a + 2), dv.getInt16(a + 4), dv.getInt16(a + 6), dv.getInt16(a + 8)] }
  }
  /** La caja de todos los puntos del trazado (los de control incluidos, como la de TrueType). */
  function cajaDelTrazado(d: string): [number, number, number, number] {
    const n = [...d.matchAll(/-?\d+(?:\.\d+)?/gu)].map((m) => Number(m[0]))
    const xs = n.filter((_v, i) => i % 2 === 0)
    const ys = n.filter((_v, i) => i % 2 === 1)
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }

  for (const cara of ['regular', 'cursiva', 'negrita', 'negritaCursiva'] as const) {
    it(`${cara}: cada trazado ocupa la caja que la fuente declara (exacta en los simples; ±1 en los compuestos, que fontTools redondea)`, () => {
      const f = fuentes()[cara]
      let compuestos = 0
      for (const c of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789áéíóúüñÁÉÍÓÚÑ¿¡«»—…&%') {
        const g = f.glifo(c.codePointAt(0) as number)
        const h = cabecera(f, g)
        expect(h, c).not.toBeNull()
        const { contornos, caja } = h as NonNullable<typeof h>
        if (contornos < 0) compuestos++
        const t = cajaDelTrazado(f.contorno(g))
        t.forEach((v, i) => expect(Math.abs(v - (caja[i] as number)), `${cara} ${c} [${i}]`).toBeLessThanOrEqual(contornos < 0 ? 1 : 0.005))
      }
      // Que de verdad se prueban compuestos (las letras con tilde lo son).
      expect(compuestos).toBeGreaterThan(5)
    })
  }

  it('un trazado por cada contorno que declara el glifo, abierto y cerrado; un compuesto suma los de sus piezas', () => {
    const f = fuentes().regular
    const g = (c: string): number => f.glifo(c.codePointAt(0) as number)
    const cuenta = (c: string, letra: 'M' | 'Z'): number => (f.contorno(g(c)).match(new RegExp(letra, 'gu')) ?? []).length
    for (const c of 'olBiao') {
      const declarados = (cabecera(f, g(c)) as { contornos: number }).contornos
      expect(declarados, c).toBeGreaterThan(0)
      expect([cuenta(c, 'M'), cuenta(c, 'Z')], c).toEqual([declarados, declarados])
    }
    // La «ñ» es la «n» mas su tilde: tiene los de la «n» y alguno mas.
    expect((cabecera(f, g('ñ')) as { contornos: number }).contornos).toBeLessThan(0)
    expect(cuenta('ñ', 'M')).toBeGreaterThan(cuenta('n', 'M'))
  })

  it('el espacio no tiene contorno, y el trazado empieza en un punto (M) y solo usa M, L, Q y Z', () => {
    const f = fuentes().regular
    expect(f.contorno(f.glifo(0x20))).toBe('')
    expect(f.contorno(f.glifo(0x61))).toMatch(/^M[-\d. LQMZ]+Z$/u)
  })
})
