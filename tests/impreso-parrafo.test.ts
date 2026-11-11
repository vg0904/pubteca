import { describe, expect, it } from 'vitest'
import { Componedor, trozosDeHtml, type Linea, type OpcionesParrafo } from '../src/core/impreso/parrafo'
import { enLinea } from '../src/core/texto'
import { azar, fuentes, parrafo } from './impreso/ayuda'

// Componer un parrafo con Knuth-Plass, y las reglas de oficio que viven en el
// parrafo. Cada regla se prueba sobre muchos parrafos inventados con medidas
// estrechas, que es donde aparecen los problemas.

const es = new Componedor(fuentes(), 'es')
const en = new Componedor(fuentes(), 'en')
const JUSTO: Omit<OpcionesParrafo, 'ancho'> = { cuerpo: 10.5, modo: 'justificado', partir: true }

/** Muchos parrafos inventados a varias medidas. */
function muchos(c: Componedor, semilla: number, n: number, final?: string): Linea[][] {
  const r = azar(semilla)
  const salida: Linea[][] = []
  for (let i = 0; i < n; i++) {
    const texto = parrafo(r, 20 + Math.floor(r() * 80)).replace(/\.$/u, final ? ` ${final}.` : '.')
    const ancho = 140 + Math.floor(r() * 160)
    salida.push([...c.parrafo(trozosDeHtml(enLinea(texto)), { ...JUSTO, ancho }).lineas])
  }
  return salida
}

/** Donde acaba de verdad lo que se pinta en la linea. */
function finPintado(l: Linea): number {
  const p = l.piezas[l.piezas.length - 1]
  if (!p) return 0
  const f = fuentes()[p.cara]
  return p.x + p.glifos.reduce((s, g) => s + (g.avance * 10.5) / f.upm, 0)
}

describe('las lineas de un parrafo justificado', () => {
  it('todas menos la ultima llegan justo al margen', () => {
    for (const lineas of muchos(es, 1, 60)) {
      // Una linea de una sola palabra no tiene espacios que estirar: pasa con
      // medidas tan estrechas como estas (las de un libro son el doble).
      for (const l of lineas.slice(0, -1)) if (l.texto.includes(' ')) expect(finPintado(l), l.texto).toBeCloseTo(l.ancho, 6)
      const ultima = lineas[lineas.length - 1] as Linea
      expect(finPintado(ultima)).toBeLessThanOrEqual(ultima.ancho + 1e-6)
    }
  })

  it('ninguna se sale', () => {
    for (const lineas of muchos(es, 2, 60)) for (const l of lineas) expect(l.desbordada, l.texto).toBe(false)
  })

  it('el texto de las lineas, juntado, es el del parrafo', () => {
    const r = azar(3)
    const texto = parrafo(r, 120)
    const p = es.parrafo(trozosDeHtml(enLinea(texto)), { ...JUSTO, ancho: 200 })
    const junto = p.lineas.map((l) => (l.guion ? l.texto.slice(0, -1) : l.texto + ' ')).join('').trim()
    expect(junto).toBe(texto)
  })

  it('la sangria empuja la primera linea', () => {
    const p = es.parrafo(trozosDeHtml('Hola, mundo de mareas quietas.'), { ...JUSTO, ancho: 300, sangria: 14.7 })
    expect(p.lineas[0]?.piezas[0]?.x).toBeCloseTo(14.7, 6)
  })
})

describe('regla: nunca tres lineas seguidas acabadas en guion', () => {
  it('en cientos de parrafos estrechos, como mucho dos seguidas', () => {
    let dos = 0
    for (const lineas of muchos(es, 4, 300)) {
      let seguidas = 0
      for (const l of lineas) {
        seguidas = l.guion ? seguidas + 1 : 0
        expect(seguidas, lineas.map((x) => x.texto).join(' / ')).toBeLessThanOrEqual(2)
        if (seguidas === 2) dos++
      }
    }
    // Que el caso exista: si nunca hubiera dos seguidas, el test no probaria nada.
    expect(dos).toBeGreaterThan(0)
    // Pesado: con la maquina cargada (o en CI) pasa de los 5 s por defecto sin estar roto.
  }, 20_000)
})

describe('regla: la ultima palabra del parrafo no se parte', () => {
  it('aunque sea larguisima y la medida estrecha', () => {
    let partidas = 0
    for (const lineas of muchos(es, 5, 300, 'extraordinariamente')) {
      const ultima = lineas[lineas.length - 1] as Linea
      expect(ultima.texto.endsWith('extraordinariamente.'), lineas.map((x) => x.texto).join(' / ')).toBe(true)
      partidas += lineas.filter((l) => l.guion).length
    }
    // Las demas palabras si se parten.
    expect(partidas).toBeGreaterThan(0)
  })
})

describe('regla: la raya no se separa de su palabra', () => {
  const DIALOGO = [
    '—¿Vienes al faro esta noche? —pregunto la farera—. La marea esta quieta.',
    '—No lo se —dijo el—. Quiza mañana, cuando amanezca.',
    '— Siempre dices lo mismo, y la linterna se queda sin aceite.',
    'Ella miro el horizonte — la bruma subia — y no contesto.',
  ]
  const textos = (c: Componedor): Linea[][] => {
    const r: Linea[][] = []
    for (const d of DIALOGO) for (let ancho = 60; ancho <= 260; ancho += 3) r.push([...c.parrafo(trozosDeHtml(enLinea(d)), { ...JUSTO, ancho }).lineas])
    return r
  }

  it('ninguna linea acaba en una raya suelta ni empieza por una raya de cierre', () => {
    for (const lineas of textos(es)) {
      for (const l of lineas) {
        expect(/(^|\s)[—–]$/u.test(l.texto), lineas.map((x) => x.texto).join(' / ')).toBe(false)
        expect(/^[—–][.,;:]/u.test(l.texto), lineas.map((x) => x.texto).join(' / ')).toBe(false)
      }
    }
  })

  it('«—dijo—.» va siempre entero en la misma linea', () => {
    for (const lineas of textos(es)) {
      for (const l of lineas) {
        if (l.texto.includes('dijo')) expect(l.texto).toContain('—dijo')
        if (l.texto.includes('farera')) expect(l.texto).toContain('farera—.')
      }
    }
  })

  it('en ingles la raya con espacios se queda al final de la linea, no al principio', () => {
    // Salvo la que abre el parrafo, que va con lo que le sigue.
    for (const lineas of textos(en)) for (const l of lineas.slice(1)) expect(/^[—–]\s/u.test(l.texto), l.texto).toBe(false)
  })
})

describe('glifos', () => {
  it('no se corta dentro de una ligadura (of-fice)', () => {
    // «of-fice» es un corte valido en ingles, pero cae dentro de la «ffi».
    const texto = Array.from({ length: 40 }, () => 'office').join(' ')
    for (let ancho = 50; ancho < 200; ancho += 7) {
      for (const l of en.parrafo(trozosDeHtml(texto), { ...JUSTO, ancho }).lineas) expect(l.texto.endsWith('of-'), l.texto).toBe(false)
    }
  })

  it('con guion, el ultimo glifo lleva el kerning con el guion, no con la letra que se fue', () => {
    const r = azar(6)
    for (let i = 0; i < 60; i++) {
      for (const l of es.parrafo(trozosDeHtml(enLinea(parrafo(r, 60))), { ...JUSTO, ancho: 160 }).lineas) {
        if (!l.guion) continue
        const p = l.piezas[l.piezas.length - 1]
        const f = fuentes()[p?.cara ?? 'regular']
        const g = p?.glifos ?? []
        const ultimo = g[g.length - 2]
        const guion = g[g.length - 1]
        expect(guion?.texto).toBe('-')
        expect(ultimo?.avance).toBe(f.avance(ultimo?.id ?? 0) + f.kern(ultimo?.id ?? 0, guion?.id ?? 0))
      }
    }
  })

  it('anota los caracteres que la fuente no tiene', () => {
    const c = new Componedor(fuentes(), 'es')
    c.parrafo(trozosDeHtml('Un adorno ❦ que no esta'), { ...JUSTO, ancho: 300 })
    expect([...c.faltan]).toEqual(['❦'])
  })
})

describe('del HTML del parser a trozos', () => {
  it('cursiva, negrita y las dos', () => {
    expect(trozosDeHtml(enLinea('Una *cursiva*, **negrita** y ***las dos***'))).toEqual([
      { texto: 'Una ', cara: 'regular' },
      { texto: 'cursiva', cara: 'cursiva' },
      { texto: ', ', cara: 'regular' },
      { texto: 'negrita', cara: 'negrita' },
      { texto: ' y ', cara: 'regular' },
      { texto: 'las dos', cara: 'negritaCursiva' },
    ])
  })
  it('dentro de un verso en cursiva, el enfasis vuelve a redonda', () => {
    expect(trozosDeHtml(enLinea('caminante, *no* hay'), 'cursiva').map((t) => t.cara)).toEqual(['cursiva', 'regular', 'cursiva'])
  })
  it('deshace las entidades', () => {
    expect(trozosDeHtml(enLinea('Tom & Jerry <3'))[0]?.texto).toBe('Tom & Jerry <3')
  })
  it('normaliza a NFC: una tilde suelta se une a su letra', () => {
    expect(trozosDeHtml('café')[0]?.texto).toBe('café')
  })
})

describe('espacios que no rompen', () => {
  it('nunca se corta en un espacio duro', () => {
    const texto = Array.from({ length: 30 }, (_v, i) => `pagina ${i + 1}`).join(' ')
    for (let ancho = 80; ancho < 250; ancho += 11) {
      for (const l of es.parrafo(trozosDeHtml(texto), { ...JUSTO, ancho }).lineas) expect(/^\d/u.test(l.texto), l.texto).toBe(false)
    }
  })
})

describe('recomponer sin guion en una linea', () => {
  it('deja intactas las lineas de antes y quita el guion de la pedida', () => {
    const r = azar(7)
    let probadas = 0
    for (let i = 0; i < 80; i++) {
      const p = es.parrafo(trozosDeHtml(enLinea(parrafo(r, 90))), { ...JUSTO, ancho: 270 })
      const k = p.lineas.findIndex((l, j) => j >= 2 && l.guion)
      if (k < 0) continue
      const q = p.recomponer(2, new Set([k]))
      if (!q) continue
      probadas++
      expect(q.lineas.slice(0, 2)).toEqual(p.lineas.slice(0, 2))
      const junto = (x: typeof q): string => x.lineas.map((l) => (l.guion ? l.texto.slice(0, -1) : l.texto + ' ')).join('')
      expect(junto(q)).toBe(junto(p))
      expect(q.lineas[k]?.guion).toBe(false)
      let seguidas = 0
      for (const l of q.lineas) {
        seguidas = l.guion ? seguidas + 1 : 0
        expect(seguidas).toBeLessThanOrEqual(2)
      }
    }
    expect(probadas).toBeGreaterThan(10)
  })
})

describe('versos y titulos', () => {
  it('un verso largo sigue con sangria colgante, sin partir palabras', () => {
    const p = es.parrafo(trozosDeHtml('Caminante, son tus huellas el camino y nada mas; caminante, no hay camino', 'cursiva'), {
      cuerpo: 10.5,
      ancho: 150,
      modo: 'bandera',
      partir: true,
      colgante: 16,
    })
    expect(p.lineas.length).toBeGreaterThan(1)
    expect(p.lineas[0]?.desde).toBe(0)
    for (const l of p.lineas.slice(1)) expect(l.desde).toBe(16)
    for (const l of p.lineas) expect(l.guion).toBe(false)
  })

  it('el espaciado entre letras va en el avance de cada glifo, que es lo que se pinta', () => {
    const p = es.parrafo([{ texto: 'CAPÍTULO 12', cara: 'regular' }], { cuerpo: 8.4, ancho: 300, modo: 'centrado', partir: false, espaciado: 0.25 })
    const l = p.lineas[0] as Linea
    const f = fuentes().regular
    const [a, b] = l.piezas
    // La segunda palabra empieza donde acaba la primera (con su espaciado) mas un espacio.
    const finA = (a?.x ?? 0) + (a?.glifos ?? []).reduce((s, g) => s + (g.avance * 8.4) / f.upm, 0)
    expect((b?.x ?? 0) - finA).toBeCloseTo(es.medir(' ', 'regular', 8.4), 6)
    expect(a?.glifos[0]?.avance).toBeCloseTo(f.avance(f.glifo(0x43)) + f.kern(f.glifo(0x43), f.glifo(0x41)) + 250, 6)
  })

  it('un titulo centrado queda en el medio', () => {
    const p = es.parrafo(trozosDeHtml('El faro'), { cuerpo: 16.8, ancho: 300, modo: 'centrado', partir: false })
    const l = p.lineas[0] as Linea
    expect(l.piezas[0]?.x).toBeCloseTo((300 - l.natural) / 2, 6)
  })
})
