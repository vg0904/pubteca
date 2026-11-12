import { describe, expect, it } from 'vitest'
import {
  CAJA_CODIGO,
  CONFIG_CUBIERTA_POR_DEFECTO,
  ESTILOS_ORDEN,
  contraste,
  luminanciaDe,
  medidasCubierta,
  normalizarCubierta,
  SEGURIDAD,
  TINTA_CLARA,
  TINTA_OSCURA,
  type Caja,
  type CubiertaCompuesta,
  type EstiloId,
  type OpCubierta,
} from '../src/core/impreso/cubierta'
import { ALTO_BARRAS, MODULO, SILENCIO, componerCodigo, izquierdaDeBarras, svgDelCodigo } from '../src/core/impreso/codigo'
import { barrasEan13, cifrasDeIsbn, controlEan, modulosEan13, revisarIsbn } from '../src/core/impreso/ean13'
import { hayMovidas, PIEZAS_PORTADA, type QuePieza } from '../src/core/impreso/cubierta-config'
import { isbnValido } from '../src/core/impreso/config'
import { CORTES } from '../src/core/impreso/formatos'
import { componerImpreso } from '../src/core/impreso/plan'
import { CONFIG_IMPRESO_POR_DEFECTO } from '../src/core/impreso/config'
import { contenidoDePrueba } from '../scripts/impreso-prueba'
import { cubiertaDePrueba, datosDePrueba, fuentesCubiertaDelRepo, pdfDeCubierta } from '../scripts/cubierta-prueba'
import { dic, leerPdf, lista, nombreDe, numero, paginas, textosPintados } from '../scripts/leer-pdf'
import { fuentes } from './impreso/ayuda'

// La cubierta (M7): las medidas con el lomo, el codigo de barras, que ninguna
// pieza de ningun estilo invade la caja del codigo ni sale de lo seguro, la
// tinta que se elige por contraste, y el PDF. Que un lector de codigos lee el
// EAN-13 lo comprueba CI con zbarimg (y se comprobo con ZXing: ver plan.md).

const MM = 72 / 25.4
const IN = 72
const F = fuentesCubiertaDelRepo()

/**
 * La caja de lo que pinta una operacion, girada si va girada: a lo largo, lo
 * que avanzan sus glifos; a lo alto, lo que declara la caja de cada glifo en
 * la fuente (los acentos incluidos).
 */
function cajaDe(op: OpCubierta): Caja {
  if (op.op === 'rect') return { x: op.x, y: op.y, ancho: op.ancho, alto: op.alto }
  const f = op.letra === 'libro' ? F.libro[op.cara] : F[op.letra]
  const k = op.cuerpo / f.upm
  const largo = op.glifos.reduce((s, g) => s + g.avance * k, 0)
  const cajas = op.glifos.flatMap((g) => (f.limites(g.id) ? [f.limites(g.id) as readonly number[]] : []))
  const sube = Math.max(0, ...cajas.map((c) => c[3] as number)) * k
  const baja = Math.max(0, ...cajas.map((c) => -(c[1] as number))) * k
  if (op.giro === 90) return { x: op.x - baja, y: op.y, ancho: sube + baja, alto: largo }
  if (op.giro === -90) return { x: op.x - sube, y: op.y - largo, ancho: sube + baja, alto: largo }
  return { x: op.x, y: op.y - sube, ancho: largo, alto: sube + baja }
}

const corta = (a: Caja, b: Caja): boolean => a.x < b.x + b.ancho - 1e-6 && b.x < a.x + a.ancho - 1e-6 && a.y < b.y + b.alto - 1e-6 && b.y < a.y + a.alto - 1e-6
const dentro = (a: Caja, b: Caja): boolean => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.ancho <= b.x + b.ancho + 1e-6 && a.y + a.alto <= b.y + b.alto + 1e-6
const encoger = (c: Caja, dx: number, dy = dx): Caja => ({ x: c.x + dx, y: c.y + dy, ancho: c.ancho - 2 * dx, alto: c.alto - 2 * dy })

describe('las medidas: el caso de M7', () => {
  it('6 × 9 in, 212 paginas, crema: 12,78 × 9,25 in con lomo de 13,5 mm e isotipo', () => {
    const c = cubiertaDePrueba({}, { imagenes: { ...datosDePrueba().imagenes, isotipo: { ancho: 400, alto: 400 } } })
    expect(c.medidas.ancho / IN).toBeCloseTo(12.78, 6)
    expect(c.medidas.alto / IN).toBeCloseTo(9.25, 6)
    expect(c.medidas.lomo / MM).toBeCloseTo(13.46, 2)
    expect(c.piezas.some((p) => p.que === 'isotipo')).toBe(true)
    expect(c.capas.filter((x) => x.que === 'logo').map((x) => (x.que === 'logo' ? x.rol : ''))).toContain('isotipo')
  })

  it('el lomo sale del papel y del numero de paginas: blanco 0,002252 in por pagina, crema 0,0025', () => {
    expect(medidasCubierta({ ancho: 432, alto: 648 }, 300, 'blanco').lomo / IN).toBeCloseTo(0.6756, 6)
    expect(medidasCubierta({ ancho: 432, alto: 648 }, 300, 'crema').lomo / IN).toBeCloseTo(0.75, 6)
  })

  it('al quitar un capitulo el lomo cambia solo: sale de las paginas del interior compuesto', () => {
    const contenido = contenidoDePrueba()
    const corte = { ancho: 432, alto: 648 }
    const entero = componerImpreso(contenido, CONFIG_IMPRESO_POR_DEFECTO, fuentes()).paginas.length
    const sinUno = componerImpreso({ ...contenido, capitulos: contenido.capitulos.slice(0, -1) }, CONFIG_IMPRESO_POR_DEFECTO, fuentes()).paginas.length
    expect(sinUno).toBeLessThan(entero)
    const a = medidasCubierta(corte, entero, 'crema')
    const b = medidasCubierta(corte, sinUno, 'crema')
    expect(a.lomo - b.lomo).toBeCloseTo((entero - sinUno) * 0.0025 * IN, 9)
    expect(a.ancho - b.ancho).toBeCloseTo(a.lomo - b.lomo, 9)
    // Y la portada se corre con el lomo: lo que hay en ella va con ella.
    expect(a.portada.x - b.portada.x).toBeCloseTo(a.lomo - b.lomo, 9)
  })

  it('con la plantilla de IngramSpark manda su lomo; sin el, se avisa', () => {
    const c = cubiertaDePrueba({ lomoManual: 15 }, { destino: 'ingram' })
    expect(c.medidas.lomo / MM).toBeCloseTo(15, 9)
    expect(cubiertaDePrueba({}, { destino: 'ingram' }).avisos).toContainEqual({ codigo: 'lomoDeIngram' })
  })
})

describe('el codigo de barras EAN-13', () => {
  // Los modulos de referencia los escribio el codificador de ZXing (Zint), no este codigo.
  const ZXING: Readonly<Record<string, string>> = {
    '9788409123452': '10101110110001001000100101000110100111000101101010110011011011001000010101110010011101101100101',
    '9780306406157': '10101110110001001010011101111010100111010111101010101110011100101010000110011010011101000100101',
    '4006381333931': '10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101',
  }

  it('da los mismos 95 modulos que el codificador de ZXing', () => {
    for (const [cifras, esperado] of Object.entries(ZXING)) expect(modulosEan13(cifras).map((b) => (b ? '1' : '0')).join(''), cifras).toBe(esperado)
  })

  it('del ISBN: el de 13 si cuadra, el de 10 pasado a 978, y nada si no cuadra', () => {
    expect(cifrasDeIsbn('978-84-09-12345-2')).toBe('9788409123452')
    expect(cifrasDeIsbn('0-306-40615-2')).toBe('9780306406157')
    expect(cifrasDeIsbn('978-84-09-12345-3')).toBeNull()
    expect(cifrasDeIsbn('0-306-40615-3')).toBeNull()
  })

  it('se pinta en su caja, en vectores: la caja blanca y una barra por cada tramo negro', () => {
    const c = cubiertaDePrueba()
    const rects = c.ops.filter((o) => o.op === 'rect')
    expect(rects[0]).toMatchObject({ x: c.codigo.x, y: c.codigo.y, ancho: c.codigo.ancho, alto: c.codigo.alto, gris: 1 })
    expect(rects.length - 1).toBe(barrasEan13('9788409123452').length)
    for (const r of rects.slice(1)) expect(dentro(cajaDe(r), c.codigo)).toBe(true)
  })

  it('la caja: 50,8 × 30,5 mm, a 19 mm del pie y a 1/10 A del lomo (al menos 6 mm de la bisagra)', () => {
    for (const corte of CORTES) {
      const m = medidasCubierta({ ancho: corte.ancho * IN, alto: corte.alto * IN }, 200, 'blanco')
      const c = cubiertaDePrueba({}, { corte: { ancho: corte.ancho * IN, alto: corte.alto * IN }, paginas: 200 })
      expect(c.codigo.ancho).toBeCloseTo(CAJA_CODIGO.ancho, 9)
      expect(c.codigo.alto).toBeCloseTo(CAJA_CODIGO.alto, 9)
      expect(m.contra.y + m.contra.alto - (c.codigo.y + c.codigo.alto)).toBeCloseTo(19 * MM, 9)
      expect(m.espina.x - (c.codigo.x + c.codigo.ancho)).toBeCloseTo(m.contra.ancho / 10, 9)
      expect(m.espina.x - (c.codigo.x + c.codigo.ancho)).toBeGreaterThanOrEqual(6 * MM)
    }
  })

  it('con «el de KDP» no se dibuja nada en la caja; sin un ISBN valido, tampoco, y se dice', () => {
    const kdp = cubiertaDePrueba({ codigo: 'kdp' })
    expect(kdp.ops.filter((o) => corta(cajaDe(o), kdp.codigo))).toEqual([])
    expect(kdp.avisos).toContainEqual({ codigo: 'codigoKdp' })
    const malo = cubiertaDePrueba({}, { isbn: '978-84-09-12345-3' })
    expect(malo.avisos).toContainEqual({ codigo: 'codigoSinIsbn' })
    expect(malo.ops.some((o) => o.op === 'rect')).toBe(false)
  })
})

describe('ninguna pieza de ningun estilo invade la caja del codigo ni sale de lo seguro', () => {
  const largo = { titulo: 'La extraordinaria y verdadera historia del faro que nadie quiso apagar', autor: 'María de los Ángeles Etxeberria Villanueva', sello: 'Ediciones del Faro y la Marea' }
  const logos = { sello: { ancho: 900, alto: 300 }, selloBlanco: { ancho: 900, alto: 300 }, isotipo: { ancho: 300, alto: 300 } }
  const comprobar = (c: CubiertaCompuesta, donde: string): void => {
    const m = c.medidas
    const delCodigo = (o: OpCubierta): boolean => dentro(cajaDe(o), c.codigo) && c.avisos.every((a) => a.codigo !== 'codigoKdp')
    for (const o of c.ops) {
      const caja = cajaDe(o)
      if (!delCodigo(o)) expect(corta(caja, c.codigo), `${donde}: invade la caja del codigo`).toBe(false)
      if (o.op !== 'texto') continue
      // El lomo: 1,6 mm libres a cada lado. La portada y la contraportada: 3,2 mm dentro del corte.
      // Las cifras de KDP escritas a mano: 0,0625 in libres a cada lado del lomo, 0,125 in dentro del corte.
      const panel = o.giro !== 0 && caja.x >= m.espina.x - 1e-6 && caja.x + caja.ancho <= m.espina.x + m.espina.ancho + 1e-6 ? encoger(m.espina, 0.0625 * IN, 0.125 * IN) : caja.x < m.espina.x ? encoger(m.contra, 0.125 * IN) : encoger(m.portada, 0.125 * IN)
      expect(dentro(caja, panel), `${donde}: «${o.glifos.map((g) => g.texto).join('')}» fuera de lo seguro`).toBe(true)
    }
    for (const capa of c.capas) if (capa.que === 'logo') expect(corta(capa.caja, c.codigo), `${donde}: el logo ${capa.rol} invade el codigo`).toBe(false)
    // Y las piezas de la portada no se pisan entre si.
    const portada = c.piezas.filter((p) => p.que === 'titulo' || p.que === 'autor' || p.que === 'sello')
    for (const [i, a] of portada.entries()) for (const b of portada.slice(i + 1)) expect(corta(a.caja, b.caja), `${donde}: ${a.que} pisa ${b.que}`).toBe(false)
  }

  for (const estilo of ESTILOS_ORDEN) {
    it(`${estilo}: todos los cortes de KDP, con textos largos y cortos, con logos y sin ellos`, () => {
      for (const corte of CORTES) {
        for (const [paginas, datos] of [
          [120, {}],
          [600, { ...largo, imagenes: { ...datosDePrueba().imagenes, ...logos } }],
        ] as const) {
          const c = cubiertaDePrueba({ estilo: estilo as EstiloId, titulo: true }, { corte: { ancho: corte.ancho * IN, alto: corte.alto * IN }, paginas, ...datos })
          comprobar(c, `${estilo} ${corte.id} ${paginas}`)
        }
      }
    })
  }
})

describe('el lomo', () => {
  it('texto solo desde 79 paginas (KDP); por debajo, se dice', () => {
    const c78 = cubiertaDePrueba({}, { paginas: 78 })
    expect(c78.piezas.some((p) => p.que === 'lomoTitulo')).toBe(false)
    expect(c78.avisos).toContainEqual({ codigo: 'lomoSinTexto', paginas: 78, minimo: 79 })
    expect(cubiertaDePrueba({}, { paginas: 79 }).piezas.some((p) => p.que === 'lomoTitulo')).toBe(true)
  })

  it('el isotipo solo con mas de 8 mm de lomo (126 paginas en crema)', () => {
    const conIso = (paginas: number): CubiertaCompuesta => cubiertaDePrueba({}, { paginas, imagenes: { ...datosDePrueba().imagenes, isotipo: { ancho: 300, alto: 300 } } })
    expect(conIso(125).piezas.some((p) => p.que === 'isotipo')).toBe(false)
    expect(conIso(125).avisos.some((a) => a.codigo === 'isotipoOmitido')).toBe(true)
    expect(conIso(127).piezas.some((p) => p.que === 'isotipo')).toBe(true)
  })

  it('de arriba abajo por defecto; de abajo arriba si se pide', () => {
    const giros = (c: CubiertaCompuesta): number[] => [...new Set(c.ops.flatMap((o) => (o.op === 'texto' && o.giro !== 0 && o.x > c.medidas.espina.x && o.x < c.medidas.portada.x ? [o.giro] : [])))]
    expect(giros(cubiertaDePrueba())).toEqual([90])
    expect(giros(cubiertaDePrueba({ lomo: 'ascendente' }))).toEqual([-90])
  })

  it('el titulo arriba, en orden de lectura: de arriba abajo empieza arriba; de abajo arriba, abajo', () => {
    const titulo = (c: CubiertaCompuesta) => c.piezas.find((p) => p.que === 'lomoTitulo') as { caja: Caja }
    const desc = cubiertaDePrueba()
    const asc = cubiertaDePrueba({ lomo: 'ascendente' })
    expect(titulo(desc).caja.y).toBeCloseTo(titulo(asc).caja.y, 6)
    const primero = (c: CubiertaCompuesta) => c.ops.find((o) => o.op === 'texto' && o.giro !== 0) as Extract<OpCubierta, { op: 'texto' }>
    expect(primero(desc).y).toBeCloseTo(titulo(desc).caja.y, 6)
    expect(primero(asc).y).toBeGreaterThan(titulo(asc).caja.y + titulo(asc).caja.alto / 2)
  })
})

describe('la tinta se elige por contraste (WCAG)', () => {
  it('las cuentas de WCAG: blanco 1, negro 0, 21:1', () => {
    expect(luminanciaDe('#ffffff')).toBeCloseTo(1, 9)
    expect(luminanciaDe('#000000')).toBe(0)
    expect(contraste(1, 0)).toBeCloseTo(21, 9)
  })

  const tintaDe = (c: CubiertaCompuesta, que: string): number[] => {
    const p = c.piezas.find((x) => x.que === que)
    return [...new Set(c.ops.filter((o) => o.op === 'texto' && p && dentro(cajaDe(o), encoger(p.caja, -2))).map((o) => (o.op === 'texto' ? o.gris : -1)))]
  }

  it('el autor sobre el mar oscuro, en claro; el titulo sobre el cielo claro, en oscuro', () => {
    expect(tintaDe(cubiertaDePrueba(), 'autor')).toEqual([TINTA_CLARA])
    expect(tintaDe(cubiertaDePrueba({ estilo: 'clasico' }), 'titulo')).toEqual([TINTA_OSCURA])
  })

  it('si el autor pide una tinta que no se lee, se pone y se le añade el velo justo', () => {
    const c = cubiertaDePrueba({ estilo: 'clasico', tintas: { titulo: 'clara' } })
    expect(tintaDe(c, 'titulo')).toEqual([TINTA_CLARA])
    const velo = c.capas.find((x) => x.que === 'velo')
    expect(velo).toMatchObject({ que: 'velo', color: 'negro' })
    expect(c.avisos).toContainEqual({ codigo: 'velo', pieza: 'titulo' })
  })

  it('la franja crece hasta cubrir su texto: el titulo no queda sobre el dibujo', () => {
    const c = cubiertaDePrueba({ estilo: 'franja' })
    const franja = c.capas.filter((x) => x.que === 'color').at(-1)
    const titulo = c.piezas.find((p) => p.que === 'titulo')
    if (franja?.que !== 'color' || !titulo) throw new Error('falta la franja o el titulo')
    expect(titulo.caja.y).toBeGreaterThan(franja.caja.y)
    expect(c.capas.some((x) => x.que === 'velo')).toBe(false)
  })
})

describe('la sinopsis', () => {
  it('arriba en la contraportada, y nunca baja a la caja del codigo ni al logo', () => {
    const c = cubiertaDePrueba({}, { descripcion: 'Una frase que no se acaba. '.repeat(400) })
    const s = c.piezas.find((p) => p.que === 'sinopsis')
    expect(s).toBeDefined()
    expect((s?.caja.y ?? 0) + (s?.caja.alto ?? 0)).toBeLessThan(c.codigo.y)
    expect(c.avisos).toContainEqual({ codigo: 'sinopsisCortada' })
  })
})

describe('la configuracion de la cubierta', () => {
  it('lo que no se entiende toma su valor por defecto', () => {
    expect(normalizarCubierta(null)).toEqual(CONFIG_CUBIERTA_POR_DEFECTO)
    const c = normalizarCubierta({ estilo: 'barroco', lomoManual: -3, encuadre: { x: 7 }, fondo: 'rojo', tintas: { autor: 'clara', titulo: 'fucsia' }, codigo: 'kdp' })
    expect(c.estilo).toBe('papiro')
    expect(c.lomoManual).toBe(0)
    expect(c.encuadre).toEqual({ x: 1, y: 0.5 })
    expect(c.fondo).toBe('')
    expect(c.tintas).toEqual({ autor: 'clara' })
    expect(c.codigo).toBe('kdp')
    // Un libro guardado antes de la opcion lleva el autor; quitarlo se guarda.
    expect(c.autor).toBe(true)
    expect(normalizarCubierta({ autor: false }).autor).toBe(false)
    expect(normalizarCubierta({ autor: 'no' }).autor).toBe(true)
    expect(normalizarCubierta({ autor: 0 }).autor).toBe(true)
  })

  it('el autor fuera de la portada (el dibujo ya lo trae): en ningun estilo, y en el lomo sigue', () => {
    for (const estilo of ESTILOS_ORDEN) {
      const con = cubiertaDePrueba({ estilo })
      const sin = cubiertaDePrueba({ estilo, autor: false })
      expect(con.piezas.some((p) => p.que === 'autor'), estilo).toBe(true)
      expect(sin.piezas.some((p) => p.que === 'autor'), estilo).toBe(false)
      expect(sin.piezas.some((p) => p.que === 'lomoAutor'), estilo).toBe(true)
      // Lo demas de la portada sigue dentro y sin pisarse.
      const portada = sin.piezas.filter((p) => p.que === 'titulo' || p.que === 'sello').map((p) => p.caja)
      for (const caja of portada) expect(dentro(caja, encoger(sin.medidas.portada, 0))).toBe(true)
    }
    // Papiro sin titulo ni autor: en la portada solo queda el sello.
    const papiro = cubiertaDePrueba({ estilo: 'papiro', titulo: false, autor: false })
    expect(papiro.piezas.filter((p) => dentro(p.caja, papiro.medidas.portada)).map((p) => p.que)).toEqual(['sello'])
  })
})

describe('las piezas de la portada, movidas a mano', () => {
  const pieza = (c: CubiertaCompuesta, que: string): Caja => {
    const p = c.piezas.find((x) => x.que === que)
    if (!p) throw new Error(`sin ${que}`)
    return p.caja
  }
  const A = 6 * IN
  const logos = { ...datosDePrueba().imagenes, sello: { ancho: 900, alto: 300 }, selloBlanco: { ancho: 900, alto: 300 } }
  const tintaDe = (c: CubiertaCompuesta, que: string): number[] => {
    const caja = pieza(c, que)
    return [...new Set(c.ops.filter((o) => o.op === 'texto' && dentro(cajaDe(o), encoger(caja, -2))).map((o) => (o.op === 'texto' ? o.gris : -1)))]
  }

  it('se mueve lo pedido, en fracciones de A; las demas se quedan donde las puso el estilo', () => {
    const quieta = cubiertaDePrueba({ estilo: 'clasico' })
    const movida = cubiertaDePrueba({ estilo: 'clasico', mover: { clasico: { titulo: { x: 0.05, y: 0.1 } } } })
    const a = pieza(quieta, 'titulo')
    const b = pieza(movida, 'titulo')
    expect(b.x - a.x).toBeCloseTo(0.05 * A, 6)
    expect(b.y - a.y).toBeCloseTo(0.1 * A, 6)
    expect(movida.movidas).toEqual({ titulo: { x: expect.closeTo(0.05, 9), y: expect.closeTo(0.1, 9) } })
    // El autor estaba anclado bajo el titulo: se ancla a donde lo puso el estilo, no lo arrastra.
    expect(pieza(movida, 'autor')).toEqual(pieza(quieta, 'autor'))
    expect(quieta.movidas).toEqual({})
  })

  it('cada estilo guarda lo suyo: lo movido en uno no mueve nada en otro', () => {
    const mover = { clasico: { titulo: { x: 0.05, y: 0.1 } } }
    expect(pieza(cubiertaDePrueba({ estilo: 'cartel', mover }), 'titulo')).toEqual(pieza(cubiertaDePrueba({ estilo: 'cartel' }), 'titulo'))
  })

  it('nada sale de lo seguro de KDP, se pida lo que se pida: en todos los estilos, piezas y direcciones', () => {
    for (const estilo of ESTILOS_ORDEN) {
      for (const que of PIEZAS_PORTADA) {
        for (const [x, y] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1.5, 1.5], [-1.5, -1.5]] as const) {
          const c = cubiertaDePrueba({ estilo, titulo: true, mover: { [estilo]: { [que]: { x, y } } } }, { imagenes: logos })
          const zona = encoger(c.medidas.portada, SEGURIDAD)
          const donde = `${estilo} ${que} ${x},${y}`
          for (const p of c.piezas.filter((q) => (PIEZAS_PORTADA as readonly string[]).includes(q.que))) expect(dentro(p.caja, zona), `${donde}: ${p.que}`).toBe(true)
          // El texto, por sus glifos: dentro de lo seguro, y nunca en la caja del codigo.
          for (const o of c.ops) if (o.op === 'texto' && cajaDe(o).x > c.medidas.espina.x + c.medidas.espina.ancho) expect(dentro(cajaDe(o), zona), donde).toBe(true)
          for (const o of c.ops) if (!dentro(cajaDe(o), c.codigo)) expect(corta(cajaDe(o), c.codigo), donde).toBe(false)
          // Lo que se apunta como movido es lo que de verdad se movio: menos de lo pedido.
          const m = c.movidas[que as QuePieza]
          if (m) expect(Math.abs(m.x) <= Math.abs(x) + 1e-9 && Math.abs(m.y) <= Math.abs(y) + 1e-9, donde).toBe(true)
        }
      }
    }
  })

  it('la tinta se vuelve a elegir donde queda: el autor, del mar oscuro al cielo claro, pasa a oscuro', () => {
    expect(tintaDe(cubiertaDePrueba(), 'autor')).toEqual([TINTA_CLARA])
    const arriba = cubiertaDePrueba({ mover: { papiro: { autor: { x: 0, y: -1.2 } } } })
    expect(pieza(arriba, 'autor').y).toBeLessThan(arriba.medidas.portada.y + arriba.medidas.portada.alto * 0.3)
    expect(tintaDe(arriba, 'autor')).toEqual([TINTA_OSCURA])
  })

  it('el titulo girado se mueve en los dos ejes', () => {
    const quieta = cubiertaDePrueba({ estilo: 'vertical' })
    const movida = cubiertaDePrueba({ estilo: 'vertical', mover: { vertical: { titulo: { x: -0.1, y: 0.05 } } } })
    expect(pieza(movida, 'titulo').x - pieza(quieta, 'titulo').x).toBeCloseTo(-0.1 * A, 6)
    expect(pieza(movida, 'titulo').y - pieza(quieta, 'titulo').y).toBeCloseTo(0.05 * A, 6)
    const giradas = (c: CubiertaCompuesta) => c.ops.filter((o) => o.op === 'texto' && o.giro === 90 && o.x > c.medidas.espina.x + c.medidas.espina.ancho)
    expect(giradas(movida).map((o) => o.x - (giradas(quieta)[0] as OpCubierta).x)[0]).toBeCloseTo(-0.1 * A, 6)
    expect(giradas(movida).map((o) => o.y - (giradas(quieta)[0] as OpCubierta).y)[0]).toBeCloseTo(0.05 * A, 6)
  })

  it('la franja crece hasta cubrir el titulo subido a mano', () => {
    const franja = (c: CubiertaCompuesta) => c.capas.find((x) => x.que === 'color' && x.caja.x >= c.medidas.portada.x - c.medidas.sangrado - 1e-6 && x.caja.y > 0)
    const quieta = cubiertaDePrueba({ estilo: 'franja' })
    const subida = cubiertaDePrueba({ estilo: 'franja', mover: { franja: { titulo: { x: 0, y: -0.3 } } } })
    const fq = franja(quieta)
    const fs = franja(subida)
    if (!fq || !fs) throw new Error('sin franja')
    expect(fs.caja.y).toBeLessThan(fq.caja.y)
    expect(fs.caja.y).toBeLessThanOrEqual(pieza(subida, 'titulo').y)
  })

  it('dos piezas que se pisan se avisan; sin mover nada, nunca', () => {
    for (const estilo of ESTILOS_ORDEN) expect(cubiertaDePrueba({ estilo }).avisos.some((a) => a.codigo === 'piezasSeTocan'), estilo).toBe(false)
    const quieta = cubiertaDePrueba({ estilo: 'clasico' })
    const dy = (pieza(quieta, 'titulo').y - pieza(quieta, 'autor').y) / A
    const encima = cubiertaDePrueba({ estilo: 'clasico', mover: { clasico: { autor: { x: 0, y: dy } } } })
    expect(encima.avisos).toContainEqual({ codigo: 'piezasSeTocan', a: 'titulo', b: 'autor' })
  })

  it('lo guardado se limpia: estilos y piezas que no existen fuera, numeros en rango, lo no movido no se guarda', () => {
    const c = normalizarCubierta({ mover: { clasico: { titulo: { x: 9, y: 'a' }, lomo: { x: 0.1, y: 0 } }, barroco: { titulo: { x: 0.1, y: 0 } }, cartel: { autor: { x: 0, y: 0 } } }, enEpub: 'si' })
    expect(c.mover).toEqual({ clasico: { titulo: { x: 1.5, y: 0 } } })
    expect(c.enEpub).toBe(false)
    expect(normalizarCubierta({ enEpub: true }).enEpub).toBe(true)
    expect(hayMovidas(c.mover)).toBe(true)
    expect(hayMovidas({ cartel: {} })).toBe(false)
  })
})

describe('el PDF de la cubierta', () => {
  const c = cubiertaDePrueba()
  const bytes = pdfDeCubierta(c, 30)
  const pdf = leerPdf(bytes)

  it('una pagina: la hoja con su sangrado, y el corte 1/8 in dentro', () => {
    const [p] = paginas(pdf)
    expect(lista(p?.get('MediaBox')).map(numero)).toEqual([0, 0, 920.16, 666])
    expect(lista(p?.get('TrimBox')).map(numero)).toEqual([9, 9, 911.16, 657])
  })

  it('el texto va en vectores: lo que se pinta es lo que la cubierta compuso, girado el del lomo', () => {
    const pintado = textosPintados(pdf)[0]?.map((x) => x.texto).join('') ?? ''
    const compuesto = c.ops.flatMap((o) => (o.op === 'texto' ? o.glifos.map((g) => g.texto) : [])).join('')
    expect(pintado).toBe(compuesto)
    expect(pintado).toContain('LUCÍAFERRERONDARRA')
  })

  it('dos generaciones con el mismo reloj dan los mismos bytes', () => {
    expect(pdfDeCubierta(cubiertaDePrueba(), 30)).toEqual(bytes)
  })
})

describe('la plantilla del autor (Papiro), al milimetro', () => {
  it('el sello en la linea base de 13 mm, de 1/6 A; el autor, 1/10 A por encima del sello', () => {
    const c = cubiertaDePrueba({}, { imagenes: { ...datosDePrueba().imagenes, sello: { ancho: 900, alto: 300 } } })
    const m = c.medidas
    const A = m.portada.ancho
    const sello = c.piezas.find((p) => p.que === 'sello')?.caja as Caja
    const pie = m.portada.y + m.portada.alto
    expect(pie - (sello.y + sello.alto)).toBeCloseTo(13 * MM, 9)
    expect(sello.ancho).toBeCloseTo(A / 6, 9)
    const autor = c.ops.find((o) => o.op === 'texto' && o.y < sello.y && o.x > m.portada.x) as Extract<OpCubierta, { op: 'texto' }>
    expect(sello.y - autor.y).toBeCloseTo(A / 10, 9)
    // Centrados en la portada.
    expect(sello.x + sello.ancho / 2).toBeCloseTo(m.portada.x + A / 2, 6)
  })

  it('el logo de la contraportada: 1/3 A, a 1/10 A del borde de fuera, sobre la linea base', () => {
    const c = cubiertaDePrueba({}, { imagenes: { ...datosDePrueba().imagenes, sello: { ancho: 900, alto: 300 } } })
    const m = c.medidas
    const logo = c.piezas.find((p) => p.que === 'selloContra')?.caja as Caja
    expect(logo.ancho).toBeCloseTo(m.contra.ancho / 3, 9)
    expect(logo.x - m.contra.x).toBeCloseTo(m.contra.ancho / 10, 9)
    expect(m.contra.y + m.contra.alto - (logo.y + logo.alto)).toBeCloseTo(13 * MM, 9)
  })
})

describe('el dibujo y su resolucion', () => {
  it('se avisa con numeros: a que ppi sale y cuantos pixeles hacen falta para 300', () => {
    const c = cubiertaDePrueba({}, { imagenes: { portada: { ancho: 1600, alto: 2560 } } })
    expect(c.avisos).toContainEqual({ codigo: 'resolucionArte', rol: 'portada', ppi: 261, pixeles: { ancho: 1838, alto: 2775 } })
    expect(cubiertaDePrueba().avisos.some((a) => a.codigo === 'resolucionArte')).toBe(false)
  })

  it('el velo deja el contraste un 5 % por encima del umbral, no justo en el (el redondeo lo dejaria debajo)', () => {
    // Un dibujo gris liso, de luminancia 0,6, y el titulo en claro a la fuerza: hace falta velo.
    const gris = { ancho: 1838, alto: 2775, luz: { ancho: 1, alto: 1, valores: [0.6] } }
    const c = cubiertaDePrueba({ estilo: 'clasico', tintas: { titulo: 'clara' } }, { imagenes: { portada: gris } })
    const velo = c.capas.find((x) => x.que === 'velo')
    if (velo?.que !== 'velo') throw new Error('sin velo')
    const logrado = contraste(1, 0.6 * (1 - velo.alfa))
    expect(logrado).toBeGreaterThanOrEqual(3 * 1.05 - 0.02)
    expect(logrado).toBeLessThan(3 * 1.05 + 0.1)
  })

  it('el velo lleva el contraste un poco por encima del umbral: el titulo vertical se lee sin aviso', () => {
    expect(cubiertaDePrueba({ estilo: 'vertical' }).avisos.some((a) => a.codigo === 'contrasteBajo')).toBe(false)
  })
})

describe('el ISBN, comprobado como lo pide la agencia', () => {
  it('Bookland: un ISBN de 13 cifras empieza por 978 o 979; un EAN de otra cosa no vale', () => {
    expect(revisarIsbn('979-10-90636-07-1')).toEqual({ estado: 'bien', cifras: '9791090636071' })
    // Un EAN-13 con su control bien, pero de un producto, no de un libro.
    expect(controlEan('400638133393')).toBe(1)
    expect(revisarIsbn('4006381333931')).toEqual({ estado: 'prefijo' })
    expect(cifrasDeIsbn('4006381333931')).toBeNull()
    expect(isbnValido('4006381333931')).toBe(false)
    expect(isbnValido('978-84-09-12345-2')).toBe(true)
  })

  it('el digito de control: se dice cual tocaria, en el de 13 y en el de 10 (que puede ser X)', () => {
    expect(revisarIsbn('978-84-09-12345-3')).toEqual({ estado: 'control', esperado: '2' })
    expect(revisarIsbn('0-306-40615-3')).toEqual({ estado: 'control', esperado: '2' })
    expect(revisarIsbn('0-8044-2957-X')).toEqual({ estado: 'bien', cifras: '9780804429573' })
    expect(revisarIsbn('0-8044-2957-5')).toEqual({ estado: 'control', esperado: 'X' })
    // Cuando la suma ya es multiplo de 11, el control es 0 (no 11).
    expect(revisarIsbn('0-306-40616-0').estado).toBe('bien')
    expect(revisarIsbn('0-306-40616-1')).toEqual({ estado: 'control', esperado: '0' })
  })

  it('la forma: vacio, o ni 13 ni 10 cifras', () => {
    expect(revisarIsbn('  ')).toEqual({ estado: 'vacio' })
    expect(revisarIsbn('978-84-09-1234')).toEqual({ estado: 'forma' })
    expect(revisarIsbn('ISBN 978-84-09-12345-2')).toEqual({ estado: 'forma' })
  })
})

describe('el codigo, segun la norma EAN-13', () => {
  const barrasDe = (ops: readonly OpCubierta[]) => ops.filter((o): o is Extract<OpCubierta, { op: 'rect' }> => o.op === 'rect' && o.gris === 0)

  it('la zona de silencio: 11 modulos en blanco a la izquierda y 7 a la derecha, dentro de la caja blanca, sin nada encima', () => {
    for (const c of [cubiertaDePrueba(), cubiertaDePrueba({ estilo: 'franja' }, { corte: { ancho: 5 * IN, alto: 8 * IN }, isbn: '979-10-90636-07-1' })]) {
      const barras = barrasDe(c.ops)
      const izq = Math.min(...barras.map((b) => b.x))
      const der = Math.max(...barras.map((b) => b.x + b.ancho))
      expect(der - izq).toBeCloseTo(95 * MODULO, 6)
      const blanca = c.ops.find((o) => o.op === 'rect' && o.gris === 1)
      if (blanca?.op !== 'rect') throw new Error('sin caja blanca')
      expect(izq - blanca.x).toBeGreaterThanOrEqual(SILENCIO.izquierda * MODULO)
      expect(blanca.x + blanca.ancho - der).toBeGreaterThanOrEqual(SILENCIO.derecha * MODULO)
      // A la altura de las barras de las cifras, en la zona de silencio no hay nada mas que blanco.
      const y = Math.min(...barras.map((b) => b.y))
      const zonas = [
        { x: izq - SILENCIO.izquierda * MODULO, y, ancho: SILENCIO.izquierda * MODULO, alto: ALTO_BARRAS },
        { x: der, y, ancho: SILENCIO.derecha * MODULO, alto: ALTO_BARRAS },
      ]
      for (const z of zonas) expect(c.ops.filter((o) => o !== blanca && corta(cajaDe(o), z))).toEqual([])
      // Ninguna cifra pisa una barra; la primera va a la izquierda de la guarda, en la zona de silencio.
      const cifras = c.ops.filter((o) => o.op === 'texto' && o.cuerpo === 8.5)
      expect(cifras).toHaveLength(13)
      for (const t of cifras) for (const b of barras) expect(corta(cajaDe(t), cajaDe(b))).toBe(false)
      const primera = cajaDe(cifras[0] as OpCubierta)
      expect(primera.x + primera.ancho).toBeLessThan(izq)
      expect(primera.x).toBeGreaterThan(izq - SILENCIO.izquierda * MODULO)
    }
  })

  it('la contraportada y el codigo suelto son el mismo codigo, solo que en otro sitio', () => {
    const c = cubiertaDePrueba()
    const enCaja = c.ops.filter((o) => dentro(cajaDe(o), c.codigo))
    const suelto = componerCodigo({ x: 0, y: 0, ancho: c.codigo.ancho, alto: c.codigo.alto }, { cifras: '9788409123452', arriba: 'ISBN 978-84-09-12345-2', conCifras: true, gris: 0 }, F)
    expect(suelto).toHaveLength(enCaja.length)
    suelto.forEach((o, i) => {
      const e = enCaja[i] as OpCubierta
      expect(o.x + c.codigo.x).toBeCloseTo(e.x, 9)
      expect(o.y + c.codigo.y).toBeCloseTo(e.y, 9)
    })
    expect(izquierdaDeBarras(c.codigo) - c.codigo.x).toBeCloseTo((c.codigo.ancho - 95 * MODULO) / 2, 9)
  })

  it('el SVG: 50,8 × 30,48 mm, las barras como rectangulos donde las compuso, y el texto en contornos, sin fuentes', () => {
    const caja = { x: 0, y: 0, ancho: CAJA_CODIGO.ancho, alto: CAJA_CODIGO.alto }
    const ops = componerCodigo(caja, { cifras: '9788409123452', arriba: 'ISBN 978-84-09-12345-2', conCifras: true, gris: 0 }, F)
    const svg = svgDelCodigo(ops, caja, F, 'ISBN 978-84-09-12345-2')
    expect(svg).toMatch(/<svg [^>]*width="50.8mm" height="30.48mm" viewBox="0 0 144 86.4"/u)
    expect(svg).toContain('<title>ISBN 978-84-09-12345-2</title>')
    expect(svg).not.toContain('<text')
    const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-f]{6})"\/>/gu)]
    expect(rects).toHaveLength(1 + barrasEan13('9788409123452').length)
    expect(rects[0]?.slice(1)).toEqual(['0', '0', '144', '86.4', '#ffffff'])
    const barras = barrasDe(ops)
    rects.slice(1).forEach((r, i) => {
      const b = barras[i] as (typeof barras)[number]
      expect(Number(r[1])).toBeCloseTo(b.x, 3)
      expect(Number(r[3])).toBeCloseTo(b.ancho, 3)
      expect(r[5]).toBe('#000000')
    })
    // Cada glifo, con su escala exacta: 7,5 pt arriba y 8,5 pt en las cifras.
    const escalas = [...svg.matchAll(/<path transform="matrix\(([-\d.e]+) /gu)].map((m) => Number(m[1]))
    expect(escalas.filter((k) => Math.abs(k - 8.5 / F.jost.upm) < 1e-7)).toHaveLength(13)
    expect(escalas.filter((k) => Math.abs(k - 7.5 / F.jost.upm) < 1e-7).length).toBeGreaterThan(15)
    // La fuente mide con la y hacia arriba y el SVG hacia abajo: la escala vertical va en negativo.
    for (const m of svg.matchAll(/<path transform="matrix\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) /gu)) expect([Number(m[2]), Number(m[3]), Number(m[4])]).toEqual([0, 0, -Number(m[1])])
  })

  it('el SVG empieza en la esquina de su caja, este donde este la caja en la hoja', () => {
    const c = cubiertaDePrueba()
    const enCaja = c.ops.filter((o) => dentro(cajaDe(o), c.codigo))
    const svg = svgDelCodigo(enCaja, c.codigo, F, 'ISBN')
    const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)"/gu)].map((m) => [Number(m[1]), Number(m[2])])
    expect(rects[0]).toEqual([0, 0])
    for (const [x, y] of rects) {
      expect(x).toBeLessThan(c.codigo.ancho)
      expect(y).toBeLessThan(c.codigo.alto)
    }
    const origenes = [...svg.matchAll(/<path transform="matrix\([^ ]+ [^ ]+ [^ ]+ [^ ]+ ([-\d.]+) ([-\d.]+)\)/gu)].map((m) => [Number(m[1]), Number(m[2])])
    for (const [x, y] of origenes) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(c.codigo.ancho)
      expect(y).toBeLessThan(c.codigo.alto)
    }
  })
})

describe('el codigo, por dentro', () => {
  it('las barras de guarda bajan cinco modulos mas que las de las cifras', () => {
    const c = cubiertaDePrueba()
    const barras = c.ops.filter((o): o is Extract<OpCubierta, { op: 'rect' }> => o.op === 'rect' && o.gris === 0)
    const altos = [...new Set(barras.map((b) => Math.round(b.alto * 1000) / 1000))].sort((a, b) => a - b)
    expect(altos).toHaveLength(2)
    expect((altos[1] as number) - (altos[0] as number)).toBeCloseTo(5 * 0.33 * 0.9 * MM, 2)
    expect(barras.filter((b) => b.alto > (altos[0] as number) + 0.01)).toHaveLength(6)
  })
})

describe('el PDF de la cubierta, por dentro', () => {
  const c = cubiertaDePrueba()
  const pdf = leerPdf(pdfDeCubierta(c, 30))
  const contenido = (): string => {
    const [p] = paginas(pdf)
    const ref = p?.get('Contents')
    const o = ref?.t === 'ref' ? pdf.objetos.get(ref.v) : undefined
    return o?.flujo ? String.fromCharCode(...o.flujo) : ''
  }

  it('el lomo de arriba abajo lleva la matriz girada (0 -1 1 0); el texto derecho, la de siempre', () => {
    const s = contenido()
    expect(s).toMatch(/^0 -1 1 0 \S+ \S+ Tm$/mu)
    expect(s).toMatch(/^1 0 0 1 \S+ \S+ Tm$/mu)
    expect(s).not.toMatch(/^0 1 -1 0 \S+ \S+ Tm$/mu)
  })

  it('el fondo va en RGB, como se subio el dibujo', () => {
    const imagenes = [...pdf.objetos.values()].filter((o) => o.flujo && dic(o.dic).get('Subtype')?.t === 'nombre' && nombreDe(dic(o.dic).get('Subtype')) === 'Image')
    expect(imagenes.map((o) => nombreDe(dic(o.dic).get('ColorSpace')))).toEqual(['DeviceRGB'])
  })
})
