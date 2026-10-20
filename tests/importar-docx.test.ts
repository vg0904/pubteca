// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { inspeccionarImagen } from '../src/core/imagen-inspeccion'
import { bloquesDelModelo } from '../src/app/html'
import {
  aplicarCortes,
  importarDocx,
  type CorteSugerido,
  type Propuesta,
} from '../src/app/importar/docx'
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
      { indice: 0, etiqueta: 'Cap\u00edtulo 1', titulo: 'La luz que no tocaba', motivo: 'estiloTitulo' },
    ])
  })

  it('una linea que ya parece cabecera tambien, aunque no tenga estilo', async () => {
    // Cubre al autor que escribe «Capitulo 3: ...» a mano, que son muchos.
    const p = await importar('sin-estilo-de-titulo')
    expect(p.cortes).toEqual([
      { indice: 0, etiqueta: 'Cap\u00edtulo 3', titulo: 'Sin estilo', motivo: 'lineaCapitulo' },
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
