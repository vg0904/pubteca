import { describe, expect, it } from 'vitest'
import { bloquesDelModelo, htmlDeTramos } from '../src/app/html'
import {
  capituloDesdeDialecto,
  partirCabecera,
  reiniciarIds,
  resumir,
} from '../src/app/importar/dialecto'
import { tramosDeHtml } from '../src/app/importar/html-en-linea'
import { normalizarLinea, type Bloque, type Capitulo, type Marca, type Tramo } from '../src/app/modelo'
import { serializarCapitulo } from '../src/app/serializar'

const t = (texto: string, ...marcas: Marca[]): Tramo => ({ texto, marcas })

describe('tramosDeHtml: el inverso de htmlDeTramos', () => {
  const casos: Tramo[][] = [
    [t('texto llano')],
    [t('con ', ), t('cursiva', 'cursiva'), t(' y '), t('negrita', 'negrita')],
    [t('las dos', 'cursiva', 'negrita')],
    [t('a&b<c>d')],
    [t('&amp; ya escapado')],
    [t('<em>no es etiqueta</em>')],
    [t('\u00d1and\u00fa \u00e9\u00f1 \u{1F600}')],
    [t('a'), t('b', 'negrita'), t('c'), t('d', 'cursiva')],
  ]

  for (const tramos of casos) {
    it(JSON.stringify(tramos.map((x) => x.texto).join('')), () => {
      // El HTML lo genera htmlDeTramos; volver a tramos tiene que dar lo mismo.
      expect(tramosDeHtml(htmlDeTramos(tramos))).toEqual(normalizarLinea(tramos))
    })
  }

  it('las entidades se deshacen en el orden correcto', () => {
    // Si &amp; se deshiciera primero, «&amp;lt;» acabaria como «<».
    expect(tramosDeHtml('&amp;lt;')[0]?.texto).toBe('&lt;')
    expect(tramosDeHtml('&amp;amp;')[0]?.texto).toBe('&amp;')
  })

  it('un strong con un em dentro da las dos marcas, en orden canonico', () => {
    // El motor emite `<strong><em>`, asi que el orden de encuentro seria
    // negrita-cursiva. Se canoniza porque el orden no significa nada: sin eso,
    // importar lo que se acaba de serializar no daba el mismo modelo.
    expect(tramosDeHtml('<strong><em>x</em></strong>')).toEqual([
      { texto: 'x', marcas: ['cursiva', 'negrita'] },
    ])
    expect(tramosDeHtml('<em><strong>x</strong></em>')).toEqual([
      { texto: 'x', marcas: ['cursiva', 'negrita'] },
    ])
  })

  it('una cadena vacia da cero tramos', () => {
    expect(tramosDeHtml('')).toEqual([])
  })
})

describe('partirCabecera', () => {
  const casos: [string, string, string][] = [
    ['Cap\u00edtulo 1: La luz', 'Cap\u00edtulo 1', 'La luz'],
    ['Cap. 3: El bosque', 'Cap. 3', 'El bosque'],
    ['Pr\u00f3logo: Antes', 'Pr\u00f3logo', 'Antes'],
    ['Ep\u00edlogo', '', 'Ep\u00edlogo'],
    ['Un titulo cualquiera', '', 'Un titulo cualquiera'],
    ['Cap\u00edtulo 13', '', 'Cap\u00edtulo 13'],
  ]
  for (const [entrada, etiqueta, titulo] of casos) {
    it(`«${entrada}»`, () => {
      expect(partirCabecera(entrada)).toEqual({ etiqueta, titulo })
    })
  }
})

describe('capituloDesdeDialecto', () => {
  it('un capitulo con todo dentro', () => {
    const texto = [
      '[ilustraci\u00f3n: img-a | lamina de apertura]',
      'Cap\u00edtulo 2: Lo que dec\u00eda el cuaderno',
      '',
      'Primer p\u00e1rrafo con *cursiva* y **negrita**.',
      '',
      '* * *',
      '',
      '# Una parte',
      '',
      'Texto de la parte.',
      '',
      '> primer verso',
      '> segundo verso',
      '>',
      '> otra estrofa',
      '',
      '[ilustraci\u00f3n: img-b | el cuaderno]',
      '',
      'Final.',
      '',
    ].join('\n')

    const cap = capituloDesdeDialecto(texto)
    expect(cap).not.toBeNull()
    expect(cap?.etiqueta).toBe('Cap\u00edtulo 2')
    expect(cap?.titulo).toEqual([t('Lo que dec\u00eda el cuaderno')])
    expect(cap?.aperturas).toEqual([{ imagenId: 'img-a', alt: 'lamina de apertura' }])
    expect(cap?.bloques.map((b) => b.tipo)).toEqual([
      'parrafo',
      'escena',
      'subtitulo',
      'parrafo',
      'versos',
      'ilustracion',
      'parrafo',
    ])

    const versos = cap?.bloques.find((b) => b.tipo === 'versos')
    expect(versos?.tipo === 'versos' && versos.estrofas).toEqual([
      [t('primer verso'), t('segundo verso')],
      [t('otra estrofa')],
    ])
  })

  it('un archivo vacio no da capitulo', () => {
    expect(capituloDesdeDialecto('')).toBeNull()
    expect(capituloDesdeDialecto('\n\n  \n')).toBeNull()
  })

  it('un archivo sin cabecera reconocible usa la primera linea como titulo', () => {
    const cap = capituloDesdeDialecto('El faro\n\nTexto.')
    expect(cap?.etiqueta).toBe('')
    expect(cap?.titulo).toEqual([t('El faro')])
  })

  it('los versos sueltos se agrupan en UN bloque con sus estrofas', () => {
    const cap = capituloDesdeDialecto('T\n> a\n> b\n>\n> c\n')
    expect(cap?.bloques).toHaveLength(1)
    const b = cap?.bloques[0]
    expect(b?.tipo === 'versos' && b.estrofas).toEqual([[t('a'), t('b')], [t('c')]])
  })

  it('dos bloques de versos separados por prosa no se mezclan', () => {
    const cap = capituloDesdeDialecto('T\n> a\n\nprosa\n\n> b\n')
    expect(cap?.bloques.map((x) => x.tipo)).toEqual(['versos', 'parrafo', 'versos'])
  })
})

describe('LA VUELTA COMPLETA: modelo -> dialecto -> modelo', () => {
  /**
   * La propiedad mas fuerte del proyecto: un modelo, serializado al dialecto y
   * vuelto a importar, tiene que dar el MISMO modelo (los ids no cuentan: son
   * internos y se regeneran).
   *
   * Si esto se cumple, el .zip del proyecto es un formato sin perdidas y el
   * autor puede entrar y salir de la app sin que su libro se degrade.
   */
  function sinIds(cap: Capitulo): unknown {
    const limpiarBloque = (b: Bloque): unknown => {
      switch (b.tipo) {
        case 'parrafo':
        case 'subtitulo':
          return { tipo: b.tipo, tramos: normalizarLinea(b.tramos) }
        case 'escena':
          return { tipo: 'escena' }
        case 'versos':
          return {
            tipo: 'versos',
            estrofas: b.estrofas
              .map((e) => e.map((v) => normalizarLinea([v])[0]).filter(Boolean))
              .filter((e) => e.length > 0),
          }
        case 'ilustracion':
          return { tipo: 'ilustracion', imagenId: b.imagenId, alt: b.alt.trim() }
      }
    }
    return {
      etiqueta: cap.etiqueta,
      titulo: normalizarLinea(cap.titulo),
      aperturas: cap.aperturas.map((a) => ({ imagenId: a.imagenId, alt: a.alt.trim() })),
      bloques: cap.bloques.map(limpiarBloque),
    }
  }

  function vuelta(cap: Capitulo): { ida: unknown; vuelta: unknown; avisos: number } {
    const s = serializarCapitulo(cap, '* * *')
    reiniciarIds()
    const leido = capituloDesdeDialecto(s.texto)
    return {
      ida: sinIds(cap),
      vuelta: leido ? sinIds(leido) : null,
      avisos: s.avisos.length,
    }
  }

  const p = (tramos: Tramo[]): Bloque => ({ id: 'x', tipo: 'parrafo', tramos })
  const sub = (tramos: Tramo[]): Bloque => ({ id: 'x', tipo: 'subtitulo', tramos })
  const escena = (): Bloque => ({ id: 'x', tipo: 'escena' })
  const versos = (estrofas: Tramo[][]): Bloque => ({ id: 'x', tipo: 'versos', estrofas })
  const ilus = (imagenId: string, alt: string): Bloque => ({
    id: 'x',
    tipo: 'ilustracion',
    imagenId,
    alt,
    decorativa: false,
  })

  const cap = (bloques: Bloque[], etiqueta = 'Cap\u00edtulo 1', titulo: Tramo[] = [t('Titulo')]): Capitulo => ({
    id: 'c',
    etiqueta,
    titulo,
    aperturas: [],
    bloques,
  })

  const casos: [string, Capitulo][] = [
    ['parrafos llanos', cap([p([t('Uno.')]), p([t('Dos.')])])],
    [
      'enfasis variado',
      cap([
        p([t('a '), t('cursiva', 'cursiva'), t(' b '), t('negrita', 'negrita'), t(' c')]),
        p([t('las dos', 'cursiva', 'negrita')]),
      ]),
    ],
    ['todos los tipos de bloque', cap([p([t('x')]), escena(), sub([t('S')]), versos([[t('v1'), t('v2')], [t('v3')]]), ilus('img-1', 'una cabana')])],
    ['texto que rompe el dialecto', cap([p([t('5 * 3 y snake_case y C:\\\\ruta')]), p([t('> no verso')]), p([t('# no sub')]), p([t('* * *')])])],
    ['HTML y acentos', cap([p([t('a & b < c > d')]), p([t('\u00d1and\u00fa caf\u00e9 \u{1F600}')])])],
    ['etiquetas de cabecera', cap([p([t('x')])], 'Pr\u00f3logo', [t('Antes de todo')])],
    ['Cap. 3 abreviado', cap([p([t('x')])], 'Cap. 3', [t('El bosque')])],
    ['sin etiqueta', cap([p([t('x')])], '', [t('Un titulo suelto')])],
    ['titulo con enfasis parcial', cap([p([t('x')])], 'Cap\u00edtulo 4', [t('El '), t('faro', 'cursiva')])],
    [
      'ilustraciones de apertura',
      {
        id: 'c',
        etiqueta: 'Cap\u00edtulo 5',
        titulo: [t('Apertura')],
        aperturas: [{ imagenId: 'img-a', alt: 'uno' }, { imagenId: 'img-b', alt: 'dos' }],
        bloques: [p([t('x')])],
      },
    ],
  ]

  for (const [nombre, c] of casos) {
    it(nombre, () => {
      const r = vuelta(c)
      expect(r.avisos).toBe(0)
      expect(r.vuelta).toEqual(r.ida)
    })
  }

  it('el modelo importado significa lo mismo para el motor', () => {
    for (const [, c] of casos) {
      const s = serializarCapitulo(c, '* * *')
      reiniciarIds()
      const leido = capituloDesdeDialecto(s.texto)
      expect(bloquesDelModelo(leido?.bloques ?? [])).toEqual(bloquesDelModelo(c.bloques))
    }
  })
})

describe('resumir: lo que ve el escritor en la pantalla de confirmacion', () => {
  it('cuenta lo que entro', () => {
    reiniciarIds()
    const cap = capituloDesdeDialecto(
      'Cap\u00edtulo 1: T\n\nuno *con enfasis*\n\ndos\n\n* * *\n\n# sub\n\n> v1\n> v2\n\n[ilustraci\u00f3n: i | d]\n',
    )
    expect(resumir([cap as Capitulo])).toEqual({
      capitulos: 1,
      parrafos: 2,
      enfasis: 1,
      versos: 2,
      subtitulos: 1,
      escenas: 1,
      ilustraciones: 1,
    })
  })
})
