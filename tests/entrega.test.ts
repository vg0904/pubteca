/**
 * Las imagenes que recibe cada tienda.
 *
 * Es la unica parte de Pubteca donde los dos EPUB dejan de salir del MISMO
 * proyecto, asi que es la que puede dar un libro roto en una tienda sin que se
 * note en la otra. Lo que decide esta en `entrega.ts`, sin navegador, y aqui se
 * prueba con un codificador de mentira: asi se comprueba a QUE imagenes se
 * aplica y con que ajuste, que es lo que de verdad se puede equivocar.
 *
 * Mas los dos cambios de estado que lo acompanan: `sustituirImagen`, que es
 * como aterriza una imagen ajustada, y `entregaKindle`.
 */
import { describe, expect, it } from 'vitest'
import {
  ajusteKindle,
  entregaKindle,
  idsParaKindle,
  imagenesDeKindle,
  muestrasPara,
  paraKindle,
  type Codificador,
} from '../src/app/entrega'
import { entregaDe } from '../src/app/abrir-copia'
import { ESTADO_INICIAL, reducir, type Accion, type Estado } from '../src/app/estado'
import { conSufijo } from '../src/app/imagen-ajuste'
import {
  ENTREGA_KINDLE_POR_DEFECTO,
  VERSION_PROYECTO,
  type Bloque,
  type EntregaKindle,
  type Imagen,
  type Proyecto,
} from '../src/app/modelo'

const img = (id: string, x: Partial<Imagen> = {}): Imagen => ({
  id,
  nombreOriginal: `${id}.png`,
  tipo: 'png',
  bytes: 1_000_000,
  ancho: 1600,
  alto: 2400,
  alfa: false,
  cmyk: false,
  p3: false,
  ...x,
})

const ilus = (id: string, imagenId: string): Bloque => ({ id, tipo: 'ilustracion', imagenId, alt: 'x', decorativa: false })

function proyecto(x: Partial<Proyecto> = {}): Proyecto {
  return {
    id: 'p1',
    version: VERSION_PROYECTO,
    datos: { ...({} as Proyecto['datos']) },
    capitulos: [{ id: 'c1', etiqueta: 'Capítulo 1', titulo: [], aperturas: [], bloques: [ilus('b1', 'i1')] }],
    extras: [],
    laminas: ['i2'],
    portada: { portada: 'i3', contraportada: 'i4', logo: 'i5', logoBlanco: 'i6' },
    ...x,
  }
}

/** Un codificador de mentira: dice que la imagen pesa `factor` por byte. */
function falso(factor = 0.3, apunte?: { ajustes: unknown[] }): Codificador {
  return async (origen, imagen, ajuste) => {
    apunte?.ajustes.push({ id: imagen.id, ajuste })
    return {
      bytes: new Uint8Array(Math.max(1, Math.round(origen.length * factor))),
      ancho: ajuste.ancho,
      alto: ajuste.alto,
      tipo: 'jpeg',
    }
  }
}

const bytesDe = (ids: readonly string[], largo = 1_000_000): Map<string, Uint8Array> =>
  new Map(ids.map((id) => [id, new Uint8Array(largo)]))
const imagenesDe = (ids: readonly string[], x: Partial<Imagen> = {}): Map<string, Imagen> =>
  new Map(ids.map((id) => [id, img(id, x)]))

const TODAS = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']

describe('que imagenes recibe Kindle', () => {
  /**
   * La portada no entra en el EPUB de Kindle (KDP la pide aparte) y el logo
   * tampoco (alli el titulo va en texto). Comprimirlas seria trabajo tirado, y
   * con una portada de 3000 x 4500 no es poco.
   */
  it('ni la portada ni los logos: no viajan a Kindle', () => {
    const ids = idsParaKindle(proyecto())
    expect([...ids].sort()).toEqual(['i1', 'i2', 'i4'])
  })

  it('la contraportada si, que esa va al final del libro', () => {
    expect(idsParaKindle(proyecto())).toContain('i4')
  })

  it('las ilustraciones, las aperturas y las laminas, todas', () => {
    const p = proyecto({
      capitulos: [
        { id: 'c1', etiqueta: '', titulo: [], aperturas: [{ imagenId: 'a1', alt: '' }], bloques: [ilus('b1', 'i1')] },
      ],
      extras: [{ id: 'x1', donde: 'final', tipo: 'conTitulo', titulo: [], bloques: [ilus('b2', 'e1')], nombreArchivo: 'x' }],
      laminas: ['i2'],
      portada: {},
    })
    expect([...idsParaKindle(p)].sort()).toEqual(['a1', 'e1', 'i1', 'i2'])
  })

  /**
   * El caso que se cuela: la MISMA imagen de portada usada tambien como lamina
   * o como ilustracion. Si se quitara por ser portada, Kindle recibiria la
   * pagina que la muestra sin el archivo, y EPUBCheck rechaza el libro. Es el
   * mismo agujero que `comprobarReferencias` tapa en el motor.
   */
  it('una imagen que es portada Y lamina si la recibe Kindle', () => {
    const p = proyecto({ laminas: ['i3'], portada: { portada: 'i3' } })
    expect(idsParaKindle(p)).toContain('i3')
  })

  it('un logo que es tambien ilustracion de un capitulo si la recibe', () => {
    const p = proyecto({
      capitulos: [{ id: 'c1', etiqueta: '', titulo: [], aperturas: [], bloques: [ilus('b1', 'i5')] }],
      laminas: [],
      portada: { logo: 'i5' },
    })
    expect(idsParaKindle(p)).toContain('i5')
  })

  it('un logo que es tambien la version blanca no se cuela por eso', () => {
    const p = proyecto({ laminas: [], portada: { logo: 'i5', logoBlanco: 'i5' } })
    expect(idsParaKindle(p)).not.toContain('i5')
  })

  it('imagenesDeKindle salta los ids sin metadatos en vez de dar undefined', () => {
    expect(imagenesDeKindle(proyecto(), imagenesDe(['i1']))).toEqual([img('i1')])
  })
})

describe('el ajuste que se aplica para Kindle', () => {
  it('no recorta ni reduce: solo cambia el formato', () => {
    const a = ajusteKindle(img('i1', { ancho: 3000, alto: 4000 }), { comprimir: true, calidad: 70, grises: false })
    expect(a.recorte).toEqual({ x: 0, y: 0, ancho: 3000, alto: 4000 })
    expect(a.ancho).toBe(3000)
    expect(a.alto).toBe(4000)
    expect(a.formato).toBe('jpeg')
  })

  it('lleva la calidad y el blanco y negro que eligio el autor', () => {
    const a = ajusteKindle(img('i1'), { comprimir: true, calidad: 55, grises: true })
    expect(a.calidad).toBe(55)
    expect(a.grises).toBe(true)
  })
})

describe('comprimir para Kindle', () => {
  it('sin comprimir no se toca un byte', async () => {
    const apunte = { ajustes: [] as unknown[] }
    const r = await paraKindle(
      proyecto(),
      imagenesDe(TODAS),
      bytesDe(TODAS),
      { ...ENTREGA_KINDLE_POR_DEFECTO, comprimir: false },
      falso(0.3, apunte),
    )
    expect(apunte.ajustes).toEqual([])
    expect(r.antes).toBe(0)
    expect(r.ahora).toBe(0)
    for (const id of TODAS) expect(r.bytes.get(id)?.length).toBe(1_000_000)
  })

  it('solo se codifica lo que viaja a Kindle', async () => {
    const apunte = { ajustes: [] as unknown[] }
    await paraKindle(proyecto(), imagenesDe(TODAS), bytesDe(TODAS), { comprimir: true, calidad: 80, grises: false }, falso(0.3, apunte))
    expect((apunte.ajustes as { id: string }[]).map((x) => x.id).sort()).toEqual(['i1', 'i2', 'i4'])
  })

  it('la portada y el logo siguen ahi, con sus bytes originales', async () => {
    const r = await paraKindle(proyecto(), imagenesDe(TODAS), bytesDe(TODAS), { comprimir: true, calidad: 80, grises: false }, falso())
    // El proyecto que se le pasa al motor es el mismo para las dos tiendas, asi
    // que tiene que seguir completo: el EPUB de Apple Books sale de el.
    expect(r.bytes.get('i3')?.length).toBe(1_000_000)
    expect(r.imagenes.get('i3')?.tipo).toBe('png')
  })

  it('las comprimidas quedan como JPEG, con su peso nuevo', async () => {
    const r = await paraKindle(proyecto(), imagenesDe(TODAS), bytesDe(TODAS), { comprimir: true, calidad: 80, grises: false }, falso(0.25))
    const i1 = r.imagenes.get('i1') as Imagen
    expect(i1.tipo).toBe('jpeg')
    expect(i1.bytes).toBe(250_000)
    expect(r.bytes.get('i1')?.length).toBe(250_000)
  })

  /**
   * Las tres banderas salen de inspeccionar los bytes al subir la imagen, y
   * dejan de ser verdad en la copia de Kindle: el JPEG no guarda transparencia
   * y el lienzo deja la imagen en sRGB. Si no se limpiaran, el reporte avisaria
   * de una transparencia que ya no existe.
   */
  it('la copia comprimida ya no tiene alfa, ni CMYK, ni P3', async () => {
    const r = await paraKindle(
      proyecto(),
      imagenesDe(TODAS, { alfa: true, cmyk: true, p3: true }),
      bytesDe(TODAS),
      { comprimir: true, calidad: 80, grises: false },
      falso(),
    )
    expect(r.imagenes.get('i1')).toMatchObject({ alfa: false, cmyk: false, p3: false })
    // La que no viaja conserva lo que decia de verdad.
    expect(r.imagenes.get('i3')).toMatchObject({ alfa: true, cmyk: true, p3: true })
  })

  /**
   * Un dibujo de linea plana lo guarda mejor el PNG que el JPEG. El autor pidio
   * un libro mas ligero, no un libro distinto: si comprimir engorda, se queda
   * el original.
   */
  it('si al comprimir sale mas grande, se queda el original', async () => {
    const r = await paraKindle(proyecto(), imagenesDe(TODAS), bytesDe(TODAS), { comprimir: true, calidad: 95, grises: false }, falso(1.4))
    expect(r.bytes.get('i1')?.length).toBe(1_000_000)
    expect(r.imagenes.get('i1')?.tipo).toBe('png')
    expect(r.ahora).toBe(r.antes)
  })

  it('una imagen que el navegador no puede codificar se queda como estaba', async () => {
    const rompe: Codificador = (origen, imagen, ajuste) =>
      imagen.id === 'i1' ? Promise.reject(new Error('no')) : falso(0.2)(origen, imagen, ajuste)
    const r = await paraKindle(proyecto(), imagenesDe(TODAS), bytesDe(TODAS), { comprimir: true, calidad: 80, grises: false }, rompe)
    expect(r.bytes.get('i1')?.length).toBe(1_000_000)
    expect(r.bytes.get('i2')?.length).toBe(200_000)
  })

  it('el antes y el ahora cuentan solo las de Kindle', async () => {
    const r = await paraKindle(proyecto(), imagenesDe(TODAS), bytesDe(TODAS), { comprimir: true, calidad: 80, grises: false }, falso(0.5))
    expect(r.antes).toBe(3_000_000)
    expect(r.ahora).toBe(1_500_000)
  })

  it('una imagen sin bytes no cuenta ni rompe', async () => {
    const r = await paraKindle(proyecto(), imagenesDe(TODAS), bytesDe(['i2', 'i4']), { comprimir: true, calidad: 80, grises: false }, falso(0.5))
    expect(r.antes).toBe(2_000_000)
    expect(r.bytes.has('i1')).toBe(false)
  })
})

describe('la muestra sobre la que se mide el peso', () => {
  it('se eligen las mas grandes: son las que deciden el total', () => {
    const lista = [img('a', { ancho: 100, alto: 100 }), img('b', { ancho: 3000, alto: 3000 }), img('c', { ancho: 500, alto: 500 })]
    expect(muestrasPara(lista, 2).map((i) => i.id)).toEqual(['b', 'c'])
  })

  it('con menos imagenes que muestras se cogen todas', () => {
    expect(muestrasPara([img('a')], 3)).toHaveLength(1)
    expect(muestrasPara([], 3)).toEqual([])
  })

  it('no se altera la lista que entra', () => {
    const lista = [img('a', { ancho: 10, alto: 10 }), img('b', { ancho: 900, alto: 900 })]
    muestrasPara(lista, 1)
    expect(lista.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('la entrega en el estado y en la copia', () => {
  const nuevo = (): Estado =>
    reducir(ESTADO_INICIAL, { tipo: 'nuevoProyecto', id: 'p1', capitulo: 'c1', bloque: 'b1' })
  const con = (e: Estado, ...acciones: Accion[]): Estado => acciones.reduce(reducir, e)

  it('un libro nuevo no comprime: publicar otra cosa sin que lo pidan, no', () => {
    expect(entregaKindle(nuevo().proyecto as Proyecto)).toEqual(ENTREGA_KINDLE_POR_DEFECTO)
    expect(ENTREGA_KINDLE_POR_DEFECTO.comprimir).toBe(false)
  })

  it('se guarda lo que el autor elige', () => {
    const e = con(nuevo(), { tipo: 'entregaKindle', cambios: { comprimir: true, calidad: 60 }, ahora: 0 })
    expect(entregaKindle(e.proyecto as Proyecto)).toEqual({ comprimir: true, calidad: 60, grises: false })
  })

  it('pedir lo que ya hay no gasta un paso de deshacer', () => {
    const e = con(nuevo(), { tipo: 'entregaKindle', cambios: { comprimir: true }, ahora: 0 })
    expect(reducir(e, { tipo: 'entregaKindle', cambios: { comprimir: true }, ahora: 0 })).toBe(e)
  })

  /**
   * Un deslizador manda un valor por pixel de recorrido. Si cada uno fuera un
   * paso de deshacer, «Deshacer» tendria que pulsarse cuarenta veces para
   * volver a donde estaba. Encender la compresion y mover la calidad a
   * continuacion es UN gesto, asi que se deshace de una vez.
   */
  it('encender la compresion y mover el deslizador es un solo paso de deshacer', () => {
    let e = con(nuevo(), { tipo: 'entregaKindle', cambios: { comprimir: true }, ahora: 0 })
    const pasos = e.pasado.length
    for (const calidad of [70, 71, 72, 73]) {
      e = reducir(e, { tipo: 'entregaKindle', cambios: { calidad }, ahora: 100 })
    }
    expect(e.pasado.length).toBe(pasos)
    const atras = reducir(e, { tipo: 'deshacer' })
    expect(entregaKindle(atras.proyecto as Proyecto)).toEqual(ENTREGA_KINDLE_POR_DEFECTO)
  })

  it('un rato despues ya es otro paso', () => {
    let e = con(nuevo(), { tipo: 'entregaKindle', cambios: { comprimir: true }, ahora: 0 })
    const pasos = e.pasado.length
    e = reducir(e, { tipo: 'entregaKindle', cambios: { calidad: 55 }, ahora: 90_000 })
    expect(e.pasado.length).toBe(pasos + 1)
    expect(entregaKindle(reducir(e, { tipo: 'deshacer' }).proyecto as Proyecto)).toEqual({
      comprimir: true,
      calidad: ENTREGA_KINDLE_POR_DEFECTO.calidad,
      grises: false,
    })
  })

  it('la copia devuelve lo que traia', () => {
    expect(entregaDe({ comprimir: true, calidad: 60, grises: true })).toEqual({ comprimir: true, calidad: 60, grises: true })
  })

  it('una copia sin esto toma el valor por defecto', () => {
    expect(entregaDe(undefined)).toEqual(ENTREGA_KINDLE_POR_DEFECTO)
    expect(entregaDe(null)).toEqual(ENTREGA_KINDLE_POR_DEFECTO)
    expect(entregaDe('si')).toEqual(ENTREGA_KINDLE_POR_DEFECTO)
  })

  /**
   * Una copia editada a mano puede traer cualquier cosa, y una calidad de 500
   * o de -3 no puede costarle el libro al autor: se recorta al rango que
   * entiende el codificador.
   */
  it('una calidad imposible se recorta en vez de rechazar la copia', () => {
    expect(entregaDe({ comprimir: true, calidad: 500 }).calidad).toBe(100)
    expect(entregaDe({ comprimir: true, calidad: -3 }).calidad).toBe(1)
    expect(entregaDe({ comprimir: true, calidad: 'mucha' }).calidad).toBe(ENTREGA_KINDLE_POR_DEFECTO.calidad)
    expect(entregaDe({ comprimir: true, calidad: Number.NaN }).calidad).toBe(ENTREGA_KINDLE_POR_DEFECTO.calidad)
    expect(entregaDe({ calidad: 70.6 }).calidad).toBe(71)
  })

  it('solo `true` comprime: un «si» de texto no', () => {
    expect(entregaDe({ comprimir: 'si' }).comprimir).toBe(false)
    expect(entregaDe({ comprimir: 1 }).comprimir).toBe(false)
  })
})

describe('sustituir una imagen por su version ajustada', () => {
  const sitios = (): Proyecto =>
    proyecto({
      capitulos: [
        { id: 'c1', etiqueta: '', titulo: [], aperturas: [{ imagenId: 'vieja', alt: 'a' }], bloques: [ilus('b1', 'vieja')] },
      ],
      extras: [{ id: 'x1', donde: 'final', tipo: 'conTitulo', titulo: [], bloques: [ilus('b2', 'vieja')], nombreArchivo: 'x' }],
      laminas: ['vieja', 'otra'],
      portada: { portada: 'vieja', contraportada: 'otra' },
    })

  const abierto = (p: Proyecto): Estado =>
    reducir(ESTADO_INICIAL, { tipo: 'abrir', proyecto: p, imagenes: [img('vieja'), img('otra'), img('nueva')] })

  /**
   * Vale para TODOS los papeles de una vez: el autor arreglo ESA imagen, y si
   * la estaba usando en dos sitios espera verla arreglada en los dos.
   */
  it('cambia la imagen en todos los sitios donde se usaba', () => {
    const e = reducir(abierto(sitios()), { tipo: 'sustituirImagen', viejo: 'vieja', nuevo: 'nueva' })
    const p = e.proyecto as Proyecto
    expect(p.capitulos[0]?.aperturas[0]?.imagenId).toBe('nueva')
    expect(p.capitulos[0]?.bloques[0]).toMatchObject({ imagenId: 'nueva' })
    expect(p.extras[0]?.bloques[0]).toMatchObject({ imagenId: 'nueva' })
    expect(p.laminas).toEqual(['nueva', 'otra'])
    expect(p.portada.portada).toBe('nueva')
  })

  it('no toca las demas imagenes', () => {
    const p = reducir(abierto(sitios()), { tipo: 'sustituirImagen', viejo: 'vieja', nuevo: 'nueva' }).proyecto as Proyecto
    expect(p.portada.contraportada).toBe('otra')
    expect(p.laminas[1]).toBe('otra')
  })

  it('el alt y lo decorativo se conservan: la imagen cambia, la ilustracion no', () => {
    const p = proyecto({
      capitulos: [
        {
          id: 'c1',
          etiqueta: '',
          titulo: [],
          aperturas: [{ imagenId: 'vieja', alt: 'un faro' }],
          bloques: [{ id: 'b1', tipo: 'ilustracion', imagenId: 'vieja', alt: 'un barco', decorativa: true }],
        },
      ],
      laminas: [],
      portada: {},
    })
    const r = reducir(abierto(p), { tipo: 'sustituirImagen', viejo: 'vieja', nuevo: 'nueva' }).proyecto as Proyecto
    expect(r.capitulos[0]?.aperturas[0]?.alt).toBe('un faro')
    expect(r.capitulos[0]?.bloques[0]).toMatchObject({ alt: 'un barco', decorativa: true })
  })

  /**
   * Es lo que hace que ajustar una imagen no sea un camino de ida: los bytes de
   * la original siguen en el almacen, y el proyecto de antes apunta a ella.
   */
  it('se puede deshacer', () => {
    const e = reducir(abierto(sitios()), { tipo: 'sustituirImagen', viejo: 'vieja', nuevo: 'nueva' })
    const atras = reducir(e, { tipo: 'deshacer' }).proyecto as Proyecto
    expect(atras.laminas).toEqual(['vieja', 'otra'])
    expect(atras.portada.portada).toBe('vieja')
  })

  it('sustituir una imagen por si misma no hace nada', () => {
    const e = abierto(sitios())
    expect(reducir(e, { tipo: 'sustituirImagen', viejo: 'vieja', nuevo: 'vieja' })).toBe(e)
  })

  it('sustituir una que no se usa no cambia el proyecto', () => {
    const e = abierto(sitios())
    expect(reducir(e, { tipo: 'sustituirImagen', viejo: 'nadie', nuevo: 'nueva' }).proyecto).toBe(e.proyecto)
  })
})

describe('el nombre de la imagen ajustada', () => {
  it('conserva el del autor y cambia la extension', () => {
    expect(conSufijo('faro.png', 'jpeg')).toBe('faro.jpg')
    expect(conSufijo('faro.jpeg', 'png')).toBe('faro.png')
    expect(conSufijo('faro.JPG', 'png')).toBe('faro.png')
  })

  it('un nombre sin extension la recibe', () => {
    expect(conSufijo('faro', 'png')).toBe('faro.png')
  })

  it('un punto que no es la extension se queda', () => {
    expect(conSufijo('cap.3 el faro.png', 'jpeg')).toBe('cap.3 el faro.jpg')
  })
})

/** El tipo se usa en las aserciones de arriba; el compilador lo pide. */
const _entrega: EntregaKindle = ENTREGA_KINDLE_POR_DEFECTO
void _entrega
