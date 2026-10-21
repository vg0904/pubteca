import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ErrorAlmacen,
  abrirAlmacen,
  borrarProyecto,
  bytesDeImagen,
  estimarEspacio,
  guardarImagen,
  guardarProyecto,
  imagenesDelProyecto,
  leerImagen,
  leerProyecto,
  limpiarImagenes,
  GRACIA_IMAGEN,
  listarProyectos,
  pedirPersistencia,
  type Almacen,
  type ImagenGuardada,
} from '../src/app/almacen'
import { idsDeImagenes } from '../src/app/generar'
import { DATOS_POR_DEFECTO, VERSION_PROYECTO, type Proyecto } from '../src/app/modelo'

function proyecto(id: string, titulo: string, capitulos = 0): Proyecto {
  return {
    id,
    version: VERSION_PROYECTO,
    datos: { ...DATOS_POR_DEFECTO, titulo },
    capitulos: Array.from({ length: capitulos }, (_, i) => ({
      id: `c${i}`,
      etiqueta: `Capítulo ${i + 1}`,
      titulo: [{ texto: `T${i}`, marcas: [] }],
      aperturas: [],
      bloques: [{ id: `b${i}`, tipo: 'parrafo' as const, tramos: [{ texto: 'x', marcas: [] }] }],
    })),
    extras: [],
    laminas: [],
    portada: {},
  }
}

// Uint8Array es generico en TypeScript 6 y BlobPart exige que lo respalde un
// ArrayBuffer de verdad, no un ArrayBufferLike (que incluiria SharedArrayBuffer).
function imagen(
  id: string,
  proyectoId: string,
  bytes: Uint8Array<ArrayBuffer>,
): ImagenGuardada {
  return {
    id,
    proyectoId,
    nombreOriginal: `${id}.png`,
    tipo: 'png',
    ancho: 1600,
    alto: 2400,
    tamano: bytes.length,
    datos: new Blob([bytes], { type: 'image/png' }),
  }
}

let db: Almacen

/** fake-indexeddb no se limpia solo, y deleteDatabase es ASINCRONO. */
async function borrarBase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('pubteca')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  if (db) db.close()
  await borrarBase()
  db = await abrirAlmacen()
})

describe('proyectos', () => {
  it('se guarda y se recupera igual', async () => {
    const p = proyecto('p1', 'El faro', 3)
    await guardarProyecto(db, p, 1000)
    const leido = await leerProyecto(db, 'p1')
    expect(leido).toMatchObject(p)
  })

  it('dos pestañas con el mismo libro: la que va atrasada NO pisa a la otra', async () => {
    // Pestaña A abre el libro (modificado 1000). Pestaña B lo abre tambien,
    // escribe y guarda (2000). Cuando A guarda, lo que hay ya no es lo que
    // ella leyo: escribir encima borraria lo de B sin avisar.
    await guardarProyecto(db, proyecto('p1', 'Original'), 1000)
    const leidoPorA = await leerProyecto(db, 'p1')
    expect(await guardarProyecto(db, proyecto('p1', 'Desde B'), 2000, leidoPorA?.modificado)).toBe('ok')
    expect(await guardarProyecto(db, proyecto('p1', 'Desde A'), 3000, leidoPorA?.modificado)).toBe('conflicto')
    expect((await leerProyecto(db, 'p1'))?.datos.titulo).toBe('Desde B')
  })

  it('la pestaña al dia guarda, y un libro nuevo se guarda la primera vez', async () => {
    expect(await guardarProyecto(db, proyecto('n', 'Nuevo'), 1000, null)).toBe('ok')
    expect(await guardarProyecto(db, proyecto('n', 'Nuevo 2'), 2000, 1000)).toBe('ok')
    expect((await leerProyecto(db, 'n'))?.datos.titulo).toBe('Nuevo 2')
    // Un «libro nuevo» que ya existe es que otra pestaña lo guardo antes.
    expect(await guardarProyecto(db, proyecto('n', 'Otro'), 3000, null)).toBe('conflicto')
  })

  it('un id que no existe da null, no un error', async () => {
    expect(await leerProyecto(db, 'no-existe')).toBeNull()
  })

  it('se listan por fecha de modificacion, el mas reciente primero', async () => {
    await guardarProyecto(db, proyecto('a', 'Antiguo', 1), 1000)
    await guardarProyecto(db, proyecto('b', 'Reciente', 2), 3000)
    await guardarProyecto(db, proyecto('c', 'Medio', 5), 2000)
    expect(await listarProyectos(db)).toEqual([
      { id: 'b', titulo: 'Reciente', modificado: 3000, capitulos: 2 },
      { id: 'c', titulo: 'Medio', modificado: 2000, capitulos: 5 },
      { id: 'a', titulo: 'Antiguo', modificado: 1000, capitulos: 1 },
    ])
  })

  it('guardar dos veces el mismo id actualiza, no duplica', async () => {
    await guardarProyecto(db, proyecto('p1', 'Primero'), 1000)
    await guardarProyecto(db, proyecto('p1', 'Segundo'), 2000)
    const lista = await listarProyectos(db)
    expect(lista).toHaveLength(1)
    expect(lista[0]?.titulo).toBe('Segundo')
  })

  it('varios proyectos a la vez: un escritor de serie tiene varios libros', async () => {
    for (let i = 0; i < 4; i++) await guardarProyecto(db, proyecto(`p${i}`, `Libro ${i}`), i)
    expect(await listarProyectos(db)).toHaveLength(4)
  })

  it('un proyecto de una version FUTURA se niega a leerse', async () => {
    // Si el autor uso una version mas nueva de Pubteca en otro navegador,
    // interpretarlo a medias le estropearia el libro.
    const futuro = { ...proyecto('p1', 'Del futuro'), version: VERSION_PROYECTO + 1 }
    await guardarProyecto(db, futuro, 1000)
    await expect(leerProyecto(db, 'p1')).rejects.toThrow(ErrorAlmacen)
    await expect(leerProyecto(db, 'p1')).rejects.toThrow(/versión más nueva/)
  })
})

describe('imagenes', () => {
  it('se guardan como Blob y vuelven con los mismos bytes', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    await guardarImagen(db, imagen('i1', 'p1', bytes))
    const leida = await leerImagen(db, 'i1')
    expect(leida?.tipo).toBe('png')
    expect(leida?.ancho).toBe(1600)
    expect(await bytesDeImagen(leida as ImagenGuardada)).toEqual(bytes)
  })

  it('se consultan por proyecto', async () => {
    await guardarImagen(db, imagen('i1', 'p1', new Uint8Array([1])))
    await guardarImagen(db, imagen('i2', 'p1', new Uint8Array([2])))
    await guardarImagen(db, imagen('i3', 'p2', new Uint8Array([3])))
    expect((await imagenesDelProyecto(db, 'p1')).map((i) => i.id).sort()).toEqual(['i1', 'i2'])
    expect((await imagenesDelProyecto(db, 'p2')).map((i) => i.id)).toEqual(['i3'])
  })

  it('aguanta una imagen de 3 MB', async () => {
    const bytes = new Uint8Array(3_000_000).map((_, i) => i % 251)
    await guardarImagen(db, imagen('grande', 'p1', bytes))
    const leida = await leerImagen(db, 'grande')
    const vuelta = await bytesDeImagen(leida as ImagenGuardada)
    expect(vuelta.length).toBe(3_000_000)
    expect(vuelta[0]).toBe(bytes[0])
    expect(vuelta[2_999_999]).toBe(bytes[2_999_999])
  })
})

describe('borrar un proyecto se lleva sus imagenes', () => {
  it('no deja huerfanas', async () => {
    await guardarProyecto(db, proyecto('p1', 'Uno'), 1)
    await guardarProyecto(db, proyecto('p2', 'Dos'), 2)
    await guardarImagen(db, imagen('i1', 'p1', new Uint8Array([1])))
    await guardarImagen(db, imagen('i2', 'p1', new Uint8Array([2])))
    await guardarImagen(db, imagen('i3', 'p2', new Uint8Array([3])))

    await borrarProyecto(db, 'p1')

    expect(await leerProyecto(db, 'p1')).toBeNull()
    expect(await imagenesDelProyecto(db, 'p1')).toEqual([])
    // Las del otro proyecto siguen ahi.
    expect(await leerProyecto(db, 'p2')).not.toBeNull()
    expect(await imagenesDelProyecto(db, 'p2')).toHaveLength(1)
  })
})

describe('limpiar las imagenes que el libro ya no usa', () => {
  const AHORA = 10 * GRACIA_IMAGEN
  const vieja = (id: string, proyectoId = 'p1'): ImagenGuardada => ({
    ...imagen(id, proyectoId, new Uint8Array([1])),
    creada: AHORA - 2 * GRACIA_IMAGEN,
  })

  it('EL FALLO: una ilustracion quitada o sustituida ya no se queda para siempre', async () => {
    // Antes solo se borraban al borrar el libro entero.
    await guardarImagen(db, vieja('en-uso'))
    await guardarImagen(db, vieja('quitada'))
    await guardarImagen(db, vieja('sustituida'))
    expect(await limpiarImagenes(db, 'p1', new Set(['en-uso']), AHORA)).toBe(2)
    expect((await imagenesDelProyecto(db, 'p1')).map((i) => i.id)).toEqual(['en-uso'])
  })

  it('no toca lo recien subido: otra pestaña puede no haber guardado aun el libro que la usa', async () => {
    await guardarImagen(db, { ...vieja('recien'), creada: AHORA - 1000 })
    expect(await limpiarImagenes(db, 'p1', new Set(), AHORA)).toBe(0)
    expect(await imagenesDelProyecto(db, 'p1')).toHaveLength(1)
  })

  it('las guardadas antes de que existiera la fecha cuentan como viejas', async () => {
    await guardarImagen(db, imagen('sin-fecha', 'p1', new Uint8Array([1])))
    expect(await limpiarImagenes(db, 'p1', new Set(), AHORA)).toBe(1)
  })

  it('idsDeImagenes reconoce TODOS los sitios donde el libro usa una imagen', () => {
    // Si se le escapara uno, la limpieza borraria un dibujo que se esta usando.
    // Cada imagen lleva un id «IMG-...»; se buscan en el proyecto ENTERO, sin
    // saber en que campo esta, y tienen que salir todas.
    const ilus = (id: string) => ({ id: `b-${id}`, tipo: 'ilustracion' as const, imagenId: id, alt: '', decorativa: false })
    const p: Proyecto = {
      ...proyecto('p1', 'Todo'),
      laminas: ['IMG-lamina'],
      portada: { portada: 'IMG-portada', contraportada: 'IMG-contra', logo: 'IMG-logo', logoBlanco: 'IMG-logo-blanco' },
      capitulos: [
        {
          id: 'c',
          etiqueta: '',
          titulo: [],
          aperturas: [{ imagenId: 'IMG-apertura', alt: '' }],
          bloques: [ilus('IMG-capitulo')],
        },
      ],
      extras: [
        { id: 'x', donde: 'final', tipo: 'conTitulo', titulo: [], bloques: [ilus('IMG-extra')], nombreArchivo: 'x' },
      ],
    }
    const enElProyecto = new Set(JSON.stringify(p).match(/IMG-[a-z-]+/gu))
    expect(enElProyecto.size).toBe(8)
    expect(idsDeImagenes(p)).toEqual(enElProyecto)
  })

  it('solo las de ese libro', async () => {
    await guardarImagen(db, vieja('mia', 'p1'))
    await guardarImagen(db, vieja('de-otro', 'p2'))
    await limpiarImagenes(db, 'p1', new Set(), AHORA)
    expect(await imagenesDelProyecto(db, 'p2')).toHaveLength(1)
  })
})

describe('el ciclo que de verdad importa: escribir, recargar, seguir', () => {
  it('cerrar la base y volver a abrirla no pierde nada', async () => {
    const p = proyecto('p1', 'El faro de Ibar', 16)
    await guardarProyecto(db, p, 12345)
    for (let i = 0; i < 16; i++) {
      await guardarImagen(db, imagen(`img-${i}`, 'p1', new Uint8Array([i, i + 1, i + 2])))
    }

    // Esto es lo que pasa al recargar la pagina.
    db.close()
    const db2 = await abrirAlmacen()

    const leido = await leerProyecto(db2, 'p1')
    expect(leido?.capitulos).toHaveLength(16)
    expect(leido).toMatchObject(p)
    const imagenes = await imagenesDelProyecto(db2, 'p1')
    expect(imagenes).toHaveLength(16)
    expect(await bytesDeImagen(imagenes[0] as ImagenGuardada)).toHaveLength(3)
    db2.close()
  })
})

describe('persistencia y espacio: degradan sin romperse', () => {
  it('pedirPersistencia no lanza cuando la API no existe', async () => {
    // Safari antes de 15.2 y cualquier entorno sin navigator.storage.
    await expect(pedirPersistencia()).resolves.toBe(false)
  })

  it('estimarEspacio da null cuando la API no existe', async () => {
    // navigator.storage.estimate no existe antes de Safari 17.
    await expect(estimarEspacio()).resolves.toBeNull()
  })
})
