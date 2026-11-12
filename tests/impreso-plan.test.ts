import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIG_IMPRESO_POR_DEFECTO, conFuente, isbnValido, normalizarConfig, ordenDeExtras, type ConfigImpreso } from '../src/core/impreso/config'
import { claveImagen, contenidoDe, type Contenido } from '../src/core/impreso/contenido'
import { familia } from '../src/core/impreso/familias'
import { CORTES, PT_POR_MM, medianilKdp, tramoKdp, zonaSegura } from '../src/core/impreso/formatos'
import { romano, type ImagenImpresa } from '../src/core/impreso/paginar'
import { blancasSeguidas, buscarMedianil, componerImpreso, medidasDeCorte, type ClasePieza, type Impreso } from '../src/core/impreso/plan'
import type { PaginaCompuesta, TipoPagina } from '../src/core/impreso/tipos'
import { archivo } from '../src/core/proyecto'
import { configDePrueba, contenidoDePrueba, FIXTURE, GOLDEN_PLAN, libroCompletoDePrueba, planEnTexto } from '../scripts/impreso-prueba'
import { comprobarPdfx, leerPdf, lista, numero, paginas, textosPintados } from '../scripts/leer-pdf'
import { leerProyecto } from '../scripts/leer-proyecto'
import { capitulo, fuentes } from './impreso/ayuda'

// El plan del libro impreso (M6): que paginas lleva y en que orden, como se
// numeran, que el medianil sale del numero real de paginas, que nada impreso
// cae fuera de lo que admite el destino, y que el PDF es el plan pagina a
// pagina. El libro es el inventado de M5 con cuatro extras: dedicatoria,
// epigrafe, una nota al principio y unos agradecimientos al final.

const CONTENIDO = contenidoDePrueba()
const COMPLETO = libroCompletoDePrueba()

const imagenes: Readonly<Record<string, ImagenImpresa>> = {
  'cap02-01': { id: 'cap02-01', ancho: 3000, alto: 2000 },
  logo: { id: 'logo', ancho: 2400, alto: 800 },
  'color-01': { id: 'color-01', ancho: 2000, alto: 3000 },
  'color-02': { id: 'color-02', ancho: 2000, alto: 3000 },
}
const imagen = (nombre: string): ImagenImpresa | null => imagenes[nombre] ?? null

function plan(cambios: Partial<ConfigImpreso> = {}, contenido: Contenido = CONTENIDO): Impreso {
  return componerImpreso(contenido, { ...CONFIG_IMPRESO_POR_DEFECTO, ...cambios }, fuentes(), imagen)
}

/** Lo que es cada pagina: la clase de su pieza, o el tipo si es una blanca. */
const clases = (r: Impreso): (ClasePieza | TipoPagina)[] => r.paginas.map((p) => (p.tipo === 'blanca' ? 'blanca' : (r.piezas[p.seccion]?.clase ?? p.tipo)))
/** Los glifos que pinta una pagina, seguidos (los espacios son blanco, no glifos). */
const glifosDe = (p: PaginaCompuesta): string => p.ops.flatMap((o) => (o.op === 'texto' ? o.glifos.map((g) => g.texto) : [])).join('')
/** Lo que dice una pagina, renglon a renglon. */
const textoDe = (p: PaginaCompuesta): string => p.renglones.map((x) => x.texto).join(' / ')
const paginaDe = (r: Impreso, clase: ClasePieza): PaginaCompuesta[] => r.paginas.filter((p) => r.piezas[p.seccion]?.clase === clase)
const primeraDe = (r: Impreso, clase: ClasePieza): PaginaCompuesta => paginaDe(r, clase)[0] as PaginaCompuesta

describe('lo que se imprime sale del mismo proyecto que el EPUB', () => {
  it('capitulos con su numero y su titulo, y los extras clasificados por su nombre', () => {
    expect(CONTENIDO.capitulos.map((c) => [c.numero, c.plano])).toEqual([
      ['Capítulo 1', 'La farera'],
      ['Capítulo 2', 'El transatlántico'],
      ['Capítulo 3', 'La tormenta'],
    ])
    expect(CONTENIDO.extras.map((x) => [x.id, x.tipo, x.donde])).toEqual([
      ['agradecimientos.md', 'conTitulo', 'final'],
      ['dedicatoria.md', 'dedicatoria', 'inicio'],
      ['epigrafe.md', 'epigrafe', 'inicio'],
      ['inicio-nota.md', 'conTitulo', 'inicio'],
    ])
    expect(CONTENIDO.portadilla).toEqual({ modo: 'texto' })
    expect(CONTENIDO.derechos).toBe('© 2026 Lucía Ferrer Ondarra. Todos los derechos reservados.')
    expect(CONTENIDO.medios).toBe(0)
  })

  it('el logo de la portadilla, a pagina completa, las laminas en orden y los medios contados', () => {
    const base = leerProyecto(FIXTURE)
    const con = {
      ...base,
      libroTxt: `${base.libroTxt ?? ''}\nportadilla: pagina\n`,
      portada: [archivo('portada/logo.png', new Uint8Array(4))],
      ilustraciones: ['color-10', 'color-2', 'color-1'].map((n) => archivo(`ilustraciones/${n}.png`, new Uint8Array(4))),
      capitulos: [...base.capitulos, archivo('capitulos/cap04.md', new TextEncoder().encode('# Capítulo 4: Coda\n\n[video: olas | Las olas]\n\nFin.\n'))],
    }
    const c = contenidoDe(con, 2026)
    expect(c.portadilla).toEqual({ modo: 'pagina', imagen: 'logo' })
    expect(c.laminas).toEqual(['color-1', 'color-2', 'color-10'])
    expect(c.medios).toBe(1)
    expect(contenidoDe({ ...con, libroTxt: base.libroTxt }, 2026).portadilla).toEqual({ modo: 'logo', imagen: 'logo' })
    expect(claveImagen(' Cap02-01.PNG ')).toBe('cap02-01')
  })
})

describe('el plan, en el orden de la tradicion', () => {
  const r = plan()

  it('anteportada, portada, creditos al dorso, extras del principio en impar y el capitulo 1 en impar con el folio 1', () => {
    expect(clases(r).filter((x) => x !== 'blanca')).toEqual([
      'anteportada', 'portada', 'creditos', 'dedicatoria', 'epigrafe', 'extra', 'capitulo', 'capitulo', 'capitulo', 'capitulo', 'capitulo', 'extra',
    ])
    expect(primeraDe(r, 'anteportada').numero).toBe(1)
    expect(primeraDe(r, 'portada').numero).toBe(3)
    expect(primeraDe(r, 'creditos').numero).toBe(4)
    for (const c of ['dedicatoria', 'epigrafe', 'extra'] as const) expect(primeraDe(r, c).numero % 2, c).toBe(1)
    const cap1 = primeraDe(r, 'capitulo')
    expect(cap1.numero % 2).toBe(1)
    expect(cap1.folio).toBe('1')
  })

  it('sin numero en los preliminares: nada antes del capitulo 1 lleva folio', () => {
    const cap1 = primeraDe(r, 'capitulo').numero
    expect(r.paginas.filter((p) => p.numero < cap1 && p.folio !== null)).toEqual([])
  })

  it('los creditos llevan el ISBN DEL IMPRESO y «Edición impresa», nunca «Edición digital»', () => {
    const t = textoDe(primeraDe(plan({ isbn: '978-84-09-12345-2' }), 'creditos'))
    expect(t).toContain('ISBN: 978-84-09-12345-2')
    expect(t).toContain('Edición impresa, 2026')
    expect(t).not.toContain('digital')
    expect(r.avisos).toContainEqual({ codigo: 'sinIsbn' })
  })

  it('sin titulo o sin autor se avisa (la portada saldria en blanco), y los derechos no dejan un hueco', () => {
    expect(r.avisos.filter((a) => a.codigo === 'sinTitulo' || a.codigo === 'sinAutor')).toEqual([])
    const base = leerProyecto(FIXTURE)
    const sinNada = contenidoDe({ ...base, libroTxt: (base.libroTxt ?? '').replace(/^titulo: .*$/mu, 'titulo:').replace(/^autor: .*$/mu, 'autor:') }, 2026)
    expect(sinNada.derechos).toBe('© 2026. Todos los derechos reservados.')
    const avisos = plan({}, sinNada).avisos
    expect(avisos).toContainEqual({ codigo: 'sinTitulo' })
    expect(avisos).toContainEqual({ codigo: 'sinAutor' })
  })

  it('sin anteportada, la portada es la pagina 1', () => {
    expect(primeraDe(plan({ anteportada: false }), 'portada').numero).toBe(1)
  })

  it('un extra que no entra no sale; uno movido al final sale detras del ultimo capitulo', () => {
    const extras = ordenDeExtras(CONFIG_IMPRESO_POR_DEFECTO, CONTENIDO.extras).map((e) =>
      e.id === 'epigrafe.md' ? { ...e, incluir: false } : e.id === 'inicio-nota.md' ? { ...e, donde: 'final' as const } : e,
    )
    const x = plan({ extras })
    expect(paginaDe(x, 'epigrafe')).toEqual([])
    const ultimoCapitulo = Math.max(...paginaDe(x, 'capitulo').map((p) => p.numero))
    const nota = x.paginas.find((p) => x.piezas[p.seccion]?.extra === 'inicio-nota.md') as PaginaCompuesta
    expect(nota.numero).toBeGreaterThan(ultimoCapitulo)
    // Al final lleva folio arabigo: es parte del libro numerado.
    expect(nota.folio).toMatch(/^\d+$/u)
  })

  it('el numero de paginas siempre es par', () => {
    for (const c of [{}, { anteportada: false }, { colofon: true }, { capituloEnImpar: false }, { indice: true, preliminares: 'romanos' as const }]) {
      expect(plan(c).paginas.length % 2, JSON.stringify(c)).toBe(0)
    }
  })

  it('el colofon va en la ultima impar, con su dorso en blanco', () => {
    const x = plan({ colofon: true })
    const col = primeraDe(x, 'colofon')
    expect(col.numero % 2).toBe(1)
    expect(x.paginas.slice(col.numero).map((p) => p.tipo)).toEqual(['blanca'])
    expect(textoDe(col)).toBe('Este libro se compuso en Source Serif 4.')
  })

  it('IngramSpark: la ultima pagina en blanco, tambien cuando el libro acaba lleno en una par', () => {
    const x = plan({ destino: 'ingram' })
    expect(x.paginas[x.paginas.length - 1]?.tipo).toBe('blanca')
    expect(x.paginas.length % 2).toBe(0)
    // Con los capitulos en la pagina siguiente, el libro acaba en una par con texto...
    const kdp = plan({ capituloEnImpar: false })
    expect(kdp.paginas.length % 2).toBe(0)
    expect(kdp.paginas[kdp.paginas.length - 1]?.tipo).not.toBe('blanca')
    // ...y para IngramSpark le siguen dos blancas: la ultima en blanco y el numero par.
    const ingram = plan({ destino: 'ingram', capituloEnImpar: false })
    expect(ingram.paginas.length).toBe(kdp.paginas.length + 2)
    expect(ingram.paginas.slice(-2).map((p) => p.tipo)).toEqual(['blanca', 'blanca'])
  })

  it('el capitulo 1 abre en impar con el folio 1 aunque los demas empiecen en la pagina siguiente', () => {
    const x = plan({ capituloEnImpar: false, anteportada: false })
    const cap1 = x.paginas.find((p) => x.piezas[p.seccion]?.clase === 'capitulo' && p.tipo === 'apertura')
    // Sin anteportada, la nota del principio acaba en la 7: el capitulo 1 iria a la 8 si nada lo obligara.
    expect(primeraDe(x, 'extra').numero).toBe(7)
    expect(cap1?.numero).toBe(9)
    expect(cap1?.folio).toBe('1')
  })

  it('laminas en grises: desde la par de enfrente de la portada; omitidas, no salen y se dice', () => {
    const una = plan({}, { ...CONTENIDO, laminas: ['color-01'] })
    expect(primeraDe(una, 'lamina').numero).toBe(2)
    expect(primeraDe(una, 'lamina').tipo).toBe('ilustracion')
    expect(primeraDe(una, 'portada').numero).toBe(3)
    const dos = plan({}, { ...CONTENIDO, laminas: ['color-01', 'color-02'] })
    expect(paginaDe(dos, 'lamina').map((p) => p.numero)).toEqual([2, 3])
    expect(primeraDe(dos, 'portada').numero).toBe(5)
    const fuera = plan({ laminas: 'omitir' }, { ...CONTENIDO, laminas: ['color-01', 'color-02'] })
    expect(paginaDe(fuera, 'lamina')).toEqual([])
    expect(fuera.avisos).toContainEqual({ codigo: 'laminasOmitidas', laminas: 2 })
  })

  it('la portadilla con logo lleva la imagen y el autor; a pagina completa, solo la imagen', () => {
    const logo = primeraDe(plan({}, { ...CONTENIDO, portadilla: { modo: 'logo', imagen: 'logo' } }), 'portada')
    expect(logo.ops.filter((o) => o.op === 'imagen').map((o) => (o.op === 'imagen' ? o.id : ''))).toEqual(['logo'])
    expect(logo.renglones.map((x) => x.texto)).toEqual(['Lucía Ferrer Ondarra', 'Ediciones Pubteca'])
    const pagina = primeraDe(plan({}, { ...CONTENIDO, portadilla: { modo: 'pagina', imagen: 'logo' } }), 'portada')
    expect(pagina.tipo).toBe('ilustracion')
    expect(pagina.numero % 2).toBe(1)
  })

  it('el audio y el video no van en papel, y se dice', () => {
    expect(plan({}, { ...CONTENIDO, medios: 3 }).avisos).toContainEqual({ codigo: 'mediosFuera', medios: 3 })
  })
})

describe('cabeceras y folios', () => {
  const texto = (r: Impreso): PaginaCompuesta[] => r.paginas.filter((p) => p.tipo === 'texto')
  const arriba = (p: PaginaCompuesta): string =>
    p.ops.flatMap((o) => (o.op === 'texto' && o.y < Math.min(...p.renglones.map((x) => x.y)) ? o.glifos.map((g) => g.texto) : [])).join('')
  const abajo = (p: PaginaCompuesta): string =>
    p.ops.flatMap((o) => (o.op === 'texto' && o.y > Math.max(...p.renglones.map((x) => x.y)) ? o.glifos.map((g) => g.texto) : [])).join('')

  it('la par lleva el titulo del libro o el autor, y el folio en su esquina', () => {
    const [p] = texto(plan({ cabecera: 'autor' }))
    expect(p?.numero).toBe(12)
    expect(arriba(p as PaginaCompuesta)).toBe('LucíaFerrerOndarra2')
    const [q] = texto(plan())
    expect(arriba(q as PaginaCompuesta)).toBe('Elfarodelasmareasquietas2')
  })

  it('con el folio al pie: abajo el folio, arriba solo la cabecera', () => {
    const [p] = texto(plan({ folio: 'abajo' }))
    expect(abajo(p as PaginaCompuesta)).toBe('2')
    expect(arriba(p as PaginaCompuesta)).not.toMatch(/\d/u)
  })

  it('sin cabeceras el folio sigue saliendo', () => {
    const [p] = texto(plan({ cabecera: 'ninguna' }))
    expect(arriba(p as PaginaCompuesta)).toBe('2')
  })
})

describe('el indice', () => {
  const r = COMPLETO.impreso
  const ind = primeraDe(r, 'indice')

  it('lista lo que viene detras con el folio REAL de su apertura (romano en los preliminares)', () => {
    const esperado = r.piezas.flatMap((pz, s) => {
      if (pz.clase !== 'capitulo' && pz.clase !== 'extra') return []
      const ap = r.paginas.find((p) => p.seccion === s && p.folio !== null)
      return ap && ap.numero > ind.numero ? [ap.folio as string] : []
    })
    expect(esperado).toEqual(['ix', '1', '3', '5', '9'])
    expect(ind.renglones.flatMap((x) => (x.derecha ? [x.derecha] : []))).toEqual(esperado)
    expect(ind.folio).toBe('vii')
  })

  it('con los preliminares sin numero no lista la nota del principio, que no tendria folio', () => {
    const x = plan({ indice: true })
    const i = primeraDe(x, 'indice')
    expect(i.folio).toBeNull()
    expect(i.renglones.some((y) => y.texto.includes('Nota'))).toBe(false)
    expect(i.renglones.filter((y) => y.derecha).length).toBe(4)
  })

  it('romanos en minusculas, como los preliminares de Chicago', () => {
    expect([1, 4, 9, 14, 40, 90, 1999].map(romano)).toEqual(['i', 'iv', 'ix', 'xiv', 'xl', 'xc', 'mcmxcix'])
  })
})

describe('el caso de M6: 6 × 9, B/N, cuerpo 11 y la dedicatoria al final', () => {
  const r = COMPLETO.impreso
  const pdf = leerPdf(COMPLETO.pdf)

  it('la dedicatoria sale detras del ultimo capitulo, en impar y sin folio, y ya no delante', () => {
    const ded = primeraDe(r, 'dedicatoria')
    expect(ded.numero).toBeGreaterThan(Math.max(...paginaDe(r, 'capitulo').map((p) => p.numero)))
    expect(ded.numero % 2).toBe(1)
    expect(ded.folio).toBeNull()
    expect(paginaDe(r, 'dedicatoria')).toHaveLength(1)
    expect(textoDe(ded)).toBe('A quien deja una luz encendida / para los que vuelven tarde del mar.')
  })

  it('el plan y el PDF coinciden pagina a pagina: el mismo texto, las mismas imagenes, las blancas en blanco', () => {
    const pintado = textosPintados(pdf)
    expect(pintado).toHaveLength(r.paginas.length)
    r.paginas.forEach((p, i) => {
      const t = pintado[i] as ReturnType<typeof textosPintados>[number]
      expect(t.map((x) => x.texto).join(''), `pagina ${p.numero}`).toBe(glifosDe(p))
      expect(t.imagenes, `pagina ${p.numero}`).toBe(p.ops.filter((o) => o.op === 'imagen').length)
      if (p.tipo === 'blanca') expect(t).toHaveLength(0)
    })
  })

  it('el PDF mide 6 × 9 y pasa nuestra lista de PDF/X-1a', () => {
    for (const p of paginas(pdf)) {
      expect(lista(p.get('MediaBox')).map(numero)).toEqual([0, 0, 432, 648])
      expect(lista(p.get('TrimBox')).map(numero)).toEqual([0, 0, 432, 648])
    }
    expect(comprobarPdfx(pdf)).toEqual([])
  })

  it('el plan es el del golden', () => {
    // Para regenerarlo, a proposito: npx tsx scripts/impreso-prueba.ts --golden
    expect(planEnTexto(r)).toBe(readFileSync(GOLDEN_PLAN, 'utf8'))
  })
})

describe('el medianil corresponde al numero real de paginas', () => {
  const tramo = (n: number): number => (n <= 150 ? 0 : n <= 300 ? 1 : 2)

  it('compone, cuenta y vuelve a componer con el tramo que sale', () => {
    const r = buscarMedianil(tramo, (n) => String(tramo(n)), (n) => ({ paginas: tramo(n) === 0 ? 160 : 170 }))
    expect(r).toEqual({ final: { paginas: 170 }, vueltas: 2 })
  })

  it('si oscila entre dos tramos, gana el medianil mayor', () => {
    let llamadas = 0
    const r = buscarMedianil(tramo, (n) => String(tramo(n)), (n) => {
      llamadas++
      return { paginas: tramo(n) === 0 ? 151 : 150, tramo: tramo(n) }
    })
    expect(r.final).toEqual({ paginas: 150, tramo: 1 })
    expect(llamadas).toBe(2)
  })

  it('con las mismas medidas no vuelve a componer', () => {
    const r = buscarMedianil(tramo, () => 'igual', () => ({ paginas: 200 }))
    expect(r.vueltas).toBe(1)
  })

  it('un libro de mas de 150 paginas lleva el medianil de su tramo de KDP, no el del primero', () => {
    const largo: Contenido = {
      ...CONTENIDO,
      extras: [],
      capitulos: Array.from({ length: 22 }, (_v, i) => ({ numero: `Capítulo ${i + 1}`, titulo: `Parte ${i + 1}`, plano: `Parte ${i + 1}`, antes: [], bloques: capitulo(300 + i, 48) })),
    }
    const r = plan({ margenes: { ...CONFIG_IMPRESO_POR_DEFECTO.margenes, interior: 6 } }, largo)
    const n = r.paginas.length
    expect(n).toBeGreaterThan(150)
    expect(n).toBeLessThanOrEqual(300)
    expect(r.vueltas).toBe(2)
    expect(r.margenes.interior * PT_POR_MM).toBeCloseTo(medianilKdp(n), 6)
    expect(r.formato.interior).toBeCloseTo(0.5 * 72, 6)
    expect(r.avisos).toContainEqual({ codigo: 'margenSubido', lado: 'interior', elegido: 6, usado: 12.7, porque: 'medianil' })
    // Y la composicion es de verdad la de ese medianil: cada pagina impar empieza en el.
    const linea = r.paginas.find((p) => p.numero % 2 === 1 && p.tipo === 'texto')
    const xs = linea?.renglones.length ? linea.ops.filter((o) => o.op === 'texto').map((o) => o.x) : []
    expect(Math.min(...xs)).toBeCloseTo(0.5 * 72, 1)
  })

  it('el corto, el del primer tramo; y si el margen del autor ya pasa, una sola vuelta', () => {
    const r = plan({ margenes: { ...CONFIG_IMPRESO_POR_DEFECTO.margenes, interior: 6 } })
    expect(r.margenes.interior * PT_POR_MM).toBeCloseTo(medianilKdp(r.paginas.length), 6)
    expect(tramoKdp(r.paginas.length)).toBe(0)
    expect(plan().vueltas).toBe(1)
    expect(plan().margenes.interior).toBe(22)
  })
})

describe('nada impreso cae fuera de lo que admite el destino', () => {
  const f = fuentes()
  const r = COMPLETO.impreso
  /** La caja de lo que pinta cada operacion, en puntos desde la esquina superior izquierda. */
  function cajas(p: PaginaCompuesta): { x0: number; x1: number; y0: number; y1: number }[] {
    return p.ops.map((o) => {
      if (o.op === 'imagen') return { x0: o.x, x1: o.x + o.ancho, y0: o.y, y1: o.y + o.alto }
      const fu = f[o.cara]
      const ancho = o.glifos.reduce((s, g) => s + (g.avance * o.cuerpo) / fu.upm, 0)
      return { x0: o.x, x1: o.x + ancho, y0: o.y - (fu.ascendente * o.cuerpo) / fu.upm, y1: o.y + (Math.abs(fu.descendente) * o.cuerpo) / fu.upm }
    })
  }

  for (const destino of ['kdp', 'ingram'] as const) {
    it(`${destino}: con los margenes a cero, todo queda dentro, cabeceras y folios incluidos, en todos los cortes`, () => {
      for (const corte of CORTES) {
        const r = plan({ destino, corte: corte.id, margenes: { interior: 0, exterior: 0, superior: 0, inferior: 0 }, indice: true, colofon: true })
        const z = zonaSegura(destino, r.paginas.length)
        const { ancho, alto } = medidasDeCorte({ ...CONFIG_IMPRESO_POR_DEFECTO, corte: corte.id })
        for (const p of r.paginas) {
          const recto = p.numero % 2 === 1
          const izq = recto ? z.interior : z.exterior
          const der = recto ? z.exterior : z.interior
          for (const c of cajas(p)) {
            const donde = `${corte.id} pagina ${p.numero}`
            expect(c.x0, donde).toBeGreaterThanOrEqual(izq - 1e-6)
            expect(c.x1, donde).toBeLessThanOrEqual(ancho - der + 1e-6)
            expect(c.y0, donde).toBeGreaterThanOrEqual(z.superior - 1e-6)
            expect(c.y1, donde).toBeLessThanOrEqual(alto - z.inferior + 1e-6)
          }
        }
        expect(r.avisos.filter((a) => a.codigo === 'margenSubido').map((a) => (a.codigo === 'margenSubido' ? a.lado : ''))).toEqual(['interior', 'exterior', 'superior', 'inferior'])
      }
    })
  }

  it('lo que el autor eligio por encima del minimo no se toca', () => {
    const r = plan({ destino: 'ingram', margenes: { interior: 20, exterior: 20, superior: 30, inferior: 30 } })
    expect(r.margenes).toEqual({ interior: 20, exterior: 20, superior: 30, inferior: 30 })
    expect(r.avisos.some((a) => a.codigo === 'margenSubido')).toBe(false)
  })

  it('KDP: mas de 4 blancas seguidas dentro, o de 10 al final, se dice', () => {
    const p = (tipo: TipoPagina, numero: number): PaginaCompuesta => ({ numero, folio: null, tipo, seccion: 0, ops: [], renglones: [] })
    const serie = (t: string): PaginaCompuesta[] => [...t].map((c, i) => p(c === 'b' ? 'blanca' : 'texto', i + 1))
    expect(blancasSeguidas(serie('tbbbbt'))).toEqual([])
    expect(blancasSeguidas(serie('tbbbbbt'))).toEqual([{ codigo: 'blancasSeguidas', desde: 2, cuantas: 5 }])
    expect(blancasSeguidas(serie(`t${'b'.repeat(10)}`))).toEqual([])
    expect(blancasSeguidas(serie(`t${'b'.repeat(11)}`))).toEqual([{ codigo: 'blancasSeguidas', desde: 2, cuantas: 11 }])
    expect(r.avisos.some((a) => a.codigo === 'blancasSeguidas')).toBe(false)
  })
})

describe('la medida', () => {
  it('cuenta los caracteres de las lineas llenas: unos 60 en 6 × 9 a cuerpo 11', () => {
    expect(COMPLETO.impreso.caracteres).toBeGreaterThanOrEqual(55)
    expect(COMPLETO.impreso.caracteres).toBeLessThanOrEqual(65)
    expect(COMPLETO.impreso.lineasPorPagina).toBe(35)
  })

  it('fuera de 45–75 se avisa', () => {
    const ancha = plan({ corte: '8.5x11', cuerpo: 8 })
    expect(ancha.caracteres).toBeGreaterThan(75)
    expect(ancha.avisos).toContainEqual({ codigo: 'medidaFuera', caracteres: ancha.caracteres })
    expect(plan().avisos.some((a) => a.codigo === 'medidaFuera')).toBe(false)
  })

  it('KDP admite de 24 a 776 paginas en crema: el libro de prueba se queda corto y se dice', () => {
    expect(COMPLETO.impreso.avisos).toContainEqual({ codigo: 'paginasFueraDeRango', paginas: 22, min: 24, max: 776 })
  })
})

describe('la configuracion', () => {
  it('lo que no se entiende toma su valor por defecto, y los numeros se recortan a su rango', () => {
    expect(normalizarConfig(null)).toEqual(CONFIG_IMPRESO_POR_DEFECTO)
    expect(normalizarConfig('6x9')).toEqual(CONFIG_IMPRESO_POR_DEFECTO)
    const c = normalizarConfig({ destino: 'lulu', corte: '9x12', cuerpo: 90, interlineado: 'mucho', fuente: 'Comic Sans', margenes: { interior: -4, exterior: 12 }, indice: 'si', isbn: '  978-84-09-12345-2 ' })
    expect(c.destino).toBe('kdp')
    expect(c.corte).toBe('6x9')
    expect(c.cuerpo).toBe(16)
    expect(c.interlineado).toBe(CONFIG_IMPRESO_POR_DEFECTO.interlineado)
    expect(c.fuente).toBe('source-serif-4')
    expect(c.margenes).toEqual({ interior: 0, exterior: 12, superior: 20, inferior: 22 })
    expect(c.indice).toBe(false)
    expect(c.isbn).toBe('978-84-09-12345-2')
    expect(normalizarConfig({ corte: 'personalizado', personalizado: { ancho: 170, alto: 1 } }).personalizado).toEqual({ ancho: 170, alto: 76 })
  })

  it('el orden de los extras viaja con sus ids nuevos (una copia los regenera)', () => {
    const c = normalizarConfig({ extras: [{ id: 'viejo', donde: 'final', incluir: false }, { nada: 1 }] }, (v) => `nuevo-${v}`)
    expect(c.extras).toEqual([{ id: 'nuevo-viejo', donde: 'final', incluir: false }])
  })

  it('el orden guardado manda; lo que ya no existe se quita y lo nuevo entra al final de su grupo', () => {
    const c: ConfigImpreso = { ...CONFIG_IMPRESO_POR_DEFECTO, extras: [{ id: 'b', donde: 'final', incluir: true }, { id: 'borrado', donde: 'inicio', incluir: true }, { id: 'a', donde: 'inicio', incluir: false }] }
    expect(ordenDeExtras(c, [{ id: 'a', donde: 'inicio' }, { id: 'b', donde: 'inicio' }, { id: 'c', donde: 'final' }, { id: 'd', donde: 'inicio' }])).toEqual([
      { id: 'a', donde: 'inicio', incluir: false },
      { id: 'd', donde: 'inicio', incluir: true },
      { id: 'b', donde: 'final', incluir: true },
      { id: 'c', donde: 'final', incluir: true },
    ])
    expect(ordenDeExtras(CONFIG_IMPRESO_POR_DEFECTO, CONTENIDO.extras).map((e) => e.id)).toEqual(['dedicatoria.md', 'epigrafe.md', 'inicio-nota.md', 'agradecimientos.md'])
  })

  it('al cambiar de letra, el cuerpo recomendado la sigue si el autor no lo habia tocado', () => {
    const c = conFuente(CONFIG_IMPRESO_POR_DEFECTO, 'eb-garamond')
    expect([c.fuente, c.cuerpo, c.interlineado]).toEqual(['eb-garamond', familia('eb-garamond').cuerpo, familia('eb-garamond').interlineado])
    const tocado = conFuente({ ...CONFIG_IMPRESO_POR_DEFECTO, cuerpo: 11 }, 'eb-garamond')
    expect([tocado.fuente, tocado.cuerpo, tocado.interlineado]).toEqual(['eb-garamond', 11, CONFIG_IMPRESO_POR_DEFECTO.interlineado])
  })

  it('el ISBN se comprueba por su digito de control', () => {
    expect(isbnValido('978-84-09-12345-2')).toBe(true)
    expect(isbnValido('978-84-09-12345-3')).toBe(false)
    expect(isbnValido('0-306-40615-2')).toBe(true)
    expect(isbnValido('0-306-40615-3')).toBe(false)
    expect(isbnValido('84-X')).toBe(false)
    expect(plan({ isbn: '978-84-09-12345-3' }).avisos).toContainEqual({ codigo: 'isbnNoValido', isbn: '978-84-09-12345-3' })
  })

  it('el corte en puntos, tambien el personalizado de una imprenta, en milimetros', () => {
    expect(medidasDeCorte(CONFIG_IMPRESO_POR_DEFECTO)).toEqual({ ancho: 432, alto: 648 })
    const p = medidasDeCorte({ ...CONFIG_IMPRESO_POR_DEFECTO, corte: 'personalizado', personalizado: { ancho: 170, alto: 230 } })
    expect(p.ancho).toBeCloseTo(170 * PT_POR_MM, 9)
    expect(p.alto).toBeCloseTo(230 * PT_POR_MM, 9)
  })

  it('la configuracion del caso de M6 es la que dice', () => {
    const c = configDePrueba(CONTENIDO)
    expect([c.corte, c.cuerpo]).toEqual(['6x9', 11])
    expect(c.extras?.find((e) => e.id === 'dedicatoria.md')?.donde).toBe('final')
  })
})

describe('las cifras de cada destino, escritas a mano (no contra la misma tabla)', () => {
  it('KDP: el medianil por tramos de paginas, 0,25 in fuera; IngramSpark 0,5 in en todo', () => {
    expect([24, 150, 151, 300, 301, 500, 501, 700, 701, 828].map((n) => medianilKdp(n) / 72)).toEqual([0.375, 0.375, 0.5, 0.5, 0.625, 0.625, 0.75, 0.75, 0.875, 0.875])
    expect([150, 151, 301, 501, 701].map(tramoKdp)).toEqual([0, 1, 2, 3, 4])
    expect(zonaSegura('kdp', 200)).toEqual({ interior: 36, exterior: 18, superior: 18, inferior: 18 })
    expect(zonaSegura('ingram', 200)).toEqual({ interior: 36, exterior: 36, superior: 36, inferior: 36 })
    expect(zonaSegura('imprenta', 200)).toEqual({ interior: 0, exterior: 0, superior: 0, inferior: 0 })
  })
})

describe('las opciones cambian la pagina como dicen', () => {
  const tituloY = (r: Impreso): number => (primeraDe(r, 'capitulo').renglones.find((x) => x.clase === 'titulo') as { y: number }).y

  it('la caida: alta, a un tercio y baja, en ese orden', () => {
    const [alta, media, baja] = (['alta', 'media', 'baja'] as const).map((caida) => tituloY(plan({ caida })))
    expect(alta).toBeLessThan(media as number)
    expect(media).toBeLessThan(baja as number)
  })

  it('justificado: las lineas llenas acaban en la medida; en bandera, no', () => {
    const f = fuentes()
    /** Donde acaba cada linea de parrafo que no es la ultima, en las paginas de texto. */
    const finales = (r: Impreso): number[] =>
      r.paginas.filter((p) => p.tipo === 'texto' || p.tipo === 'apertura').flatMap((p) =>
        p.renglones
          .filter((x) => x.clase === 'parrafo' && x.linea < x.de - 1)
          .map((x) => Math.max(...p.ops.filter((o) => o.op === 'texto' && Math.abs(o.y - x.y) < 1e-6).map((o) => (o.op === 'texto' ? o.x + o.glifos.reduce((s, g) => s + (g.avance * o.cuerpo) / f[o.cara].upm, 0) : 0))) - (p.numero % 2 === 1 ? r.formato.interior : r.formato.exterior)),
      )
    const medida = (r: Impreso): number => r.formato.ancho - r.formato.interior - r.formato.exterior
    const just = plan()
    expect(finales(just).every((x) => Math.abs(x - medida(just)) < 0.05)).toBe(true)
    const band = plan({ alineacion: 'bandera' })
    expect(finales(band).filter((x) => medida(band) - x > 2).length).toBeGreaterThan(10)
    expect(band.paginas.flatMap((p) => p.renglones).some((x) => x.guion && x.clase === 'parrafo')).toBe(false)
  })

  it('los creditos acaban en la ultima linea de la caja', () => {
    const r = plan()
    const ult = Math.max(...primeraDe(r, 'creditos').renglones.map((x) => x.y))
    expect(ult).toBeCloseTo(r.formato.superior + 10.5 + (r.lineasPorPagina - 1) * 14.49, 6)
  })

  it('el epigrafe centrado reparte sus dos lineas, no deja «Dicho de» sola', () => {
    expect(primeraDe(COMPLETO.impreso, 'epigrafe').renglones.map((x) => x.texto)).toEqual([
      'El mar no devuelve nada que no haya pedido antes.',
      'Dicho de la costa, que nadie',
      'recuerda haber oído por primera vez',
    ])
  })

  it('el folio de cada entrada del indice se PINTA, contra el margen de fuera', () => {
    const r = COMPLETO.impreso
    const ind = primeraDe(r, 'indice')
    const f = fuentes()
    const derecho = (ind.numero % 2 === 1 ? r.formato.interior : r.formato.exterior) + (r.formato.ancho - r.formato.interior - r.formato.exterior)
    const conFolio = ind.renglones.filter((x) => x.derecha)
    expect(conFolio.length).toBe(5)
    for (const x of conFolio) {
      const op = ind.ops.find((o) => o.op === 'texto' && Math.abs(o.y - x.y) < 1e-6 && o.glifos.map((g) => g.texto).join('') === x.derecha)
      expect(op, x.derecha).toBeDefined()
      if (op?.op !== 'texto') continue
      expect(op.x + op.glifos.reduce((s, g) => s + (g.avance * op.cuerpo) / f[op.cara].upm, 0)).toBeCloseTo(derecho, 6)
    }
  })
})
