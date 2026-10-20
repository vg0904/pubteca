import { describe, expect, it } from 'vitest'
import { parsear, RE_TITULO, RE_SEPARADOR_TITULO } from '../src/core/parser'
import { partirUnaVez, textoPlano } from '../src/core/texto'
import { bloquesDelModelo, htmlDeTramos } from '../src/app/html'
import { normalizarTramos, type Bloque, type Capitulo, type Marca, type Tramo } from '../src/app/modelo'
import { serializarCapitulo } from '../src/app/serializar'

/**
 * EL TEST DE IDA Y VUELTA.
 *
 * El modelo de la app es la verdad y el dialecto de Markdown es solo su
 * serializacion. Si la serializacion pierde algo, el escritor ve una cosa en
 * la app y otra en su Kindle, que es el fallo mas caro de esta herramienta.
 *
 * La propiedad: serializar un modelo, pasarlo por el parser DEL MOTOR, y
 * comprobar que los bloques que salen son exactamente los que el modelo
 * significaba (calculados aparte, en app/html.ts).
 */

let id = 0
const nuevoId = (): string => `b${++id}`

const p = (tramos: Tramo[]): Bloque => ({ id: nuevoId(), tipo: 'parrafo', tramos })
const sub = (tramos: Tramo[]): Bloque => ({ id: nuevoId(), tipo: 'subtitulo', tramos })
const escena = (): Bloque => ({ id: nuevoId(), tipo: 'escena' })
const versos = (estrofas: Tramo[][]): Bloque => ({ id: nuevoId(), tipo: 'versos', estrofas })
const ilus = (imagenId: string, alt: string): Bloque => ({
  id: nuevoId(),
  tipo: 'ilustracion',
  imagenId,
  alt,
  decorativa: false,
})
const t = (texto: string, ...marcas: Marca[]): Tramo => ({ texto, marcas })

function capitulo(bloques: Bloque[], etiqueta = 'Cap\u00edtulo 1', titulo = 'Un titulo'): Capitulo {
  return { id: 'c1', etiqueta, titulo: [t(titulo)], aperturas: [], bloques }
}

/** Serializa, parsea con el motor, y compara con lo que el modelo significaba. */
function idaYVuelta(cap: Capitulo, separador = '* * *') {
  const s = serializarCapitulo(cap, separador)
  const r = parsear(s.texto)
  return {
    texto: s.texto,
    avisos: s.avisos,
    obtenido: r.bloques,
    esperado: bloquesDelModelo(cap.bloques),
    titulo: r.titulo,
    aperturas: r.antes,
  }
}

function sinPerdidas(cap: Capitulo, separador = '* * *'): void {
  const r = idaYVuelta(cap, separador)
  expect(r.avisos).toEqual([])
  expect(r.obtenido).toEqual(r.esperado)
}

describe('ida y vuelta: casos basicos', () => {
  it('un parrafo llano', () => {
    sinPerdidas(capitulo([p([t('Hola mundo.')])]))
  })

  it('cursiva, negrita y las dos', () => {
    sinPerdidas(
      capitulo([
        p([t('Dijo '), t('en voz baja', 'cursiva'), t(' y luego '), t('grito', 'negrita'), t('.')]),
        p([t('Esto es ', ), t('todo junto', 'cursiva', 'negrita'), t('.')]),
      ]),
    )
  })

  it('cambio de escena, subtitulo y versos con estrofas', () => {
    sinPerdidas(
      capitulo([
        p([t('Antes.')]),
        escena(),
        sub([t('Una parte')]),
        p([t('Despues.')]),
        versos([
          [t('primer verso'), t('segundo verso')],
          [t('otra estrofa'), t('y su cierre')],
        ]),
        p([t('Vuelve la prosa.')]),
      ]),
    )
  })

  it('ilustracion en medio del texto', () => {
    sinPerdidas(capitulo([p([t('Antes.')]), ilus('img-7', 'La cabana de noche'), p([t('Despues.')])]))
  })

  it('un capitulo vacio de bloques', () => {
    sinPerdidas(capitulo([]))
  })
})

describe('ida y vuelta: el texto que rompe el dialecto', () => {
  it('asteriscos y guiones bajos literales', () => {
    sinPerdidas(
      capitulo([
        p([t('5 * 3 * 2 = 30')]),
        p([t('snake_case_aqui y mas_cosas_')]),
        p([t('un *asterisco* literal')]),
        p([t('**no es negrita**')]),
        p([t('***ni esto***')]),
      ]),
    )
  })

  it('barras invertidas', () => {
    sinPerdidas(
      capitulo([
        p([t('C:\\Users\\ana')]),
        p([t('una \\ sola')]),
        p([t('doble \\\\ barra')]),
        p([t('\\*ya escapado\\*')]),
      ]),
    )
  })

  it('un parrafo que empieza por un marcador de bloque', () => {
    // Esto es exactamente lo que el bug nº7 hacia imposible.
    sinPerdidas(
      capitulo([
        p([t('> esto no es un verso')]),
        p([t('# esto no es un subtitulo')]),
        p([t('#### ni esto')]),
        p([t('[ilustracion: no soy una marca]')]),
        p([t('[cualquier cosa entre corchetes]')]),
      ]),
    )
  })

  it('un parrafo que parece un cambio de escena', () => {
    sinPerdidas(capitulo([p([t('* * *')]), p([t('---')]), p([t('___')]), p([t('- - -')])]))
  })

  it('caracteres de HTML', () => {
    sinPerdidas(
      capitulo([
        p([t('a & b < c > d')]),
        p([t('comillas "dobles" y \u2018simples\u2019')]),
        p([t("apostrofe d'Artagnan")]),
        p([t('&amp; ya escapado')]),
        p([t('<em>no es una etiqueta</em>')]),
      ]),
    )
  })

  it('acentos, enes y caracteres de fuera del plano basico', () => {
    sinPerdidas(
      capitulo([
        p([t('\u00d1and\u00fa, a\u00f1o, caf\u00e9, \u00bfqu\u00e9?')]),
        p([t('cami\u00f1\u00f3_x_fin')]),
        p([t('un emoji \u{1F600} suelto')]),
        p([t('\u65e5\u672c\u8a9e')]),
      ]),
    )
  })

  it('espacios en medio de un tramo con marcas: el espacio sale fuera', () => {
    // Las regex del motor no aceptan «* texto *», asi que el espacio va fuera
    // de los asteriscos, que es lo tipograficamente correcto.
    sinPerdidas(capitulo([p([t('antes'), t(' en medio ', 'cursiva'), t('despues')])]))
  })

  it('el espacio en los EXTREMOS de una linea no es contenido', () => {
    // El motor recorta cada linea, asi que no hay forma de representarlo.
    // El modelo lo sabe (normalizarLinea) en vez de fingir que lo conserva.
    sinPerdidas(capitulo([p([t(' arranca con espacio ', 'negrita')])]))
    sinPerdidas(capitulo([p([t('   '), t('x'), t('   ')])]))
    sinPerdidas(capitulo([versos([[t('  un verso con espacios  ')]])]))
  })

  it('marcas adyacentes del mismo y de distinto tipo', () => {
    sinPerdidas(
      capitulo([
        p([t('a', 'cursiva'), t('b', 'cursiva')]),
        p([t('a', 'negrita'), t('b', 'negrita')]),
        p([t('a', 'negrita'), t('b', 'cursiva')]),
        p([t('a', 'cursiva'), t('b', 'negrita')]),
        p([t('a', 'cursiva', 'negrita'), t('b', 'cursiva')]),
      ]),
    )
  })

  it('el separador de escena personalizado', () => {
    for (const sep of ['* * *', '***', '\u2042', '- - -']) {
      sinPerdidas(capitulo([p([t('Antes.')]), escena(), p([t('Despues.')])]), sep)
    }
  })

  it('versos con texto que rompe el dialecto', () => {
    sinPerdidas(
      capitulo([
        versos([[t('un verso con *asteriscos*'), t('y uno con & ampersand')]]),
        versos([[t('otro', 'cursiva')]]),
      ]),
    )
  })

  it('la descripcion de una ilustracion con comillas y acentos', () => {
    sinPerdidas(
      capitulo([ilus('img-1', 'Marta "de espaldas", con la ca\u00f1a y el a\u00f1o')]),
    )
  })
})

describe('lo que el dialecto NO puede representar: se avisa, no se corrompe', () => {
  it('un parrafo hecho solo de simbolos de escena no escapables', () => {
    const r = idaYVuelta(capitulo([p([t('\u2042')])]))
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]?.porque).toContain('cambio de escena')
    expect(r.avisos[0]?.sugerencia).toContain('Anade una palabra')
  })

  it('un titulo con el enfasis aplicado a todo el texto', () => {
    const cap: Capitulo = {
      id: 'c',
      etiqueta: '',
      titulo: [t('Todo en cursiva', 'cursiva')],
      aperturas: [],
      bloques: [p([t('x')])],
    }
    const r = idaYVuelta(cap)
    expect(r.avisos.some((a) => a.porque.includes('TODO el texto'))).toBe(true)
  })

  it('un titulo sin etiqueta que ya parece una cabecera', () => {
    const cap: Capitulo = {
      id: 'c',
      etiqueta: '',
      titulo: [t('Cap\u00edtulo 9: El faro')],
      aperturas: [],
      bloques: [p([t('x')])],
    }
    const r = idaYVuelta(cap)
    expect(r.avisos.some((a) => a.porque.includes('parece ya una cabecera'))).toBe(true)
  })

  it('un parrafo con un simbolo de escena pero algo mas de texto si pasa', () => {
    sinPerdidas(capitulo([p([t('\u2042 y algo mas')])]))
  })
})

describe('ida y vuelta: la cabecera del capitulo', () => {
  /** Replica lo que hace libro.capitulos() al leer el titulo. */
  function leerCabecera(titulo: string): { etiqueta: string; titulo: string } {
    const mPlano = RE_TITULO.exec(textoPlano(titulo))
    if (mPlano && mPlano[2]) {
      const mCrudo = RE_TITULO.exec(titulo)
      return { etiqueta: mPlano[1] as string, titulo: (mCrudo?.[2] ?? mPlano[2]).trim() }
    }
    return { etiqueta: '', titulo }
  }

  const casos: [string, string][] = [
    ['Cap\u00edtulo 1', 'La luz que no tocaba'],
    ['Cap\u00edtulo 13', 'Nombres'],
    ['Cap. 3', 'El bosque'],
    ['Pr\u00f3logo', 'Antes de todo'],
    ['Ep\u00edlogo', 'Lo que quedo'],
    ['Interludio', 'Una pausa'],
    ['', 'Un titulo sin etiqueta'],
  ]

  for (const [etiqueta, titulo] of casos) {
    it(`«${etiqueta}» + «${titulo}»`, () => {
      const r = idaYVuelta(capitulo([p([t('x')])], etiqueta, titulo))
      expect(r.avisos).toEqual([])
      const leido = leerCabecera(r.titulo as string)
      expect(leido).toEqual({ etiqueta, titulo })
    })
  }

  it('«Cap. 3» funciona gracias al arreglo del bug del titulo', () => {
    // Con el Python original esto daba la etiqueta «Cap. 3» y el titulo
    // «3: El bosque». Ver tests/divergencias.ts.
    const r = idaYVuelta(capitulo([p([t('x')])], 'Cap. 3', 'El bosque'))
    const leido = leerCabecera(r.titulo as string)
    expect(leido.titulo).toBe('El bosque')
    expect(partirUnaVez(r.titulo as string, RE_SEPARADOR_TITULO)[1]).toBe('3: El bosque')
  })

  it('las ilustraciones de apertura van antes de la cabecera', () => {
    const cap: Capitulo = {
      id: 'c',
      etiqueta: 'Cap\u00edtulo 2',
      titulo: [t('Apertura')],
      aperturas: [
        { imagenId: 'img-a', alt: 'lamina uno' },
        { imagenId: 'img-b', alt: 'lamina dos' },
      ],
      bloques: [p([t('Texto.')])],
    }
    const r = idaYVuelta(cap)
    expect(r.avisos).toEqual([])
    expect(r.aperturas).toEqual([
      { nombre: 'img-a', alt: 'lamina uno' },
      { nombre: 'img-b', alt: 'lamina dos' },
    ])
  })
})

describe('ida y vuelta: 600 modelos generados', () => {
  // Generador determinista: con Math.random un fallo no se podria reproducir,
  // que es lo peor que le puede pasar a un test de propiedad.
  let semilla = 0x1a2b3c4d
  const siguiente = (n: number): number => {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff
    return (semilla >>> 7) % n
  }

  const PIEZAS = [
    'Hola', ' ', 'mundo', '*', '**', '***', '_', '__', '\\', '>', '#', '[', ']', '|',
    '&', '<', '>', '"', "'", '\u00f1', '\u00e9', '\u2014', '\u2042', '-', '.', '!',
    '~', '`', '{', '}', '(', ')', '+', 'a', 'z', '5', '\u{1F600}', '\u65e5', '  ',
  ]

  const textoAleatorio = (): string => {
    let s = ''
    for (let i = 0; i < 1 + siguiente(6); i++) s += PIEZAS[siguiente(PIEZAS.length)]
    return s
  }

  const marcasAleatorias = (): Marca[] => {
    const n = siguiente(4)
    if (n === 0) return []
    if (n === 1) return ['cursiva']
    if (n === 2) return ['negrita']
    return ['cursiva', 'negrita']
  }

  const tramosAleatorios = (): Tramo[] => {
    const salida: Tramo[] = []
    for (let i = 0; i < 1 + siguiente(3); i++) {
      salida.push({ texto: textoAleatorio(), marcas: marcasAleatorias() })
    }
    return salida
  }

  const bloqueAleatorio = (): Bloque => {
    switch (siguiente(5)) {
      case 0:
        return sub(tramosAleatorios())
      case 1:
        return escena()
      case 2:
        return versos(
          Array.from({ length: 1 + siguiente(2) }, () =>
            Array.from({ length: 1 + siguiente(3) }, () => ({
              texto: textoAleatorio(),
              marcas: marcasAleatorias(),
            })),
          ),
        )
      case 3:
        return ilus(`img-${siguiente(9)}`, textoAleatorio())
      default:
        return p(tramosAleatorios())
    }
  }

  it('todos los modelos sin avisos sobreviven la ida y vuelta', () => {
    let conAviso = 0
    let comprobados = 0
    const fallos: string[] = []

    for (let n = 0; n < 600; n++) {
      const bloques = Array.from({ length: 1 + siguiente(5) }, bloqueAleatorio)
      const cap = capitulo(bloques)
      const r = idaYVuelta(cap)
      if (r.avisos.length > 0) {
        conAviso++
        continue
      }
      comprobados++
      if (JSON.stringify(r.obtenido) !== JSON.stringify(r.esperado)) {
        fallos.push(
          `modelo ${n}\n  texto: ${JSON.stringify(r.texto)}\n` +
            `  esperado: ${JSON.stringify(r.esperado)}\n  obtenido: ${JSON.stringify(r.obtenido)}`,
        )
      }
    }

    expect(fallos.slice(0, 3)).toEqual([])
    // Si casi todo acabara en aviso, el test no estaria probando nada.
    expect(comprobados).toBeGreaterThan(400)
    expect(conAviso).toBeLessThan(200)
  })
})

describe('htmlDeTramos coincide con lo que produce el motor', () => {
  it('normaliza igual que normalizarTramos', () => {
    expect(htmlDeTramos([t('a'), t('b')])).toBe('ab')
    expect(htmlDeTramos([t(''), t('a')])).toBe('a')
    expect(normalizarTramos([t('a', 'cursiva'), t('b', 'cursiva')])).toHaveLength(1)
  })

  it('escapa solo & < > , como escInline', () => {
    expect(htmlDeTramos([t(`a&b<c>"d'e`)])).toBe(`a&amp;b&lt;c&gt;"d'e`)
  })

  it('las dos marcas dan strong por fuera y em por dentro', () => {
    expect(htmlDeTramos([t('x', 'cursiva', 'negrita')])).toBe('<strong><em>x</em></strong>')
  })
})
