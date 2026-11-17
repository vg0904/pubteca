import { describe, expect, it } from 'vitest'
import { alineada, cajaDe, colocar, conTamano, esquinaEn, HUECO, sinPisar, tirarDeEsquina, vecinas, zonaDe, type Guia } from '../src/app/cubierta/iman'
import { ASA, COLOR_GUIA, COLOR_LIMITE, COLOR_MARCO, cursorDeEsquina, pintarCapa, type EstadoCapa, type PincelCapa } from '../src/app/cubierta/capa'
import { LINEA_BASE, type Caja, type CubiertaCompuesta } from '../src/core/impreso/cubierta'
import type { ConfigCubierta, PiezaContra, Punto, QuePieza } from '../src/core/impreso/cubierta-config'
import { cubiertaDePrueba } from '../scripts/cubierta-prueba'

// Colocar a mano con el raton: el iman (centros, margenes, otras piezas, su
// sitio), el tope entre piezas, los botones de alinear y las asas. Cada
// resultado se vuelve a componer: lo que el iman pide es lo que sale.

const MM = 72 / 25.4
const c = cubiertaDePrueba({ estilo: 'clasico' })
const A = c.medidas.portada.ancho
const derecha = (k: Caja): number => k.x + k.ancho
const abajo = (k: Caja): number => k.y + k.alto
/** La pieza pedida en `pedida`, desplazada `dx`, `dy` puntos desde donde esta. */
const pedirDesde = (dx: number, dy: number, base: Punto = { x: 0, y: 0 }): Punto => ({ x: base.x + dx / A, y: base.y + dy / A })
/** Compone otra vez con lo pedido: la caja donde la pone de verdad el compositor. */
function compuesta(que: QuePieza | PiezaContra, a: Punto & { escala?: number }, extra: Partial<ConfigCubierta> = {}): CubiertaCompuesta {
  if (que === 'codigo' || que === 'selloContra' || que === 'sinopsis') return cubiertaDePrueba({ estilo: 'clasico', ...extra, contra: { [que]: { x: a.x, y: a.y, escala: a.escala ?? 1 } } })
  return cubiertaDePrueba({ estilo: 'clasico', ...extra, mover: { clasico: { [que]: { x: a.x, y: a.y } } } })
}

describe('el iman', () => {
  const umbral = 2 * MM

  // Sin el autor, que va justo debajo del titulo: el titulo puede bajar hasta el medio.
  const sinAutor = cubiertaDePrueba({ estilo: 'clasico', autor: false })

  it('al centro de su cara: el titulo, a 1,5 mm del medio de la portada, se pega; con Alt, no', () => {
    const k = cajaDe(sinAutor, 'titulo')
    const p = c.medidas.portada
    const dy = p.y + p.alto / 2 - (k.y + k.alto / 2) + 1.5 * MM
    const con = colocar(sinAutor, 'titulo', pedirDesde(0, dy), { umbral, iman: true })
    expect(con.caja.y + con.caja.alto / 2).toBeCloseTo(p.y + p.alto / 2, 6)
    expect(con.guias).toContainEqual(expect.objectContaining({ eje: 'y', tipo: 'centro', en: expect.closeTo(p.y + p.alto / 2, 6) }))
    const sin = colocar(sinAutor, 'titulo', pedirDesde(0, dy), { umbral, iman: false })
    expect(sin.caja.y + sin.caja.alto / 2).toBeCloseTo(p.y + p.alto / 2 + 1.5 * MM, 6)
    expect(sin.guias.filter((g) => g.tipo !== 'limite')).toEqual([])
    // Y el compositor la pone donde dijo el iman.
    expect(cajaDe(compuesta('titulo', con.movida, { autor: false }), 'titulo').y).toBeCloseTo(con.caja.y, 4)
  })

  it('lejos de todo (mas que el umbral), no se pega a nada', () => {
    const k = cajaDe(sinAutor, 'titulo')
    const p = c.medidas.portada
    const dy = p.y + p.alto / 2 - (k.y + k.alto / 2) + 4 * MM
    expect(colocar(sinAutor, 'titulo', pedirDesde(0, dy), { umbral, iman: true }).caja.y).toBeCloseTo(k.y + dy, 6)
  })

  it('al margen de los estilos: 1/10 A dentro del corte por los lados, y la linea base por abajo', () => {
    const sello = cajaDe(c, 'sello')
    const p = c.medidas.portada
    // El sello de la portada, a 1 mm del margen de la izquierda.
    const r = colocar(c, 'sello', pedirDesde(p.x + A / 10 - sello.x + 1 * MM, 0), { umbral, iman: true })
    expect(r.caja.x).toBeCloseTo(p.x + A / 10, 6)
    expect(r.guias).toContainEqual(expect.objectContaining({ eje: 'x', tipo: 'margen', en: expect.closeTo(p.x + A / 10, 6) }))
    // Y a la derecha.
    const r2 = colocar(c, 'sello', pedirDesde(derecha(p) - A / 10 - derecha(sello) - 1 * MM, 0), { umbral, iman: true })
    expect(derecha(r2.caja)).toBeCloseTo(derecha(p) - A / 10, 6)
    // El codigo, con su pie a 1 mm de la linea base de la contraportada.
    const k = cajaDe(c, 'codigo')
    const r3 = colocar(c, 'codigo', pedirDesde(0, abajo(c.medidas.contra) - LINEA_BASE - abajo(k) - 1 * MM), { umbral, iman: true })
    expect(abajo(r3.caja)).toBeCloseTo(abajo(c.medidas.contra) - LINEA_BASE, 6)
  })

  it('a las otras piezas: el pie del sello, con el del codigo', () => {
    const sello = cajaDe(c, 'selloContra')
    const codigo = cajaDe(c, 'codigo')
    const dy = abajo(codigo) - abajo(sello) + 1.2 * MM
    const r = colocar(c, 'selloContra', pedirDesde(0, dy), { umbral, iman: true })
    expect(abajo(r.caja)).toBeCloseTo(abajo(codigo), 6)
    const g = r.guias.find((x) => x.tipo === 'pieza' && x.eje === 'y')
    // La guia va de una pieza a la otra.
    expect(g).toMatchObject({ en: expect.closeTo(abajo(codigo), 6), desde: expect.closeTo(sello.x, 6), hasta: expect.closeTo(derecha(codigo), 6) })
  })

  it('a su sitio: movida 1 mm, vuelve a cero', () => {
    const movida = compuesta('autor', { x: 0, y: 0.05 })
    const r = colocar(movida, 'autor', { x: 0, y: (1 * MM) / A }, { umbral, iman: true })
    expect(r.movida.y).toBeCloseTo(0, 9)
    expect(r.guias).toContainEqual(expect.objectContaining({ eje: 'y', tipo: 'sitio' }))
  })

  it('las vecinas: las otras piezas de su cara, nunca ella misma', () => {
    expect(vecinas(c, 'autor').map((v) => v.que).sort()).toEqual(['sello', 'titulo'])
    expect(vecinas(c, 'codigo').map((v) => v.que).sort()).toEqual(['selloContra', 'sinopsis'])
  })

  it('nunca sale de lo seguro, con iman o sin el, y la guia lo dice', () => {
    const z = zonaDe(c.medidas.portada)
    for (const iman of [true, false]) {
      const r = colocar(c, 'sello', { x: 5, y: 5 }, { umbral, iman })
      expect([derecha(r.caja), abajo(r.caja)]).toEqual([expect.closeTo(derecha(z), 6), expect.closeTo(abajo(z), 6)])
      expect(r.guias.filter((g) => g.tipo === 'limite')).toHaveLength(2)
    }
  })
})

describe('ninguna pisa a otra', () => {
  it('el sello de la contraportada, arrastrado contra el codigo, se para a 3 mm, del lado del que venia', () => {
    const sello = cajaDe(c, 'selloContra')
    const codigo = cajaDe(c, 'codigo')
    const r = colocar(c, 'selloContra', pedirDesde(codigo.x - sello.x + 10, 0), { umbral: 0, iman: false })
    // 3 mm de aire entre las dos.
    expect(codigo.x - derecha(r.caja)).toBeCloseTo(3 * MM, 6)
    expect(r.caja.y).toBeCloseTo(sello.y, 6)
    // Y si apenas se mete (el choque, al final del camino), tambien se para.
    const justo = colocar(c, 'selloContra', pedirDesde(codigo.x - HUECO - derecha(sello) + 2, 0), { umbral: 0, iman: false })
    expect(derecha(justo.caja)).toBeCloseTo(codigo.x - HUECO, 6)
    const hecha = compuesta('selloContra', r.movida)
    expect(hecha.avisos.filter((a) => a.codigo === 'piezasSeTocan')).toEqual([])
  })

  it('aunque el puntero salte la pieza entera en un cuadro, se para antes', () => {
    const sello = cajaDe(c, 'selloContra')
    const codigo = cajaDe(c, 'codigo')
    const r = colocar(c, 'selloContra', pedirDesde(derecha(codigo) - sello.x - sello.ancho + 2, 0), { umbral: 0, iman: false })
    expect(derecha(r.caja)).toBeCloseTo(codigo.x - HUECO, 6)
  })

  it('las que ya se pisaban no se paran: se pueden separar', () => {
    const sello = cajaDe(c, 'selloContra')
    const codigo = cajaDe(c, 'codigo')
    const encima = compuesta('selloContra', { x: (codigo.x - sello.x) / A, y: 0 })
    const k = cajaDe(encima, 'selloContra')
    const r = colocar(encima, 'selloContra', pedirDesde(0, -4 * MM, { x: (codigo.x - sello.x) / A, y: 0 }), { umbral: 0, iman: false })
    expect(r.caja.y).toBeCloseTo(k.y - 4 * MM, 6)
  })

  it('topa y resbala: en diagonal contra otra, se para en x y sigue en y', () => {
    const otra: Caja = { x: 40, y: 0, ancho: 60, alto: 100 }
    const previa: Caja = { x: 0, y: 40, ancho: 30, alto: 20 }
    expect(sinPisar({ ...previa, x: 50, y: 70 }, previa, [otra])).toEqual({ ...previa, x: expect.closeTo(40 - HUECO - 30, 9), y: expect.closeTo(70, 9) })
    // Lejos por encima de la otra, no la toca.
    expect(sinPisar({ ...previa, x: 50, y: -100 }, { ...previa, y: -100 }, [otra])).toEqual({ ...previa, x: 50, y: -100 })
  })
})

describe('alinear en su cara', () => {
  const sinSinopsis = cubiertaDePrueba({ estilo: 'clasico', sinopsis: false })

  it('al centro y al margen de arriba: el compositor la pone ahi', () => {
    const p = c.medidas.portada
    const a = alineada(c, 'sello', 'centro')
    const k = cajaDe(compuesta('sello', a), 'sello')
    expect(k.x + k.ancho / 2).toBeCloseTo(p.x + p.ancho / 2, 4)
    const arriba = alineada(sinSinopsis, 'codigo', 'arriba')
    const kc = cajaDe(compuesta('codigo', arriba, { sinopsis: false }), 'codigo')
    expect(kc.y).toBeCloseTo(c.medidas.contra.y + A / 10, 4)
    const sinAutor = cubiertaDePrueba({ estilo: 'clasico', autor: false })
    const medio = alineada(sinAutor, 'titulo', 'medio')
    const kt = cajaDe(compuesta('titulo', medio, { autor: false }), 'titulo')
    expect(kt.y + kt.alto / 2).toBeCloseTo(p.y + p.alto / 2, 4)
  })

  it('si en el camino hay otra pieza, se para a 3 mm de ella', () => {
    const sello = cajaDe(c, 'selloContra')
    const a = alineada(c, 'codigo', 'izquierda')
    const k = cajaDe(compuesta('codigo', a), 'codigo')
    expect(k.x).toBeCloseTo(derecha(sello) + HUECO, 4)
  })

  it('abajo: el pie en la linea base; a la derecha: a 1/10 A del corte', () => {
    const sinCodigo = cubiertaDePrueba({ estilo: 'clasico', codigo: 'kdp' })
    const p = c.medidas.portada
    const a = alineada(c, 'titulo', 'abajo')
    // El titulo baja hasta tocar al autor (a 3 mm): no pisa.
    const kt = cajaDe(compuesta('titulo', a), 'titulo')
    expect(abajo(kt)).toBeLessThanOrEqual(cajaDe(c, 'autor').y - HUECO + 1e-6)
    const s = alineada(sinCodigo, 'sinopsis', 'derecha')
    const ks = cajaDe(cubiertaDePrueba({ estilo: 'clasico', codigo: 'kdp', contra: { sinopsis: { ...s, escala: 1 } } }), 'sinopsis')
    expect(derecha(ks)).toBeCloseTo(derecha(c.medidas.contra) - A / 10, 4)
    expect(abajo(cajaDe(compuesta('sello', alineada(c, 'sello', 'abajo')), 'sello'))).toBeCloseTo(abajo(p) - LINEA_BASE, 4)
  })
})

describe('el tamaño con las asas', () => {
  it('desde su ancla, el tamaño cambia sin moverla: el codigo crece desde abajo a la derecha', () => {
    const k = cajaDe(c, 'codigo')
    const a = conTamano(c, 'codigo', 1.2)
    expect(a).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(0, 9), escala: 1.2 })
    const nueva = cajaDe(compuesta('codigo', a), 'codigo')
    expect([derecha(nueva), abajo(nueva)]).toEqual([expect.closeTo(derecha(k), 4), expect.closeTo(abajo(k), 4)])
  })

  it('con la esquina contraria fija: tirar de la de abajo a la derecha deja quieta la de arriba a la izquierda', () => {
    const k = cajaDe(c, 'selloContra')
    const a = tirarDeEsquina(c, 'selloContra', 'se', { x: derecha(k) + k.ancho * 0.25, y: abajo(k) + k.alto * 0.25 })
    expect(a.escala).toBeCloseTo(1.25, 6)
    const nueva = cajaDe(compuesta('selloContra', a), 'selloContra')
    // El sello de texto no crece justo en proporcion (la letra): menos de 0,1 mm.
    expect(Math.abs(nueva.x - k.x) + Math.abs(nueva.y - k.y)).toBeLessThan(0.3)
    expect(nueva.ancho).toBeCloseTo(k.ancho * 1.25, 3)
  })

  it('no crece encima de otra: el codigo para a 3 mm de la sinopsis', () => {
    // La sinopsis, bajada hasta 10 mm del codigo.
    const s0 = cajaDe(c, 'sinopsis')
    const bajada = { x: 0, y: (cajaDe(c, 'codigo').y - 10 * MM - abajo(s0)) / A, escala: 1 }
    const k = cubiertaDePrueba({ estilo: 'clasico', contra: { sinopsis: bajada } })
    const sinopsis = cajaDe(k, 'sinopsis')
    const a = conTamano(k, 'codigo', 1.5)
    expect(a.escala).toBeLessThan(1.5)
    expect(a.escala).toBeGreaterThan(1)
    const nueva = cajaDe(cubiertaDePrueba({ estilo: 'clasico', contra: { sinopsis: bajada, codigo: a } }), 'codigo')
    expect(nueva.y).toBeCloseTo(abajo(sinopsis) + HUECO, 3)
    // Encoger, siempre se puede.
    expect(conTamano(k, 'codigo', 0.9).escala).toBe(0.9)
  })

  it('las asas: la esquina mas cercana al puntero, a menos del radio', () => {
    const k = cajaDe(c, 'sinopsis')
    expect(esquinaEn(c, 'sinopsis', k.x + 1, k.y - 1, 4)).toBe('no')
    expect(esquinaEn(c, 'sinopsis', derecha(k) - 2, abajo(k) + 2, 4)).toBe('se')
    expect(esquinaEn(c, 'sinopsis', k.x + k.ancho / 2, k.y, 4)).toBeNull()
  })
})

describe('la capa que ayuda a colocar (no se imprime)', () => {
  /** Un lienzo de mentira que apunta los rectangulos, las rayas y los textos. */
  function lienzo() {
    const rects: { tipo: 'stroke' | 'fill'; x: number; y: number; w: number; h: number; color: string }[] = []
    const rayas: { color: string; puntos: number[] }[] = []
    const textos: string[] = []
    let puntos: number[] = []
    const ctx = {
      lineWidth: 1,
      strokeStyle: '',
      fillStyle: '',
      font: '',
      textBaseline: 'alphabetic',
      setTransform: () => undefined,
      clearRect: () => undefined,
      setLineDash: () => undefined,
      beginPath: () => void (puntos = []),
      moveTo: (x: number, y: number) => void puntos.push(x, y),
      lineTo: (x: number, y: number) => void puntos.push(x, y),
      stroke: () => void rayas.push({ color: String(ctx.strokeStyle), puntos }),
      strokeRect: (x: number, y: number, w: number, h: number) => void rects.push({ tipo: 'stroke', x, y, w, h, color: String(ctx.strokeStyle) }),
      fillRect: (x: number, y: number, w: number, h: number) => void rects.push({ tipo: 'fill', x, y, w, h, color: String(ctx.fillStyle) }),
      fillText: (t: string) => void textos.push(t),
      measureText: (t: string) => ({ width: t.length * 6 }),
    }
    return { ctx: ctx as unknown as PincelCapa, rects, rayas, textos }
  }
  const quieto: EstadoCapa = { dentro: false, sobre: null, elegida: null, nombre: '', guias: [], arrastrando: false }

  it('fuera de la vista y sin elegida, nada; con el raton dentro, un contorno por cada pieza que se mueve', () => {
    const a = lienzo()
    pintarCapa(a.ctx, c, 1, 1, quieto, 100, 100)
    expect(a.rects).toEqual([])
    const b = lienzo()
    pintarCapa(b.ctx, c, 1, 1, { ...quieto, dentro: true }, 100, 100)
    // Dos trazos (claro y de color) por pieza: titulo, autor, sello, codigo, sello y sinopsis de la contraportada.
    expect(b.rects.filter((r) => r.color === COLOR_MARCO)).toHaveLength(6)
    // Mientras se arrastra, sin contornos: solo estorbarian.
    const d = lienzo()
    pintarCapa(d.ctx, c, 1, 1, { ...quieto, dentro: true, arrastrando: true }, 100, 100)
    expect(d.rects).toEqual([])
  })

  it('la elegida lleva su nombre, y asas solo si es de la contraportada', () => {
    const portada = lienzo()
    pintarCapa(portada.ctx, c, 1, 1, { ...quieto, elegida: 'titulo', nombre: 'Título' }, 100, 100)
    expect(portada.textos).toEqual(['Título'])
    expect(portada.rects.filter((r) => r.tipo === 'fill' && r.color === '#ffffff')).toHaveLength(0)
    const contra = lienzo()
    pintarCapa(contra.ctx, c, 2, 1, { ...quieto, elegida: 'codigo', nombre: 'Código' }, 100, 100)
    const asas = contra.rects.filter((r) => r.tipo === 'fill' && r.color === '#ffffff')
    expect(asas).toHaveLength(4)
    // En las esquinas del marco (la caja, con 3 px de aire), del tamaño de ASA.
    const k = cajaDe(c, 'codigo')
    expect(asas.map((r) => [r.x + r.w / 2, r.y + r.h / 2])).toContainEqual([expect.closeTo(k.x * 2 - 3, 6), expect.closeTo(k.y * 2 - 3, 6)])
    expect(asas[0]?.w).toBe(ASA)
  })

  it('las guias: magenta las del iman, naranja el borde de lo seguro; de una punta a la otra', () => {
    const a = lienzo()
    const guias: Guia[] = [
      { eje: 'x', en: 10, desde: 0, hasta: 50, tipo: 'centro' },
      { eje: 'y', en: 20, desde: 5, hasta: 30, tipo: 'limite' },
    ]
    pintarCapa(a.ctx, c, 2, 1, { ...quieto, guias }, 100, 100)
    expect(a.rayas).toEqual([
      { color: COLOR_GUIA, puntos: [20, 0, 20, 100] },
      { color: COLOR_LIMITE, puntos: [10, 40, 60, 40] },
    ])
  })

  it('el cursor de cada esquina: en diagonal, hacia donde crece', () => {
    expect(['no', 'ne', 'so', 'se'].map(cursorDeEsquina)).toEqual(['nwse-resize', 'nesw-resize', 'nesw-resize', 'nwse-resize'])
  })
})
