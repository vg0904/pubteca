// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { inspeccionarImagen } from '../src/core/imagen-inspeccion'
import { importarDocx } from '../src/app/importar/docx'
import {
  capitulosVacios,
  corteEn,
  desdeDialecto,
  desdeParrafos,
  desdePropuesta,
  esLineaDeTitulo,
  reducirImportacion,
  resultadoImportacion,
  usaLineaSiguiente,
  vistaImportacion,
  type AccionImportacion,
  type ImagenImportada,
  type Importacion,
} from '../src/app/importacion'
import { textoDeTramos, type Bloque, type Marca, type Tramo } from '../src/app/modelo'
import { lineasDeTexto } from '../src/app/pegar'

/**
 * La pantalla de importar, sin la pantalla. Cada clic del autor es una accion
 * pura, y la vista se recalcula entera: lo que se prueba aqui es exactamente lo
 * que el autor ve antes de confirmar.
 */

const FIXTURES = join(import.meta.dirname, 'fixtures')

let n = 0
const nuevoId = (prefijo: string): string => `${prefijo}-${++n}`
beforeEach(() => {
  n = 0
})

const t = (texto: string, ...marcas: Marca[]): Tramo => ({ texto, marcas })

async function docx(nombre: string): Promise<Importacion> {
  const buf = readFileSync(join(FIXTURES, 'docx', `${nombre}.docx`))
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return desdePropuesta(await importarDocx(bytes, { nombreArchivo: nombre, nuevoId }), `${nombre}.docx`, false)
}

const aplicar = (imp: Importacion, ...acciones: AccionImportacion[]): Importacion =>
  acciones.reduce(reducirImportacion, imp)

const titulos = (imp: Importacion): string[] =>
  vistaImportacion(imp).capitulos.map((c) => [c.etiqueta, textoDeTramos(c.titulo)].filter(Boolean).join(': '))

const textoDe = (b: Bloque | undefined): string =>
  b && (b.tipo === 'parrafo' || b.tipo === 'subtitulo') ? textoDeTramos(b.tramos) : ''

describe('el manuscrito realista: cinco capitulos, como los separa un escritor', () => {
  it('la vista propone los cinco antes de que el autor toque nada', async () => {
    const imp = await docx('manuscrito-realista')
    expect(vistaImportacion(imp).capitulos).toHaveLength(5)
    expect(vistaImportacion(imp).resumen.capitulos).toBe(5)
  })

  it('«No cortar aqui» une ese capitulo con el anterior, y «Cortar aqui» lo devuelve', async () => {
    const imp = await docx('manuscrito-realista')
    const segundo = vistaImportacion(imp).indices[1] as number
    const sin = aplicar(imp, { tipo: 'marcar', indice: segundo, marcado: false })
    expect(vistaImportacion(sin).capitulos).toHaveLength(4)
    // El texto no se pierde: pasa al capitulo anterior, cabecera incluida.
    const parrafos = (i: Importacion): number => vistaImportacion(i).resumen.parrafos
    expect(parrafos(sin)).toBeGreaterThan(parrafos(imp))
    const con = aplicar(sin, { tipo: 'cortarAqui', indice: segundo })
    expect(titulos(con)).toEqual(titulos(imp))
  })

  it('cortar en una linea cualquiera crea un capitulo con esa linea de titulo', () => {
    // El caso que ninguna deteccion salva: un capitulo que empieza sin
    // etiqueta, sin estilo y sin salto de pagina.
    const imp = desdeParrafos(
      [[t('Capítulo 1: Uno')], [t('Texto.')], [t('La tormenta')], [t('Llovía.')]],
      'x',
      nuevoId,
      false,
    )
    expect(vistaImportacion(imp).capitulos).toHaveLength(1)
    const con = aplicar(imp, { tipo: 'cortarAqui', indice: 2 })
    expect(titulos(con)).toEqual(['Capítulo 1: Uno', 'La tormenta'])
    expect(corteEn(con, 2)?.motivo).toBe('manual')
    // Y quitarlo lo borra del todo: un corte del autor no era una sugerencia.
    const sin = aplicar(con, { tipo: 'marcar', indice: 2, marcado: false })
    expect(corteEn(sin, 2)).toBeUndefined()
    expect(titulos(sin)).toEqual(titulos(imp))
  })

  it('solo se corta en una linea de texto', () => {
    const imp = desdeParrafos([[t('Capítulo 1')], [t('Uno.')], [t('* * *')], [t('Dos.')]], 'x', nuevoId, false)
    expect(aplicar(imp, { tipo: 'cortarAqui', indice: 2 })).toBe(imp)
  })
})

describe('la cabecera en dos lineas', () => {
  const bloques = (...textos: string[]): Tramo[][] => textos.map((x) => [t(x)])

  it('se propone, y un clic la vuelve de una linea', () => {
    let imp = desdeParrafos(bloques('CAPÍTULO UNO', 'El despertar', 'Llovía.'), 'x', nuevoId, false)
    expect(titulos(imp)).toEqual(['CAPÍTULO UNO: El despertar'])
    expect(usaLineaSiguiente(imp.cortes[0]!)).toBe(true)
    expect(esLineaDeTitulo(imp, 1)).toBe(true)
    imp = aplicar(imp, { tipo: 'lineaSiguiente', indice: 0, usar: false })
    expect(titulos(imp)).toEqual(['CAPÍTULO UNO'])
    // La linea que era titulo vuelve al cuerpo, no se pierde.
    expect(vistaImportacion(imp).capitulos[0]?.bloques.map(textoDe)).toEqual(['El despertar', 'Llovía.'])
  })

  it('cortar en la linea del titulo de otro corte no deja un capitulo vacio', () => {
    // El autor ve que «El despertar» era en realidad el comienzo de otro
    // capitulo. El de arriba vuelve a ser de una linea; ninguno desaparece.
    let imp = desdeParrafos(bloques('CAPÍTULO UNO', 'El despertar', 'Llovía.'), 'x', nuevoId, false)
    imp = aplicar(imp, { tipo: 'cortarAqui', indice: 1 })
    expect(titulos(imp)).toEqual(['CAPÍTULO UNO', 'El despertar'])
    expect(vistaImportacion(imp).capitulos[1]?.bloques.map(textoDe)).toEqual(['Llovía.'])
  })

  it('no se puede usar de titulo la linea donde empieza otro capitulo', () => {
    let imp = desdeParrafos(bloques('Capítulo 1', 'Capítulo 2', 'Texto.'), 'x', nuevoId, false)
    const antes = imp
    imp = aplicar(imp, { tipo: 'lineaSiguiente', indice: 0, usar: true })
    expect(imp).toBe(antes)
  })
})

describe('el indice escrito a mano del principio', () => {
  it('un .docx con su indice en la primera pagina da los capitulos UNA vez', async () => {
    const imp = await docx('manuscrito-con-indice')
    expect(titulos(imp)).toEqual([
      '¡Advertencia!',
      'Capítulo 1: Llegada',
      'Capítulo 2: Indagación',
      'Capítulo 3: Encuentro',
    ])
    // Y la advertencia es suya, no del ultimo capitulo del indice.
    expect(vistaImportacion(imp).capitulos[0]?.bloques.map(textoDe)).toEqual([
      'Esta versión del libro está incompleta.',
    ])
    expect(capitulosVacios(imp)).toEqual([])
    // Las tres lineas del indice (con su numero de pagina detras) se quedan
    // sin marcar, y el indice entero antes del primer capitulo.
    expect(imp.cortes.filter((c) => c.esIndice).map((c) => c.titulo)).toEqual([
      'Llegada\t4',
      'Indagación\t7',
      'Encuentro\t14',
    ])
    expect(vistaImportacion(imp).huerfanos.map(textoDe)).toEqual([
      'Índice',
      '¡Advertencia!\t2',
      'Capítulo 1: Llegada\t4',
      'Capítulo 2: Indagación\t7',
      'Capítulo 3: Encuentro\t14',
    ])
  })
})

describe('lo que se ve siempre', () => {
  it('un indice escrito a mano no sale como capitulos, ni se traga el arranque del libro', () => {
    // El caso medido con un manuscrito real: la lista de capitulos en la
    // primera pagina. Cada linea parece una cabecera, y la ULTIMA de la lista
    // no sale vacia: se tragaba todo lo que va hasta el primer capitulo de
    // verdad y lo publicaba con el titulo equivocado.
    const imp = desdeParrafos(
      [
        [t('Índice')],
        [t('Capítulo 1: El puerto')],
        [t('Capítulo 2: La tormenta')],
        [t('Para Ana.')],
        [t('Capítulo 1: El puerto')],
        [t('Llovía sobre el puerto.')],
        [t('Capítulo 2: La tormenta')],
        [t('El viento.')],
      ],
      'x',
      nuevoId,
      false,
    )
    expect(titulos(imp)).toEqual(['Capítulo 1: El puerto', 'Capítulo 2: La tormenta'])
    expect(capitulosVacios(imp)).toEqual([])
    const vista = vistaImportacion(imp)
    expect(vista.capitulos.map((c) => c.bloques.map(textoDe))).toEqual([
      ['Llovía sobre el puerto.'],
      ['El viento.'],
    ])
    // Y el arranque del libro queda donde se pregunta por el, no dentro de un
    // capitulo que no es suyo.
    expect(vista.huerfanos.map(textoDe)).toEqual([
      'Índice',
      'Capítulo 1: El puerto',
      'Capítulo 2: La tormenta',
      'Para Ana.',
    ])
    // Las lineas del indice siguen ahi, sin marcar y dichas como lo que son:
    // si alguna si empezaba un capitulo, marcarla cuesta un clic.
    expect(imp.cortes.filter((c) => c.esIndice).map((c) => c.indice)).toEqual([1, 2])
    const con = aplicar(imp, { tipo: 'marcar', indice: 2, marcado: true })
    expect(titulos(con)).toEqual([
      'Capítulo 2: La tormenta',
      'Capítulo 1: El puerto',
      'Capítulo 2: La tormenta',
    ])
  })

  it('un hueco a media novela no es un indice: el capitulo vacio se queda', () => {
    // «Capitulo 9: Presa (No escrito)» es un hueco que el autor dejo a
    // proposito. No se repite mas adelante y no esta al principio: se respeta.
    const imp = desdeParrafos(
      [
        [t('Capítulo 1: El puerto')],
        [t('Llovía.')],
        [t('Capítulo 2: Sin escribir')],
        [t('Capítulo 3: La tormenta')],
        [t('El viento.')],
      ],
      'x',
      nuevoId,
      false,
    )
    expect(titulos(imp)).toEqual(['Capítulo 1: El puerto', 'Capítulo 2: Sin escribir', 'Capítulo 3: La tormenta'])
    expect(imp.cortes.some((c) => c.esIndice)).toBe(false)
    expect(capitulosVacios(imp)).toEqual([2])
  })

  it('un indice que no repite las cabeceras se reconoce por sus capitulos vacios, y se quita de un clic', () => {
    // Si el indice no dice los titulos (solo «Capitulo 1», «Capitulo 2») no se
    // puede emparejar con las cabeceras de verdad, y queda la via de siempre.
    const imp = desdeParrafos(
      [
        [t('Índice')],
        [t('Capítulo 1')],
        [t('Capítulo 2')],
        [t('Capítulo 1: El puerto')],
        [t('Llovía sobre el puerto.')],
        [t('Capítulo 2: La tormenta')],
        [t('El viento.')],
      ],
      'x',
      nuevoId,
      false,
    )
    expect(capitulosVacios(imp)).toEqual([1, 2])
    const limpio = aplicar(imp, { tipo: 'quitarVacios' })
    expect(titulos(limpio)).toEqual(['Capítulo 1: El puerto', 'Capítulo 2: La tormenta'])
    expect(capitulosVacios(limpio)).toEqual([])
  })

  it('un parrafo «* * *» de Word es un cambio de escena, no tres asteriscos con sangria', () => {
    const imp = desdeParrafos([[t('Capítulo 1')], [t('Uno.')], [t('* * *')], [t('Dos.')]], 'x', nuevoId, false)
    expect(vistaImportacion(imp).capitulos[0]?.bloques.map((b) => b.tipo)).toEqual(['parrafo', 'escena', 'parrafo'])
    expect(vistaImportacion(imp).resumen.escenas).toBe(1)
  })

  it('lo que hay antes del primer capitulo va a la dedicatoria si es corto, y se puede dejar fuera', () => {
    let imp = desdeParrafos([[t('Para Ana.')], [t('Capítulo 1: Uno')], [t('Texto.')]], 'x', nuevoId, false)
    expect(imp.huerfanos).toBe('dedicatoria')
    expect(resultadoImportacion(imp, nuevoId).extras[0]).toMatchObject({ tipo: 'dedicatoria' })
    imp = aplicar(imp, { tipo: 'huerfanos', destino: 'fuera' })
    expect(resultadoImportacion(imp, nuevoId).extras).toEqual([])
  })

  it('si el libro ya tiene dedicatoria, no se propone otra', () => {
    const imp = desdeParrafos([[t('Para Ana.')], [t('Capítulo 1: Uno')], [t('Texto.')]], 'x', nuevoId, true)
    expect(imp.huerfanos).toBe('fuera')
  })
})

describe('resultado: lo que entra al proyecto', () => {
  it('todos los ids son nuevos y distintos', async () => {
    const imp = await docx('manuscrito-realista')
    const r = resultadoImportacion(imp, nuevoId)
    const ids = [...r.capitulos.map((c) => c.id), ...r.capitulos.flatMap((c) => c.bloques.map((b) => b.id))]
    expect(new Set(ids).size).toBe(ids.length)
    const viejos = new Set(imp.bloques.map((b) => b.id))
    expect(ids.some((id) => viejos.has(id))).toBe(false)
  })

  it('una imagen que no es PNG ni JPG no entra, pero se dice y su sitio queda a la vista', () => {
    const imp: Importacion = {
      ...desdeParrafos([[t('Capítulo 1')], [t('Texto.')]], 'x', nuevoId, false),
      imagenes: [
        { id: 'img-1', nombreOriginal: 'dibujo', bytes: new Uint8Array([1, 2, 3]), info: inspeccionarImagen(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) },
      ],
    }
    const conIlus: Importacion = {
      ...imp,
      bloques: [...imp.bloques, { id: 'i', tipo: 'ilustracion', imagenId: 'img-1', alt: '', decorativa: false }],
    }
    const r = resultadoImportacion(conIlus, nuevoId)
    expect(r.imagenes).toEqual([])
    expect(r.inservibles.map((i) => i.id)).toEqual(['img-1'])
    const ilus = r.capitulos[0]?.bloques.find((b) => b.tipo === 'ilustracion')
    expect(ilus && ilus.tipo === 'ilustracion' && ilus.imagenId).toBe('dibujo (GIF)')
  })
})

describe('varios .md: el libro de prueba, archivo por archivo', () => {
  const carpeta = join(FIXTURES, 'libro-prueba')
  const archivos = readdirSync(join(carpeta, 'capitulos')).map((nombre) => ({
    nombre,
    texto: readFileSync(join(carpeta, 'capitulos', nombre), 'utf8'),
  }))
  const imagenes: ImagenImportada[] = readdirSync(join(carpeta, 'ilustraciones')).map((nombre) => {
    const bytes = new Uint8Array(readFileSync(join(carpeta, 'ilustraciones', nombre)))
    return { id: `img-${nombre}`, nombreOriginal: nombre, bytes, info: inspeccionarImagen(bytes) }
  })

  it('cada archivo es un capitulo, en orden natural, con su etiqueta y su titulo', () => {
    const imp = desdeDialecto([...archivos].reverse(), imagenes, nuevoId)
    expect(titulos(imp)).toEqual([
      'Capítulo 1: La luz que no tocaba',
      'Capítulo 2: Lo que decía el cuaderno',
      'Capítulo 4: El turno',
      'Epílogo',
    ])
  })

  it('las marcas de ilustracion se emparejan con las imagenes por nombre', () => {
    const imp = desdeDialecto(archivos, imagenes, nuevoId)
    expect(imp.faltan).toEqual([])
    const r = resultadoImportacion(imp, nuevoId)
    expect(r.capitulos[1]?.aperturas.map((a) => a.imagenId)).toEqual(['img-cap02-00.png'])
    expect(r.imagenes.map((i) => i.nombreOriginal).sort()).toEqual(['cap01-01.png', 'cap02-00.png', 'cap02-01.png'])
  })

  it('las que vinieron y nadie pide tambien se dicen', () => {
    const imp = desdeDialecto(archivos, imagenes, nuevoId)
    expect([...imp.sobrantes].sort()).toEqual(['cap09-99.png', 'color-01.png', 'color-02.png'])
  })

  it('las que faltan se dicen por su nombre', () => {
    const imp = desdeDialecto(archivos, [], nuevoId)
    expect([...imp.faltan].sort()).toEqual(['cap01-01', 'cap02-00', 'cap02-01'])
  })

  it('la ultima ilustracion de un archivo NO se va a abrir el capitulo siguiente', () => {
    // aplicarCortes adivina que una ilustracion pegada a una cabecera la abre.
    // En un Word es la mejor apuesta; con archivos se sabe de quien es cada una.
    const a = { nombre: 'cap01.md', texto: 'Capítulo 1: Uno\nTexto.\n[ilustración: final | el final]\n' }
    const b = { nombre: 'cap02.md', texto: 'Capítulo 2: Dos\nMás texto.\n' }
    const imp = desdeDialecto([a, b], [], nuevoId)
    const v = vistaImportacion(imp)
    expect(v.capitulos[0]?.bloques.map((x) => x.tipo)).toEqual(['parrafo', 'ilustracion'])
    expect(v.capitulos[1]?.aperturas).toEqual([])
  })

  it('un unico .md con el libro entero se corta por sus cabeceras', () => {
    const imp = desdeDialecto(
      [{ nombre: 'libro.md', texto: 'Capítulo 1: Uno\nTexto.\n\nCapítulo 2: Dos\nMás.\n' }],
      [],
      nuevoId,
    )
    expect(titulos(imp)).toEqual(['Capítulo 1: Uno', 'Capítulo 2: Dos'])
  })

  it('un unico .txt con el libro entero no convierte su primera linea en un capitulo', () => {
    // `parsear` consume SIEMPRE la primera linea como titulo, que es lo que
    // hace falta cuando cada archivo es un capitulo. Con el libro entero en un
    // .txt eso daba un capitulo de mas, con el titulo del libro por nombre, y
    // no se preguntaba nunca que hacer con lo que va antes del primero.
    const texto = 'Safy y el Mundo Onírico\nUna novela.\n\nCapítulo 1: Llegada\nLlovía.\n\nCapítulo 2: Indagación\nEl viento.\n'
    const imp = desdeDialecto([{ nombre: 'libro.txt', texto }], [], nuevoId)
    expect(titulos(imp)).toEqual(['Capítulo 1: Llegada', 'Capítulo 2: Indagación'])
    expect(vistaImportacion(imp).huerfanos.map(textoDe)).toEqual(['Safy y el Mundo Onírico', 'Una novela.'])
    // El mismo texto PEGADO da exactamente lo mismo: una via no puede entender
    // el libro de una forma y la otra de otra.
    n = 0
    const pegado = desdeParrafos(lineasDeTexto(texto), 'Texto pegado', nuevoId, false)
    expect(titulos(pegado)).toEqual(titulos(imp))
    expect(vistaImportacion(pegado).huerfanos.map(textoDe)).toEqual(vistaImportacion(imp).huerfanos.map(textoDe))
  })

  it('con varios archivos la primera linea de cada uno sigue siendo su titulo', () => {
    // Ahi no se adivina nada: cada archivo ES un capitulo, diga lo que diga su
    // primera linea.
    const a = { nombre: 'cap01.md', texto: 'La luz que no tocaba\nTexto.\n' }
    const b = { nombre: 'cap02.md', texto: 'El turno\nMás texto.\n' }
    const imp = desdeDialecto([a, b], [], nuevoId)
    expect(titulos(imp)).toEqual(['La luz que no tocaba', 'El turno'])
    expect(vistaImportacion(imp).huerfanos).toEqual([])
  })

  it('la cursiva del titulo se conserva', () => {
    const imp = desdeDialecto([{ nombre: 'c.md', texto: 'Capítulo 1: El *faro*\nTexto.\n' }], [], nuevoId)
    expect(vistaImportacion(imp).capitulos[0]?.titulo).toEqual([t('El '), t('faro', 'cursiva')])
  })
})
