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
