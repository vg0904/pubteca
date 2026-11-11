import { describe, expect, it } from 'vitest'
import { componerLibro, type ImagenImpresa, type LibroCompuesto, type OpcionesImpreso, type SeccionDeTexto, type SeccionImpresa } from '../src/core/impreso/paginar'
import type { PaginaCompuesta, Renglon } from '../src/core/impreso/tipos'
import type { Bloque } from '../src/core/parser'
import { enLinea } from '../src/core/texto'
import { azar, capitulo, fuentes, OPCIONES, parrafo, seccion } from './impreso/ayuda'

// Paginar: cada regla de oficio de la pagina con su test, sobre un libro
// inventado de doce capitulos de largos distintos (asi los capitulos acaban en
// paginas pares e impares, y los parrafos caen en todos los sitios del corte).

const verso = (t: string): Bloque => ({ tipo: 'verso', html: enLinea(t) })

function corpus(cadaEscena = 4): SeccionDeTexto[] {
  return Array.from({ length: 12 }, (_v, i) => {
    const n = i + 1
    return seccion(
      n,
      capitulo(n * 13, 6 + ((n * 7) % 23), (k) => {
        if (k > 0 && k % cadaEscena === 0) return [{ tipo: 'escena' }]
        if (n % 3 === 0 && k % 4 === 2) return [{ tipo: 'sub', html: enLinea('La noche del faro') }]
        if (n === 5 && k === 3)
          return [verso('Las mareas quietas'), verso('guardan el nombre del farero'), { tipo: 'estrofa' }, verso('y la luz que no se apaga'), verso('cuando el mar se va dormido')]
        if (n === 6 && k === 5) return [{ tipo: 'ilus', nombre: 'mapa', alt: '' }]
        if (n === 7 && k === 1) return [{ tipo: 'medio', clase: 'video', nombre: 'olas', alt: 'Olas' }]
        return []
      }),
    )
  })
}

const imagen = (nombre: string): ImagenImpresa | null => (nombre === 'mapa' ? { id: 'img-mapa', ancho: 2400, alto: 1800 } : null)

const cache = new Map<string, LibroCompuesto>()
function libro(o: Partial<OpcionesImpreso> = {}, secciones?: SeccionImpresa[]): LibroCompuesto {
  const clave = JSON.stringify(o)
  if (!secciones && cache.has(clave)) return cache.get(clave) as LibroCompuesto
  const l = componerLibro(secciones ?? corpus(), fuentes(), { ...OPCIONES, ...o }, imagen)
  if (!secciones) cache.set(clave, l)
  return l
}

/** El texto que de verdad se pinta en una linea base (los glifos de las operaciones). */
function pintadoEn(p: PaginaCompuesta, y: number): string {
  return p.ops
    .filter((o) => o.op === 'texto' && Math.abs(o.y - y) < 1e-9)
    .flatMap((o) => (o.op === 'texto' ? o.glifos.map((g) => g.texto) : []))
    .join('')
}

const deTexto = (l: LibroCompuesto): PaginaCompuesta[] => l.paginas.filter((p) => p.tipo === 'texto' || p.tipo === 'apertura')
const delCuerpo = (p: PaginaCompuesta): Renglon[] => p.renglones.filter((r) => r.clase !== 'titulo' && r.clase !== 'numero')

/** Cuantas lineas de cada parrafo caen en cada pagina, en orden: «3/1» = 3, 2, ... */
function partesDeParrafos(l: LibroCompuesto): Map<string, number[]> {
  const partes = new Map<string, number[]>()
  for (const p of l.paginas) {
    const aqui = new Map<string, number>()
    for (const r of p.renglones) if (r.clase === 'parrafo') aqui.set(`${r.seccion}/${r.bloque}`, (aqui.get(`${r.seccion}/${r.bloque}`) ?? 0) + 1)
    for (const [k, n] of aqui) partes.set(k, [...(partes.get(k) ?? []), n])
  }
  return partes
}

describe('el libro de prueba', () => {
  it('tiene paginas de sobra y ningun aviso', () => {
    const l = libro()
    expect(l.paginas.length).toBeGreaterThan(40)
    expect(l.avisos).toEqual([])
  })

  it('componer dos veces da exactamente lo mismo', () => {
    const a = componerLibro(corpus(), fuentes(), OPCIONES, imagen)
    const b = componerLibro(corpus(), fuentes(), OPCIONES, imagen)
    expect(b).toEqual(a)
  })
})

describe('regla: un capitulo abre en pagina impar', () => {
  it('todas las aperturas son impares, y para eso se deja alguna par en blanco', () => {
    const l = libro()
    const aperturas = l.paginas.filter((p) => p.tipo === 'apertura')
    expect(aperturas).toHaveLength(12)
    for (const p of aperturas) expect(p.numero % 2, `apertura en la ${p.numero}`).toBe(1)
    const blancas = l.paginas.filter((p) => p.tipo === 'blanca')
    expect(blancas.length).toBeGreaterThan(0)
    for (const p of blancas) {
      expect(p.numero % 2).toBe(0)
      expect(p.ops).toEqual([])
      expect(p.folio).toBeNull()
    }
  })

  it('si se pide que no, los capitulos van seguidos', () => {
    const l = libro({ capituloEnImpar: false })
    expect(l.paginas.filter((p) => p.tipo === 'blanca')).toEqual([])
    expect(l.paginas.filter((p) => p.tipo === 'apertura' && p.numero % 2 === 0).length).toBeGreaterThan(0)
  })
})

describe('regla: ni huerfanas ni viudas', () => {
  it('ningun parrafo deja su primera linea sola al pie de una pagina (huerfana)', () => {
    let partidos = 0
    for (const [k, partes] of partesDeParrafos(libro())) {
      if (partes.length < 2) continue
      partidos++
      expect(partes[0], `parrafo ${k}: ${partes.join(' + ')}`).toBeGreaterThanOrEqual(2)
    }
    expect(partidos).toBeGreaterThan(10)
  })

  it('ningun parrafo deja su ultima linea sola en lo alto de la pagina (viuda)', () => {
    for (const [k, partes] of partesDeParrafos(libro())) {
      if (partes.length < 2) continue
      expect(partes[partes.length - 1], `parrafo ${k}: ${partes.join(' + ')}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('para cumplirlo, alguna pagina sale una linea mas corta', () => {
    const l = libro()
    const fila = (y: number): number => Math.round((y - OPCIONES.formato.superior - OPCIONES.cuerpo) / OPCIONES.interlinea) + 1
    const paginas = deTexto(l)
    // Hasta donde llega cada pagina que no es la ultima de su capitulo.
    const hasta = paginas.filter((p, i) => paginas[i + 1]?.seccion === p.seccion).map((p) => fila(delCuerpo(p).at(-1)?.y ?? 0))
    expect(Math.max(...hasta)).toBe(l.lineas)
    expect(hasta).toContain(l.lineas - 1)
    // Lo peor: un parrafo de tres lineas que no se puede partir, o un guion en
    // impar que no se pudo recomponer tras un cambio de escena.
    expect(Math.min(...hasta)).toBeGreaterThanOrEqual(l.lineas - 3)
  })
})

describe('regla: una pagina impar no acaba en guion', () => {
  it('la ultima linea de cada impar no lleva guion (en las pares si puede)', () => {
    let paresConGuion = 0
    for (const p of deTexto(libro())) {
      const ultima = delCuerpo(p).at(-1)
      if (!ultima) continue
      if (p.numero % 2 === 1) expect(ultima.guion, `pagina ${p.numero}: «${ultima.texto}»`).toBe(false)
      else if (ultima.guion) paresConGuion++
    }
    // El caso existe: en una par, nadie lo impide.
    expect(paresConGuion).toBeGreaterThan(0)
  })
})

describe('regla: el cambio de escena no se pierde en el corte de pagina', () => {
  const escenas = corpus().reduce((n, s) => n + s.bloques.filter((b) => b.tipo === 'escena').length, 0)

  it('con adorno: todos los cambios estan, con su adorno, tambien arriba y al pie', () => {
    const l = libro()
    const pintadas = l.paginas.flatMap((p) => p.renglones.filter((r) => r.clase === 'escena').map((r) => ({ p, r })))
    expect(pintadas).toHaveLength(escenas)
    for (const { p, r } of pintadas) {
      expect(r.texto).toBe('* * *')
      expect(pintadoEn(p, r.y)).toBe('***')
    }
    const enBorde = deTexto(l).filter((p) => [delCuerpo(p)[0]?.clase, delCuerpo(p).at(-1)?.clase].includes('escena'))
    expect(enBorde.length).toBeGreaterThan(0)
  })

  it('el adorno no se parte entre dos paginas: sus dos renglones van juntos', () => {
    // Con parrafos de una linea, el cambio de escena cae en cada renglon del
    // pie, uno por vuelta: tambien en el ultimo, donde no caben sus dos.
    const una = (n: number): Bloque[] => Array.from({ length: n }, () => ({ tipo: 'p', html: 'Una linea.' }))
    const base = (i: number): number => OPCIONES.formato.superior + OPCIONES.cuerpo + i * OPCIONES.interlinea
    const n = libro().lineas
    for (let k = n - 4; k <= n + 1; k++) {
      const l = libro({}, [{ numero: null, titulo: null, bloques: [...una(k), { tipo: 'escena' }, ...una(6)] }])
      const [p] = l.paginas.filter((x) => x.renglones.some((r) => r.clase === 'escena'))
      const e = p?.renglones.find((r) => r.clase === 'escena')
      if (!p || !e) throw new Error(`k=${k}: sin escena`)
      // El adorno va entre sus dos renglones: el de abajo tiene que estar en la pagina.
      expect(e.y, `k=${k}, pagina ${p.numero}`).toBeLessThan(base(n - 1))
      expect(pintadoEn(p, e.y)).toBe('***')
    }
  })

  it('con linea en blanco: si cae arriba o al pie de la pagina, lleva el adorno', () => {
    const l = libro({ escena: 'blanco' })
    let enBorde = 0
    let enMedio = 0
    for (const p of deTexto(l)) {
      const r = delCuerpo(p)
      r.forEach((x, i) => {
        if (x.clase !== 'escena') return
        if (i === 0 || i === r.length - 1) {
          enBorde++
          expect(x.texto, `pagina ${p.numero}`).toBe('* * *')
          expect(pintadoEn(p, x.y), `pagina ${p.numero}`).toBe('***')
        } else {
          enMedio++
          expect(x.texto).toBe('')
          expect(pintadoEn(p, x.y)).toBe('')
        }
      })
    }
    expect(enBorde + enMedio).toBe(escenas)
    // El caso existe en este libro.
    expect(enBorde).toBeGreaterThan(0)
  })

  it('si la fuente no tiene el adorno pedido, usa tres asteriscos y lo dice', () => {
    const l = libro({ adorno: '❦' })
    expect(l.avisos).toContainEqual({ codigo: 'adornoSinGlifo', adorno: '❦', usado: '* * *' })
    expect(l.paginas.flatMap((p) => p.renglones.filter((r) => r.clase === 'escena')).every((r) => r.texto === '* * *')).toBe(true)
  })
})

describe('otras reglas de la pagina', () => {
  it('un subtitulo nunca queda solo al pie: lo siguen al menos dos lineas', () => {
    const l = libro()
    let subs = 0
    for (const p of deTexto(l)) {
      const r = delCuerpo(p)
      r.forEach((x, i) => {
        if (x.clase !== 'sub') return
        subs++
        expect(r.length - i - 1, `pagina ${p.numero}`).toBeGreaterThanOrEqual(Math.min(2, r[i + 1]?.de ?? 2))
      })
    }
    expect(subs).toBe(corpus().reduce((n, s) => n + s.bloques.filter((b) => b.tipo === 'sub').length, 0))
  })

  it('todas las lineas del texto caen en la reticula', () => {
    const { superior } = OPCIONES.formato
    for (const p of deTexto(libro())) {
      for (const r of p.renglones) {
        if (r.clase === 'escena' || r.clase === 'titulo' || r.clase === 'numero') continue
        const k = (r.y - superior - OPCIONES.cuerpo) / OPCIONES.interlinea
        expect(Math.abs(k - Math.round(k)), `pagina ${p.numero}: ${r.texto}`).toBeLessThan(1e-9)
      }
    }
  })

  it('el texto no pisa los margenes; el interior va en el lado del lomo', () => {
    const f = OPCIONES.formato
    for (const p of deTexto(libro())) {
      const izq = p.numero % 2 === 1 ? f.interior : f.exterior
      for (const op of p.ops) {
        if (op.op !== 'texto') continue
        expect(op.x).toBeGreaterThanOrEqual(izq - 1e-6)
        const w = op.glifos.reduce((s, g) => s + (g.avance * op.cuerpo) / fuentes()[op.cara].upm, 0)
        expect(op.x + w).toBeLessThanOrEqual(f.ancho - (f.ancho - izq - (f.ancho - f.interior - f.exterior)) + 1e-6)
      }
    }
  })

  it('los versos van en cursiva, con su estrofa', () => {
    const versos = libro().paginas.flatMap((p) => p.renglones.filter((r) => r.clase === 'verso'))
    expect(versos.map((r) => r.texto)).toEqual(['Las mareas quietas', 'guardan el nombre del farero', 'y la luz que no se apaga', 'cuando el mar se va dormido'])
  })

  it('un poema largo: ningun verso partido entre paginas, ni estrofas con una linea sola a un lado', () => {
    const r = azar(99)
    const poema: Bloque[] = []
    for (let i = 0; i < 90; i++) {
      if (i > 0 && i % 5 === 0) poema.push({ tipo: 'estrofa' })
      // Versos de largos variados: muchos no caben en una linea y siguen debajo.
      poema.push(verso(parrafo(r, 3 + Math.floor(r() * 16)).replace(/\.$/u, ',')))
    }
    const l = libro({}, [seccion(1, [...capitulo(5, 2), ...poema])])
    const paginas = deTexto(l)
    let siguen = 0
    let partidas = 0
    paginas.forEach((p, i) => {
      const versos = p.renglones.filter((x) => x.clase === 'verso')
      siguen += versos.filter((x, k) => k > 0 && versos[k - 1]?.bloque === x.bloque).length
      const antes = paginas[i - 1]?.renglones.filter((x) => x.clase === 'verso').at(-1)
      const primero = versos[0]
      if (!antes || !primero) return
      expect(primero.bloque, `pagina ${p.numero}: «${primero.texto}»`).not.toBe(antes.bloque)
      if (primero.linea > 0) {
        partidas++
        expect(primero.linea, `pagina ${p.numero}`).toBeGreaterThanOrEqual(2)
        expect(primero.de - primero.linea, `pagina ${p.numero}`).toBeGreaterThanOrEqual(2)
      }
    })
    // El caso existe: hay versos que siguen debajo, y estrofas partidas entre paginas.
    expect(siguen).toBeGreaterThan(10)
    expect(partidas).toBeGreaterThan(0)
  })

  it('el video no sale en el impreso', () => {
    const textos = libro().paginas.flatMap((p) => p.renglones.map((r) => r.texto))
    expect(textos.some((t) => t.includes('Olas'))).toBe(false)
  })
})

describe('ilustraciones', () => {
  it('van solas en su pagina, detras de la pagina donde estaban, y caben en la caja', () => {
    const l = libro()
    const i = l.paginas.findIndex((p) => p.tipo === 'ilustracion')
    const p = l.paginas[i] as PaginaCompuesta
    expect(p.ops).toHaveLength(1)
    const op = p.ops[0]
    if (op?.op !== 'imagen') throw new Error('no es una imagen')
    const f = OPCIONES.formato
    expect(op.id).toBe('img-mapa')
    expect(op.ancho / op.alto).toBeCloseTo(800 / 600, 6)
    expect(op.ancho).toBeCloseTo(f.ancho - f.interior - f.exterior, 6)
    expect(op.y).toBeGreaterThanOrEqual(f.superior)
    expect(op.y + op.alto).toBeLessThanOrEqual(f.alto - f.inferior + 1e-6)
    expect(p.folio).toBeNull()
    // La pagina de antes es del mismo capitulo, y el capitulo sigue despues.
    expect(l.paginas[i - 1]?.seccion).toBe(p.seccion)
    expect(l.paginas[i + 1]?.seccion).toBe(p.seccion)
  })

  it('una que no se encuentra se dice y no rompe nada', () => {
    const l = libro({}, [seccion(1, [{ tipo: 'ilus', nombre: 'no-esta', alt: '' }, ...capitulo(1, 3)])])
    expect(l.avisos).toContainEqual({ codigo: 'ilustracionPerdida', nombre: 'no-esta' })
  })

  it('las de antes del titulo van delante de la apertura, en la par de enfrente si se puede', () => {
    const s: SeccionDeTexto = { ...seccion(2, capitulo(2, 4)), antes: [{ nombre: 'mapa', alt: '' }] }
    const l = libro({}, [seccion(1, capitulo(1, 1)), s])
    const tipos = l.paginas.map((p) => p.tipo)
    expect(tipos).toEqual(['apertura', 'ilustracion', 'apertura', ...tipos.slice(3)])
  })
})

describe('folios y cabeceras', () => {
  it('las paginas de texto llevan folio y cabecera; las aperturas solo folio, al pie', () => {
    const l = libro()
    const yCabecera = OPCIONES.formato.superior + OPCIONES.cuerpo - 2 * OPCIONES.interlinea
    for (const p of deTexto(l)) {
      expect(p.folio).toBe(String(p.numero))
      const arriba = p.ops.filter((o) => o.op === 'texto' && Math.abs(o.y - yCabecera) < 1e-9)
      if (p.tipo === 'texto') expect(arriba.length).toBeGreaterThanOrEqual(2)
      else expect(arriba).toEqual([])
    }
  })

  it('la cabecera de las pares es el titulo del libro', () => {
    const l = libro()
    const par = deTexto(l).find((p) => p.tipo === 'texto' && p.numero % 2 === 0) as PaginaCompuesta
    const yCabecera = OPCIONES.formato.superior + OPCIONES.cuerpo - 2 * OPCIONES.interlinea
    const texto = par.ops
      .filter((o) => o.op === 'texto' && Math.abs(o.y - yCabecera) < 1e-9 && o.cara === 'cursiva')
      .flatMap((o) => (o.op === 'texto' ? o.glifos.map((g) => g.texto) : []))
      .join('')
    expect(texto.replace(/\s/gu, '')).toBe(OPCIONES.tituloLibro.replace(/\s/gu, ''))
  })

  it('sin cabeceras, el folio sigue en su esquina y no hay mas texto en esa linea', () => {
    const l = libro({ cabeceras: false })
    const yCabecera = OPCIONES.formato.superior + OPCIONES.cuerpo - 2 * OPCIONES.interlinea
    const texto = l.paginas.filter((p) => p.tipo === 'texto')
    expect(texto.length).toBeGreaterThan(20)
    for (const p of texto) {
      const arriba = p.ops.filter((o) => o.op === 'texto' && Math.abs(o.y - yCabecera) < 1e-9)
      expect(arriba.flatMap((o) => (o.op === 'texto' ? o.glifos.map((g) => g.texto) : [])).join('')).toBe(p.folio)
    }
  })

  it('los folios siguen la numeracion pedida', () => {
    const l = libro({ primeraPagina: 7, folioInicial: 1 })
    expect(l.paginas[0]?.numero).toBe(7)
    expect(l.paginas[0]?.folio).toBe('1')
  })
})
