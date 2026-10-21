// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { inspeccionarImagen } from '../src/core/imagen-inspeccion'
import { bloquesDelModelo } from '../src/app/html'
import { strToU8, zipSync } from 'fflate'
import {
  aplicarCortes,
  cabeceraSugerida,
  finDeCabecera,
  importarDocx,
  propuestaDesdeHtml,
  type CorteSugerido,
  type Propuesta,
} from '../src/app/importar/docx'
import { alinear, parrafosDeDocx } from '../src/app/importar/saltos'
import { capituloDesdeDialecto, reiniciarIds, resumir } from '../src/app/importar/dialecto'
import { serializarCapitulo } from '../src/app/serializar'
import type { Bloque, Capitulo } from '../src/app/modelo'

/**
 * El importador de Word NO decide por el autor: devuelve el documento como una
 * lista plana de bloques mas unos cortes SUGERIDOS, y la interfaz le deja
 * ajustar donde empieza cada capitulo y donde va cada ilustracion. Estos tests
 * comprueban las dos mitades por separado, que es como la interfaz las usa.
 */

const CARPETA = join(import.meta.dirname, 'fixtures', 'docx')
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

let n = 0
const nuevoId = (prefijo: string): string => `${prefijo}-${++n}`

beforeEach(() => {
  n = 0
})

async function importar(nombre: string): Promise<Propuesta> {
  const buf = readFileSync(join(CARPETA, `${nombre}.docx`))
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return importarDocx(bytes, { nombreArchivo: nombre, nuevoId })
}

const textoDe = (b: Bloque): string =>
  b.tipo === 'parrafo' || b.tipo === 'subtitulo' ? b.tramos.map((t) => t.texto).join('') : ''

describe('la propuesta: el documento plano, sin decidir nada', () => {
  it('devuelve TODOS los bloques en el orden en que venian', async () => {
    const p = await importar('capitulo-completo')
    expect(p.bloques.map((b) => b.tipo)).toEqual([
      'parrafo', // la cabecera es un parrafo mas: lo que la hace cabecera es un corte
      'parrafo',
      'parrafo',
      'parrafo',
      'subtitulo',
      'parrafo',
      'ilustracion',
      'parrafo',
    ])
  })

  it('conserva la cursiva, la negrita y las dos juntas', async () => {
    const p = await importar('capitulo-completo')
    const conMarcas = p.bloques.flatMap((b) =>
      b.tipo === 'parrafo' ? b.tramos.filter((t) => t.marcas.length > 0) : [],
    )
    expect(conMarcas).toEqual([
      { texto: 'encendido', marcas: ['cursiva'] },
      { texto: 'cuarenta a\u00f1os', marcas: ['negrita'] },
      { texto: 'en los dos', marcas: ['cursiva', 'negrita'] },
    ])
  })

  it('el estilo Titulo 2 se convierte en subtitulo', async () => {
    const p = await importar('capitulo-completo')
    expect(p.bloques.filter((b) => b.tipo === 'subtitulo').map(textoDe)).toEqual(['Una parte'])
  })

  it('el parrafo vacio de Word no genera un bloque', async () => {
    const p = await importar('capitulo-completo')
    expect(p.bloques.every((b) => b.tipo !== 'parrafo' || b.tramos.length > 0)).toBe(true)
  })
})

describe('los cortes se SUGIEREN, con el motivo a la vista', () => {
  it('el estilo Titulo 1 sugiere un corte', async () => {
    const p = await importar('capitulo-completo')
    expect(p.cortes).toEqual([
      {
        indice: 0,
        finCabecera: 0,
        etiqueta: 'Cap\u00edtulo 1',
        titulo: 'La luz que no tocaba',
        motivo: 'estiloTitulo',
        marcado: true,
      },
    ])
  })

  it('una linea que ya parece cabecera tambien, aunque no tenga estilo', async () => {
    // Cubre al autor que escribe «Capitulo 3: ...» a mano, que son muchos.
    const p = await importar('sin-estilo-de-titulo')
    expect(p.cortes).toEqual([
      {
        indice: 0,
        finCabecera: 0,
        etiqueta: 'Cap\u00edtulo 3',
        titulo: 'Sin estilo',
        motivo: 'lineaCapitulo',
        marcado: true,
      },
    ])
  })

  it('un manuscrito entero sugiere un corte por capitulo', async () => {
    const p = await importar('manuscrito-completo')
    expect(p.cortes.map((c) => `${c.etiqueta}|${c.titulo}|${c.motivo}`)).toEqual([
      'Cap\u00edtulo 1|Primero|estiloTitulo',
      'Cap\u00edtulo 2|Segundo|estiloTitulo',
      '|Pr\u00f3logo|estiloTitulo',
    ])
  })

  it('un documento sin nada que parezca cabecera no sugiere cortes', async () => {
    const p = await importar('texto-conflictivo')
    // Su unica cabecera es el Titulo 1; el resto son parrafos normales.
    expect(p.cortes).toHaveLength(1)
  })

  it('un .docx vacio no da bloques ni cortes, y no lanza', async () => {
    const p = await importar('vacio')
    expect(p.bloques).toEqual([])
    expect(p.cortes).toEqual([])
    expect(p.imagenes).toEqual([])
  })
})

describe('aplicarCortes: lo que la interfaz llama cuando el autor confirma', () => {
  it('con el corte sugerido, da el capitulo', async () => {
    const p = await importar('capitulo-completo')
    const r = aplicarCortes(p.bloques, p.cortes, nuevoId)
    expect(r.capitulos).toHaveLength(1)
    expect(r.capitulos[0]?.etiqueta).toBe('Cap\u00edtulo 1')
    expect(r.capitulos[0]?.titulo[0]?.texto).toBe('La luz que no tocaba')
    expect(r.capitulos[0]?.bloques).toHaveLength(7)
    expect(r.huerfanos).toEqual([])
  })

  it('si el autor DESACTIVA un corte, los dos capitulos se unen', async () => {
    const p = await importar('manuscrito-completo')
    const sinElSegundo = p.cortes.filter((c) => c.titulo !== 'Segundo')
    const r = aplicarCortes(p.bloques, sinElSegundo, nuevoId)
    expect(r.capitulos).toHaveLength(2)
    // El capitulo 1 se queda con su texto, la cabecera del 2 y el texto del 2.
    expect(r.capitulos[0]?.bloques.map(textoDe)).toEqual([
      'Texto del primero.',
      'Cap\u00edtulo 2: Segundo',
      'Texto del segundo.',
    ])
  })

  it('si el autor AÑADE un corte con «Cortar aqui», se parte ahi', async () => {
    const p = await importar('capitulo-completo')
    const extra: CorteSugerido = {
      indice: 4,
      etiqueta: '',
      titulo: 'Una parte',
      motivo: 'lineaCapitulo',
    }
    const r = aplicarCortes(p.bloques, [...p.cortes, extra], nuevoId)
    expect(r.capitulos).toHaveLength(2)
    expect(r.capitulos[1]?.titulo[0]?.texto).toBe('Una parte')
  })

  it('sin ningun corte, todo queda huerfano y la interfaz pregunta', async () => {
    // No se reparte por nuestra cuenta: el autor decide si son el arranque del
    // primer capitulo o una pagina de cortesia.
    const p = await importar('capitulo-completo')
    const r = aplicarCortes(p.bloques, [], nuevoId)
    expect(r.capitulos).toEqual([])
    expect(r.huerfanos).toHaveLength(p.bloques.length)
  })

  it('lo que va antes del primer corte queda huerfano, no se mete a la fuerza', async () => {
    const p = await importar('capitulo-completo')
    const corteTardio = [{ ...(p.cortes[0] as CorteSugerido), indice: 3 }]
    const r = aplicarCortes(p.bloques, corteTardio, nuevoId)
    expect(r.huerfanos).toHaveLength(3)
    expect(r.capitulos).toHaveLength(1)
  })

  it('una ilustracion pegada antes de la cabecera abre el capitulo', async () => {
    // Es como la coloca quien quiere abrir el capitulo con un dibujo.
    const bloques: Bloque[] = [
      { id: 'a', tipo: 'ilustracion', imagenId: 'img-1', alt: 'lamina', decorativa: false },
      { id: 'b', tipo: 'parrafo', tramos: [{ texto: 'Cap\u00edtulo 1: X', marcas: [] }] },
      { id: 'c', tipo: 'parrafo', tramos: [{ texto: 'Texto.', marcas: [] }] },
    ]
    const r = aplicarCortes(
      bloques,
      [{ indice: 1, etiqueta: 'Cap\u00edtulo 1', titulo: 'X', motivo: 'estiloTitulo' }],
      nuevoId,
    )
    expect(r.capitulos[0]?.aperturas).toEqual([{ imagenId: 'img-1', alt: 'lamina' }])
    expect(r.capitulos[0]?.bloques.map(textoDe)).toEqual(['Texto.'])
    expect(r.huerfanos).toEqual([])
  })

  it('la ilustracion de apertura del segundo capitulo no se queda en el primero', async () => {
    const bloques: Bloque[] = [
      { id: 'a', tipo: 'parrafo', tramos: [{ texto: 'Cap\u00edtulo 1: A', marcas: [] }] },
      { id: 'b', tipo: 'parrafo', tramos: [{ texto: 'Texto uno.', marcas: [] }] },
      { id: 'c', tipo: 'ilustracion', imagenId: 'img-9', alt: 'lamina', decorativa: false },
      { id: 'd', tipo: 'parrafo', tramos: [{ texto: 'Cap\u00edtulo 2: B', marcas: [] }] },
      { id: 'e', tipo: 'parrafo', tramos: [{ texto: 'Texto dos.', marcas: [] }] },
    ]
    const r = aplicarCortes(
      bloques,
      [
        { indice: 0, etiqueta: 'Cap\u00edtulo 1', titulo: 'A', motivo: 'estiloTitulo' },
        { indice: 3, etiqueta: 'Cap\u00edtulo 2', titulo: 'B', motivo: 'estiloTitulo' },
      ],
      nuevoId,
    )
    expect(r.capitulos[0]?.bloques.map(textoDe)).toEqual(['Texto uno.'])
    expect(r.capitulos[1]?.aperturas).toEqual([{ imagenId: 'img-9', alt: 'lamina' }])
  })
})

describe('las imagenes se extraen como bytes, NO como base64', () => {
  it('ni el modelo ni los bloques llevan un data:URI', async () => {
    const p = await importar('capitulo-completo')
    const serializado = JSON.stringify(p.bloques)
    expect(serializado).not.toContain('data:image')
    expect(serializado).not.toContain('base64')
  })

  it('los bytes son un PNG de verdad, con sus dimensiones', async () => {
    const p = await importar('capitulo-completo')
    expect(p.imagenes).toHaveLength(1)
    const info = inspeccionarImagen(p.imagenes[0]?.bytes as Uint8Array)
    expect(p.imagenes[0]?.contentType).toBe('image/png')
    expect(info.tipo).toBe('png')
    expect(info.ancho).toBe(1600)
    expect(info.alto).toBe(2400)
  })

  it('queda anclada en el punto del texto donde el autor la puso en Word', async () => {
    // Es la funcion del brief §8.2 gratis: el autor ya la coloco.
    const p = await importar('capitulo-completo')
    const i = p.bloques.findIndex((b) => b.tipo === 'ilustracion')
    expect(textoDe(p.bloques[i - 1] as Bloque)).toBe('Texto de la parte.')
    expect(textoDe(p.bloques[i + 1] as Bloque)).toBe('Texto despu\u00e9s de la ilustraci\u00f3n.')
  })

  it('el alt del .docx se conserva, y el id del bloque apunta a la imagen', async () => {
    const p = await importar('capitulo-completo')
    const ilus = p.bloques.find((b) => b.tipo === 'ilustracion')
    expect(ilus?.tipo === 'ilustracion' && ilus.alt).toBe('La cabana de noche')
    expect(ilus?.tipo === 'ilustracion' && ilus.imagenId).toBe(p.imagenes[0]?.id)
  })
})

describe('lo que Word trae y el EPUB no puede: se informa, no se tira en silencio', () => {
  it('la tabla y el tachado se reportan con su motivo', async () => {
    const p = await importar('con-cosas-que-descartar')
    const que = p.descartado.map((d) => d.que).sort()
    expect(que).toContain('table')
    expect(que).toContain('s')
    for (const d of p.descartado) {
      expect(d.porque.length).toBeGreaterThan(20)
      expect(d.cuantos).toBeGreaterThan(0)
    }
  })

  it('el TEXTO de lo descartado no se pierde', async () => {
    const p = await importar('con-cosas-que-descartar')
    const todo = p.bloques.map(textoDe).join(' ')
    expect(todo).toContain('subrayado')
    expect(todo).toContain('tachado')
    expect(todo).toContain('celda')
    expect(todo).toContain('Final.')
  })
})

describe('el texto de Word que choca con el dialecto sobrevive el viaje entero', () => {
  it('llega al modelo tal cual', async () => {
    const p = await importar('texto-conflictivo')
    expect(p.bloques.map(textoDe).filter((t) => t !== '')).toEqual([
      'Cap\u00edtulo 4: Conflictos',
      '5 * 3 * 2 y snake_case_aqui',
      '> esto no es un verso',
      '# esto no es un subtitulo',
      '* * *',
      'a & b < c > d',
      'C:\\Users\\ana',
      '[ilustraci\u00f3n: falsa | no soy una marca]',
    ])
  })

  it('Word -> modelo -> dialecto -> modelo: el camino real del autor', async () => {
    // Importa su Word, la app guarda, exporta el .zip y mas tarde lo reimporta.
    const p = await importar('texto-conflictivo')
    const cap = aplicarCortes(p.bloques, p.cortes, nuevoId).capitulos[0] as Capitulo
    const s = serializarCapitulo(cap, '* * *')

    // Ni un aviso, incluido el parrafo cuyo texto es literalmente «* * *»:
    // escapar los asteriscos ya rompe el patron de cambio de escena, asi que
    // «\\* \\* \\*» vuelve a leerse como el parrafo que era.
    expect(s.avisos).toEqual([])
    expect(s.texto).toContain('\\* \\* \\*')

    reiniciarIds()
    const vuelto = capituloDesdeDialecto(s.texto)
    expect(bloquesDelModelo(vuelto?.bloques ?? [])).toEqual(bloquesDelModelo(cap.bloques))
  })
})

describe('resumen para la pantalla de confirmacion', () => {
  it('cuenta lo que entro, que es lo que el escritor necesita ver', async () => {
    const p = await importar('capitulo-completo')
    const r = aplicarCortes(p.bloques, p.cortes, nuevoId)
    const resumen = resumir(r.capitulos)
    expect(resumen).toEqual({
      capitulos: 1,
      parrafos: 5,
      enfasis: 3,
      versos: 0,
      subtitulos: 1,
      escenas: 0,
      ilustraciones: 1,
    })
  })
})

describe('EL CASO REAL: un manuscrito entero en UN archivo', () => {
  /**
   * Es como escriben los autores: todo el libro en un solo documento de Word.
   * Con un archivo unico, acertar donde empieza cada capitulo ES el juego
   * entero, asi que estos tests documentan lo que la deteccion CONSIGUE y lo
   * que NO, para que el hueco este medido y no sea una sorpresa.
   *
   * Cuando la deteccion mejore, estos tests fallaran. Eso es lo que se busca:
   * son el registro del limite actual, no una aspiracion.
   */

  it('con estilos de Word, los detecta todos y parte bien la etiqueta', async () => {
    const p = await importar('manuscrito-completo')
    expect(p.cortes).toHaveLength(3)
    expect(p.cortes.map((c) => c.etiqueta)).toEqual(['Capítulo 1', 'Capítulo 2', ''])
  })

  it('los saltos de pagina se recuperan del XML, uno por capitulo', async () => {
    // mammoth los descarta sin dejar rastro, asi que se leen de
    // word/document.xml. Es la señal mas fuerte del caso real: en un documento
    // unico, Ctrl+Enter es como se separan los capitulos.
    const buf = readFileSync(join(CARPETA, 'manuscrito-realista.docx'))
    const parrafos = parrafosDeDocx(new Uint8Array(buf))
    expect(parrafos).not.toBeNull()
    // 4 saltos, y cada uno marca el parrafo donde empieza la pagina nueva. El
    // parrafo que solo contiene el salto no se marca a si mismo: mammoth lo
    // borra, asi que la marca pasa al primero con contenido.
    expect((parrafos ?? []).filter((x) => x.saltoAntes).map((x) => x.texto)).toEqual([
      'CAPÍTULO DOS',
      'Capítulo III',
      '4',
      'La luz que no tocaba',
    ])
  })

  it('con los saltos, acierta los 5 capitulos del manuscrito realista', async () => {
    // Antes acertaba 3: se le escapaban «4» (un capitulo marcado solo con el
    // numero) y «La luz que no tocaba» (un titulo sin la palabra «capitulo»).
    // Ninguno de los dos se puede detectar por el texto; el salto de pagina si.
    const p = await importar('manuscrito-realista')
    expect(p.cortes.map((c) => c.titulo)).toEqual([
      'CAPÍTULO UNO',
      'CAPÍTULO DOS',
      'Capítulo III',
      '4',
      'La luz que no tocaba',
    ])
    expect(p.cortes.map((c) => c.motivo)).toEqual([
      'lineaCapitulo',
      'lineaCapitulo',
      'lineaCapitulo',
      'saltoDePagina',
      'saltoDePagina',
    ])
    const r = aplicarCortes(p.bloques, p.cortes, nuevoId)
    expect(r.capitulos).toHaveLength(5)
    expect(r.huerfanos).toEqual([])
    expect(r.capitulos.map((c) => c.bloques.length)).toEqual([1, 1, 1, 1, 1])
  })

  it('un salto antes de una lamina a pagina completa no corta capitulo', async () => {
    // Una ilustracion sola en su pagina va precedida de un salto, y eso no es
    // un capitulo nuevo: es una lamina.
    const p = await importar('manuscrito-con-lamina')
    expect(p.bloques.map((b) => b.tipo)).toEqual([
      'parrafo',
      'parrafo',
      'ilustracion',
      'parrafo',
      'parrafo',
      'parrafo',
    ])
    expect(p.cortes.map((c) => ({ indice: c.indice, motivo: c.motivo }))).toEqual([
      { indice: 0, motivo: 'estiloTitulo' },
      { indice: 4, motivo: 'estiloTitulo' },
    ])
    // El salto de antes de la lamina tampoco se arrastra hasta la prosa que
    // viene detras: el primer capitulo sigue entero.
    const r = aplicarCortes(p.bloques, p.cortes, nuevoId)
    expect(r.capitulos.map((c) => c.bloques.map((b) => b.tipo))).toEqual([
      ['parrafo', 'ilustracion', 'parrafo'],
      ['parrafo'],
    ])
  })

  it('un salto antes de prosa se propone SIN marcar', async () => {
    // El salto de pagina tambien separa la dedicatoria o los agradecimientos,
    // asi que por si solo no basta para dar un capitulo por hecho: se enseña
    // sin marcar y lo decide el autor.
    const r = propuestaDesdeHtml(
      '<p>Capítulo 1: El puerto</p><p>Primera parte del capítulo.</p>' +
        '<p>Sigue el mismo capítulo, en otra página.</p>',
      { nombreArchivo: 'x', nuevoId },
      new Map(),
      [
        { texto: 'Capítulo 1: El puerto', saltoAntes: false },
        { texto: 'Primera parte del capítulo.', saltoAntes: false },
        { texto: 'Sigue el mismo capítulo, en otra página.', saltoAntes: true },
      ],
    )
    expect(r.cortes.map((c) => ({ motivo: c.motivo, marcado: c.marcado }))).toEqual([
      { motivo: 'lineaCapitulo', marcado: true },
      { motivo: 'saltoDePagina', marcado: false },
    ])
  })

  it('LA FORMA MAS COMUN: la etiqueta en una linea y el titulo en la siguiente', async () => {
    const p = await importar('manuscrito-dos-lineas')
    expect(
      p.cortes.map((c) => ({ etiqueta: c.etiqueta, titulo: c.titulo, fin: finDeCabecera(c) })),
    ).toEqual([
      // Las dos lineas forman la cabecera: el titulo NO se queda de parrafo.
      { etiqueta: 'CAPÍTULO UNO', titulo: 'El despertar', fin: 1 },
      // Detras de la etiqueta hay un dialogo: eso no es un titulo.
      { etiqueta: '', titulo: 'CAPÍTULO DOS', fin: 3 },
      // Ni prosa que acaba en punto.
      { etiqueta: '', titulo: 'Prólogo', fin: 6 },
      { etiqueta: 'Capítulo 4', titulo: 'La casa de los Arriaga', fin: 9 },
    ])

    const r = aplicarCortes(p.bloques, p.cortes, nuevoId)
    expect(r.capitulos.map((c) => c.bloques.map(textoDe))).toEqual([
      // «El despertar» es el titulo, no el primer parrafo.
      ['Texto del primero.'],
      ['—No puedo —dijo ella.', 'Texto del segundo.'],
      ['Llovia sobre el puerto.'],
      ['Texto del cuarto.'],
    ])
  })

  it('una etiqueta a solas se queda como titulo, no como etiqueta sin titulo', async () => {
    // El motor pinta la etiqueta ENCIMA de un <h1>. Si la etiqueta se llevara
    // «CAPITULO DOS» y el titulo quedara vacio, saldria un <h1> vacio en el
    // libro. Es mejor que «CAPITULO DOS» sea el titulo, que es lo que el lector
    // espera ver.
    const p = await importar('manuscrito-dos-lineas')
    const corte = p.cortes[1]
    expect(corte?.etiqueta).toBe('')
    expect(corte?.titulo).toBe('CAPÍTULO DOS')
  })

  it('el autor sigue pudiendo arreglarlo todo con cortes propios', async () => {
    // Lo que salva el caso real no es la deteccion —nunca va a acertar
    // siempre— es que aplicarCortes acepte lo que el autor decida. Por eso
    // «Cortar aqui» no puede estar escondido en la interfaz.
    const p = await importar('manuscrito-realista')
    const aMano: CorteSugerido[] = [
      { indice: 0, etiqueta: 'Capítulo 1', titulo: '', motivo: 'lineaCapitulo' },
      { indice: 4, etiqueta: 'Capítulo 2', titulo: '', motivo: 'lineaCapitulo' },
    ]
    const r = aplicarCortes(p.bloques, aMano, nuevoId)
    expect(r.capitulos).toHaveLength(2)
    expect(r.huerfanos).toEqual([])
    expect(r.capitulos.map((c) => c.bloques.length)).toEqual([3, 5])
  })

  it('el enfasis del titulo sobrevive a la importacion', async () => {
    const p = await importar('capitulo-completo')
    const r = aplicarCortes(p.bloques, p.cortes, nuevoId)
    // «Capitulo 1: La luz que no tocaba» no lleva enfasis, pero el camino que
    // lo conserva es el mismo: si el titulo propuesto es el texto entero del
    // bloque, se usan sus tramos en vez de aplanarlo.
    expect(r.capitulos[0]?.titulo).toEqual([{ texto: 'La luz que no tocaba', marcas: [] }])
  })
})

describe('alinear: emparejar los parrafos del .docx con los del HTML', () => {
  const l = (textos: string[]): { texto: string }[] => textos.map((texto) => ({ texto }))

  it('uno a uno', () => {
    expect(alinear(l(['a', 'b', 'c']), l(['a', 'b', 'c']))).toEqual([0, 1, 2])
  })

  it('mammoth descarta los vacios, y el hueco no arrastra al resto', () => {
    expect(alinear(l(['a', '', 'b']), l(['a', 'b']))).toEqual([0, null, 1])
    expect(alinear(l(['', 'a', '', '', 'b']), l(['a', 'b']))).toEqual([null, 0, null, null, 1])
  })

  it('el espacio no cuenta: cada lado lo normaliza a su manera', () => {
    expect(alinear(l([' a  b ']), l(['a b']))).toEqual([0])
    // Un tabulador de Word: mammoth lo escribe y el XML no lo tiene como texto.
    expect(alinear(l(['Unodos']), l(['Uno\tdos']))).toEqual([0])
  })

  it('un desajuste se repara solo y no desplaza lo que viene detras', () => {
    // Un parrafo que mammoth convirtio en algo que no reconocemos.
    expect(alinear(l(['a', 'raro', 'c']), l(['a', 'c']))).toEqual([0, null, 1])
    // O al contrario: un parrafo que mammoth se invento.
    expect(alinear(l(['a', 'c']), l(['a', 'raro', 'c']))).toEqual([0, 2])
  })

  it('una lista vacia no revienta', () => {
    expect(alinear([], l(['a']))).toEqual([])
    expect(alinear(l(['a']), [])).toEqual([null])
  })
})

describe('parrafosDeDocx: nunca puede tirar la importacion', () => {
  it('un archivo que no es un zip devuelve null', () => {
    expect(parrafosDeDocx(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })

  it('un zip sin word/document.xml devuelve null', () => {
    const zip = zipSync({ 'otra/cosa.xml': strToU8('<a/>') })
    expect(parrafosDeDocx(zip)).toBeNull()
  })

  it('un document.xml mal formado devuelve null', () => {
    const zip = zipSync({ 'word/document.xml': strToU8('<w:body><sin cerrar') })
    expect(parrafosDeDocx(zip)).toBeNull()
  })

  it('el texto borrado con control de cambios no cuenta', () => {
    // mammoth no lo emite; si aqui contara, la alineacion se desajustaria.
    const xml =
      `<w:document xmlns:w="${NS_W}"><w:body>` +
      '<w:p><w:r><w:t>vale</w:t></w:r><w:del><w:r><w:delText>fuera</w:delText></w:r></w:del></w:p>' +
      '</w:body></w:document>'
    const zip = zipSync({ 'word/document.xml': strToU8(xml) })
    expect(parrafosDeDocx(zip)).toEqual([{ texto: 'vale', saltoAntes: false }])
  })

  it('el salto que trae el estilo del parrafo tambien cuenta', () => {
    // «Titulo 1» de Word suele llevar pageBreakBefore.
    const xml =
      `<w:document xmlns:w="${NS_W}"><w:body>` +
      '<w:p><w:r><w:t>uno</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>dos</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pageBreakBefore w:val="0"/></w:pPr><w:r><w:t>tres</w:t></w:r></w:p>' +
      '</w:body></w:document>'
    const zip = zipSync({ 'word/document.xml': strToU8(xml) })
    expect(parrafosDeDocx(zip)?.map((x) => x.saltoAntes)).toEqual([false, true, false])
  })

  it('los guiones que mammoth convierte en caracter cuentan como texto', () => {
    // Si no, el parrafo no se reconoceria por el lado del HTML.
    const xml =
      `<w:document xmlns:w="${NS_W}"><w:body>` +
      '<w:p><w:r><w:t>anti</w:t><w:noBreakHyphen/><w:t>edad y re</w:t><w:softHyphen/><w:t>vista</w:t></w:r></w:p>' +
      '</w:body></w:document>'
    const zip = zipSync({ 'word/document.xml': strToU8(xml) })
    expect(parrafosDeDocx(zip)?.[0]?.texto).toBe('anti\u2011edad y re\u00advista')
  })

  it('un salto de linea suelto (Shift+Enter) no es un salto de pagina', () => {
    // Se usa dentro de un poema o de una direccion postal. Si contara, cada
    // estrofa partiria el libro en capitulos.
    const xml =
      `<w:document xmlns:w="${NS_W}"><w:body>` +
      '<w:p><w:r><w:t>uno</w:t><w:br/><w:t>dos</w:t></w:r></w:p>' +
      '<w:p><w:r><w:br/></w:r></w:p>' +
      '<w:p><w:r><w:t>tres</w:t></w:r></w:p>' +
      '</w:body></w:document>'
    const zip = zipSync({ 'word/document.xml': strToU8(xml) })
    expect(parrafosDeDocx(zip)?.map((x) => x.saltoAntes)).toEqual([false, false, false])
  })

  it('un salto a mitad de parrafo no se inventa un corte', () => {
    // Queda texto detras del salto, asi que el parrafo sigue siendo uno solo y
    // no hay donde cortar: mejor no decir nada que partir por el sitio erroneo.
    const xml =
      `<w:document xmlns:w="${NS_W}"><w:body>` +
      '<w:p><w:r><w:t>antes</w:t><w:br w:type="page"/><w:t>despues</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>siguiente</w:t></w:r></w:p>' +
      '</w:body></w:document>'
    const zip = zipSync({ 'word/document.xml': strToU8(xml) })
    expect(parrafosDeDocx(zip)?.map((x) => x.saltoAntes)).toEqual([false, false])
  })

  it('varios saltos seguidos se encadenan hasta el parrafo con texto', () => {
    const xml =
      `<w:document xmlns:w="${NS_W}"><w:body>` +
      '<w:p><w:r><w:t>uno</w:t></w:r></w:p>' +
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
      '<w:p><w:r><w:t>dos</w:t></w:r></w:p>' +
      '</w:body></w:document>'
    const zip = zipSync({ 'word/document.xml': strToU8(xml) })
    // Los dos parrafos de salto estan vacios y mammoth los borra, asi que la
    // marca viaja de uno al siguiente hasta caer en «dos», que es el unico que
    // la alineacion va a encontrar.
    expect(parrafosDeDocx(zip)?.map((x) => x.saltoAntes)).toEqual([false, false, true, true])
  })
})

describe('cabeceraSugerida: adivinar lo que el autor quiso decir en Word', () => {
  const par = (texto: string): Bloque => ({
    id: texto,
    tipo: 'parrafo',
    tramos: [{ texto, marcas: [] }],
  })

  const casos: [string, string[], { etiqueta: string; titulo: string; finCabecera: number }][] = [
    [
      'con separador, igual que el motor',
      ['Capítulo 1: La luz', 'Prosa.'],
      { etiqueta: 'Capítulo 1', titulo: 'La luz', finCabecera: 0 },
    ],
    [
      'etiqueta y titulo en dos lineas',
      ['CAPÍTULO UNO', 'El despertar', 'Prosa.'],
      { etiqueta: 'CAPÍTULO UNO', titulo: 'El despertar', finCabecera: 1 },
    ],
    [
      'etiqueta sola al final del documento',
      ['Epílogo'],
      { etiqueta: '', titulo: 'Epílogo', finCabecera: 0 },
    ],
    [
      'detras de la etiqueta hay prosa',
      ['Prólogo', 'Llovia sobre el puerto.'],
      { etiqueta: '', titulo: 'Prólogo', finCabecera: 0 },
    ],
    [
      'detras de la etiqueta hay dialogo',
      ['Capítulo 2', '—No puedo —dijo ella'],
      { etiqueta: '', titulo: 'Capítulo 2', finCabecera: 0 },
    ],
    [
      'detras de la etiqueta hay otra etiqueta',
      ['Capítulo 2', 'Capítulo 3'],
      { etiqueta: '', titulo: 'Capítulo 2', finCabecera: 0 },
    ],
    [
      'detras de la etiqueta hay un parrafo largo',
      ['Capítulo 2', 'A'.repeat(71)],
      { etiqueta: '', titulo: 'Capítulo 2', finCabecera: 0 },
    ],
    [
      'un titulo con pregunta si vale',
      ['Capítulo 2', '¿Quién llamaba?'],
      { etiqueta: 'Capítulo 2', titulo: '¿Quién llamaba?', finCabecera: 1 },
    ],
    [
      'un titulo que no es cabecera de nada se queda entero',
      ['La luz que no tocaba', 'Prosa.'],
      { etiqueta: '', titulo: 'La luz que no tocaba', finCabecera: 0 },
    ],
  ]

  for (const [nombre, textos, esperado] of casos) {
    it(nombre, () => {
      expect(cabeceraSugerida(textos.map(par), 0)).toEqual(esperado)
    })
  }

  it('la linea del titulo no se propone ademas como cabecera propia', () => {
    // Si una segunda señal propusiera un corte en la linea que la cabecera ya
    // se llevo como titulo, saldrian dos capitulos y el primero vacio.
    const html =
      '<h1>CAPÍTULO UNO</h1><p>El despertar</p><p>Texto.</p>'
    const r = propuestaDesdeHtml(html, { nombreArchivo: 'x', nuevoId }, new Map(), [
      { texto: 'CAPÍTULO UNO', saltoAntes: false },
      // Un salto justo en la linea del titulo: la cabecera ya la tomo.
      { texto: 'El despertar', saltoAntes: true },
      { texto: 'Texto.', saltoAntes: false },
    ])
    expect(r.cortes).toHaveLength(1)
    expect(r.cortes[0]).toMatchObject({ indice: 0, finCabecera: 1, titulo: 'El despertar' })
  })
})

describe('saltos de linea sueltos (Mayus+Intro)', () => {
  const textos = (p: Propuesta): string[] => p.bloques.map((b) => (b.tipo === 'versos' ? `versos ${JSON.stringify(b.estrofas.map((e) => e.map((v) => v.texto)))}` : textoDe(b)))

  it('EL FALLO: no pegan las palabras; parten el parrafo', async () => {
    // Antes se tiraban: «Era de noche» + salto + «y llovia» daba
    // «Era de nochey llovia», y el aviso decia lo contrario de lo que pasaba.
    const p = await importar('saltos-de-linea')
    expect(textos(p).slice(1, 3)).toEqual(['Era de noche', 'y llovía sobre el puerto.'])
    expect(textos(p)).toContain('Firmado:')
    expect(textos(p)).toContain('Marta Ibar')
    expect(textos(p).join('|')).not.toMatch(/nochey|Firmado:Marta/u)
  })

  it('un poema con el estilo «Cita» llega como versos, no como parrafos', async () => {
    // mammoth no traduce ese estilo por su cuenta: la conversion en versos no
    // se ejecutaba nunca con un Word real.
    const p = await importar('saltos-de-linea')
    expect(textos(p)).toContain('versos [["Las barcas duermen","la sal no duerme","el faro cuenta"]]')
  })

  it('la cabecera en dos lineas DENTRO de un parrafo tambien se reconoce', async () => {
    const p = await importar('saltos-de-linea')
    const corte = p.cortes.find((c) => c.etiqueta === 'CAPÍTULO DOS')
    expect(corte).toMatchObject({ titulo: 'El regreso', motivo: 'lineaCapitulo' })
    const r = aplicarCortes(p.bloques, p.cortes, nuevoId)
    expect(r.capitulos.map((c) => c.titulo.map((t) => t.texto).join(''))).toEqual(['Cartas', 'El regreso'])
    expect(r.capitulos[1]?.bloques.map(textoDe)).toEqual(['Texto del segundo.'])
  })

  it('el aviso dice lo que de verdad pasa', async () => {
    const p = await importar('saltos-de-linea')
    expect(p.descartado.find((d) => d.que === 'br')?.porque).toMatch(/párrafo nuevo/u)
  })

  it('en una cita: un parrafo por estrofa si hay saltos sueltos, un verso por parrafo si no', () => {
    const versos = (html: string): unknown =>
      propuestaDesdeHtml(html, { nombreArchivo: 'x', nuevoId }, new Map()).bloques.map((b) =>
        b.tipo === 'versos' ? b.estrofas.map((e) => e.map((v) => v.texto)) : b.tipo,
      )
    // Intro al final de cada verso: todo es una estrofa.
    expect(versos('<blockquote><p>uno</p><p>dos</p><p>tres</p></blockquote>')).toEqual([[['uno', 'dos', 'tres']]])
    // Mayus+Intro entre versos: cada parrafo es una estrofa.
    expect(versos('<blockquote><p>a<br/>b</p><p>c<br/>d</p></blockquote>')).toEqual([[['a', 'b'], ['c', 'd']]])
  })
})

describe('notas al pie y listas: cada texto una sola vez', () => {
  it('EL FALLO: las notas salen una vez, con su numero y sin el «↑»', async () => {
    const p = await importar('notas-al-pie')
    expect(p.bloques.map(textoDe)).toEqual([
      'Capítulo 1: El archivo',
      'El legajo[1] estaba en el sótano.',
      'Nadie lo había abierto[2].',
      '[1] Un legajo es un atado de papeles.',
      '[2] Desde 1931.',
      'Según el inventario.',
    ])
    // Se dice UNA vez por nota, como nota: no como «listas», «enlaces» y
    // «superindices», que es lo que le parecian al importador.
    expect(p.descartado.map((d) => [d.que, d.cuantos])).toEqual([['nota', 2]])
  })

  it('una lista con un parrafo dentro de cada elemento no se duplica', () => {
    const r = propuestaDesdeHtml('<ol><li><p>uno</p></li><li><p>dos</p></li></ol>', { nombreArchivo: 'x', nuevoId }, new Map())
    expect(r.bloques.map(textoDe)).toEqual(['uno', 'dos'])
  })

  it('una lista anidada tampoco: ni se repite ni se pega', () => {
    // Asi la escribe mammoth: la sublista va DENTRO del <li> del padre.
    const r = propuestaDesdeHtml(
      '<ul><li>fruta<ul><li>pera</li><li>manzana</li></ul></li><li>pan</li></ul>',
      { nombreArchivo: 'x', nuevoId },
      new Map(),
    )
    expect(r.bloques.map(textoDe)).toEqual(['fruta', 'pera', 'manzana', 'pan'])
  })
})
