/**
 * Persistencia en el navegador. IndexedDB a traves de idb.
 *
 * ESTE ES EL RIESGO MAS SERIO DEL PRODUCTO, no un detalle tecnico. WebKit
 * expulsa el almacenamiento de un origen tras un periodo prolongado sin
 * interaccion del usuario, ademas de bajo presion de disco. Un escritor que
 * deje su novela solo aqui y no abra la app en semanas puede perderla. Por eso:
 *
 *   - se pide `navigator.storage.persist()` al crear el proyecto, ANTES de que
 *     haya algo que perder;
 *   - la interfaz dice, con texto visible y no en letra pequena, que el .zip
 *     exportado es la copia de seguridad de verdad;
 *   - se detecta la navegacion privada en vez de fallar en silencio.
 *
 * Las imagenes se guardan como Blob, NO como base64: base64 infla un 33 % y
 * obliga a serializar cadenas gigantes en cada autoguardado.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { DATOS_POR_DEFECTO, disenoPortadilla, VERSION_PROYECTO, type DatosLibro, type Proyecto } from './modelo'

const NOMBRE_BD = 'pubteca'
/** Version del ESQUEMA de IndexedDB (distinta de la version del proyecto). */
const VERSION_BD = 1

export interface ImagenGuardada {
  readonly id: string
  readonly proyectoId: string
  readonly nombreOriginal: string
  readonly tipo: 'png' | 'jpeg'
  readonly ancho: number
  readonly alto: number
  readonly tamano: number
  readonly datos: Blob
  /** Banderas de la inspeccion de bytes. Ver `Imagen` en modelo.ts. */
  readonly alfa?: boolean
  readonly cmyk?: boolean
  readonly p3?: boolean
  /** Cuando se subio, en ms. Las guardadas antes de existir este campo no lo tienen. */
  readonly creada?: number
}

export interface ResumenProyecto {
  readonly id: string
  readonly titulo: string
  readonly modificado: number
  readonly capitulos: number
}

interface Esquema extends DBSchema {
  proyectos: {
    key: string
    value: Proyecto & { readonly modificado: number }
  }
  imagenes: {
    key: string
    value: ImagenGuardada
    indexes: { porProyecto: string }
  }
}

export type Almacen = IDBPDatabase<Esquema>

export class ErrorAlmacen extends Error {
  readonly causa: 'privado' | 'sinEspacio' | 'versionFutura' | 'desconocido'

  constructor(mensaje: string, causa: ErrorAlmacen['causa']) {
    super(mensaje)
    this.name = 'ErrorAlmacen'
    this.causa = causa
  }
}

/**
 * Abre la base. Si falla, casi siempre es navegacion privada: Safari limita o
 * deshabilita IndexedDB ahi, y hay que decirlo en vez de dejar que el
 * autoguardado falle sin que nadie se entere.
 */
export async function abrirAlmacen(): Promise<Almacen> {
  try {
    return await openDB<Esquema>(NOMBRE_BD, VERSION_BD, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('proyectos')) {
          db.createObjectStore('proyectos', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('imagenes')) {
          const s = db.createObjectStore('imagenes', { keyPath: 'id' })
          s.createIndex('porProyecto', 'proyectoId')
        }
      },
    })
  } catch {
    throw new ErrorAlmacen(
      'No pude abrir el almacén del navegador. Si estás en una ventana privada, tu trabajo no se ' +
        'va a guardar: abre Pubteca en una ventana normal.',
      'privado',
    )
  }
}

/**
 * Pide que el navegador NO expulse los datos.
 *
 * En Safari no se muestra ningun dialogo: WebKit decide solo segun el historial
 * de interaccion del usuario con el sitio. Devuelve si quedo concedido.
 */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export interface Espacio {
  readonly usado: number
  readonly disponible: number
  readonly fraccion: number
}

/** Cuanto espacio se esta usando. No existe antes de Safari 17. */
export async function estimarEspacio(): Promise<Espacio | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    const e = await navigator.storage.estimate()
    const usado = e.usage ?? 0
    const disponible = e.quota ?? 0
    return { usado, disponible, fraccion: disponible > 0 ? usado / disponible : 0 }
  } catch {
    return null
  }
}

function esFaltaDeEspacio(e: unknown): boolean {
  return e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

/** Guarda el proyecto. El `modificado` lo pone quien llama: el reloj se inyecta. */
export async function guardarProyecto(
  db: Almacen,
  proyecto: Proyecto,
  modificado: number,
  /**
   * El `modificado` que esta pestaña cree que hay guardado (null si el libro
   * es nuevo). Si lo que hay es OTRA cosa, alguien lo guardo desde otra
   * pestaña o ventana, y escribir encima borraria sus cambios sin avisar: no
   * se escribe y se devuelve `conflicto`. Sin este argumento no se comprueba.
   */
  esperado?: number | null,
): Promise<'ok' | 'conflicto'> {
  try {
    if (esperado === undefined) {
      await db.put('proyectos', { ...proyecto, modificado })
      return 'ok'
    }
    // Leer y escribir en la MISMA transaccion: entre las dos no puede colarse
    // el guardado de otra pestaña.
    const tx = db.transaction('proyectos', 'readwrite')
    const actual = await tx.store.get(proyecto.id)
    if ((actual?.modificado ?? null) !== esperado) {
      await tx.done
      return 'conflicto'
    }
    await tx.store.put({ ...proyecto, modificado })
    await tx.done
    return 'ok'
  } catch (e) {
    if (esFaltaDeEspacio(e)) {
      throw new ErrorAlmacen(
        'No cabe más en este navegador. Guarda una copia (.zip) ahora mismo: se hace desde ' +
          'memoria y no necesita espacio.',
        'sinEspacio',
      )
    }
    throw e
  }
}

/**
 * Lee un proyecto.
 *
 * Si viene de una version MAS NUEVA del formato, se niega a leerlo en vez de
 * interpretarlo mal: el autor habra usado una version mas reciente de Pubteca
 * en otro navegador, y leerlo a medias le estropearia el libro.
 *
 * Y al reves: un libro guardado ANTES de que un campo existiera no lo trae,
 * pero el modelo dice que esta. Los que falten toman su valor por defecto aqui,
 * al leer, para que un `undefined` no se cuele por la interfaz (un boton de
 * radio sin ninguna opcion marcada) ni por libro.txt (la cadena «undefined»).
 * Esto no sube `VERSION_PROYECTO`: no cambia la forma de lo guardado, rellena
 * lo que falta, y es lo que ya pasaba con cada campo nuevo del libro.
 */
export async function leerProyecto(
  db: Almacen,
  id: string,
): Promise<(Proyecto & { readonly modificado: number }) | null> {
  const p = await db.get('proyectos', id)
  if (!p) return null
  if (p.version > VERSION_PROYECTO) {
    throw new ErrorAlmacen(
      `Este libro se guardó con una versión más nueva de Pubteca (formato ${p.version}, esta ` +
        `versión entiende hasta ${VERSION_PROYECTO}). Actualiza la página antes de abrirlo.`,
      'versionFutura',
    )
  }
  const puestos = Object.fromEntries(
    Object.entries(p.datos ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<DatosLibro>
  return {
    ...p,
    datos: {
      ...DATOS_POR_DEFECTO,
      ...puestos,
      // Este ademas se COMPRUEBA, no solo se rellena: el motor lo usa para
      // decidir que pagina construye, asi que un valor raro no puede pasar.
      portadilla: disenoPortadilla(puestos.portadilla),
    },
  }
}

export async function listarProyectos(db: Almacen): Promise<ResumenProyecto[]> {
  const todos = await db.getAll('proyectos')
  return todos
    .map((p) => ({
      id: p.id,
      titulo: p.datos.titulo,
      modificado: p.modificado,
      capitulos: p.capitulos.length,
    }))
    .sort((a, b) => b.modificado - a.modificado)
}

/** Borra el proyecto Y sus imagenes: si no, las huerfanas se acumulan. */
export async function borrarProyecto(db: Almacen, id: string): Promise<void> {
  const tx = db.transaction(['proyectos', 'imagenes'], 'readwrite')
  await tx.objectStore('proyectos').delete(id)
  const indice = tx.objectStore('imagenes').index('porProyecto')
  for (const imagen of await indice.getAllKeys(id)) {
    await tx.objectStore('imagenes').delete(imagen)
  }
  await tx.done
}

/**
 * Cuanto se respeta una imagen recien subida aunque el proyecto guardado no la
 * use todavia. Ver `limpiarImagenes`.
 */
export const GRACIA_IMAGEN = 24 * 60 * 60 * 1000

/**
 * Borra las imagenes de un proyecto que el proyecto ya no usa, y devuelve
 * cuantas.
 *
 * Sin esto, cada ilustracion que se quitaba o se sustituia se quedaba en
 * IndexedDB para siempre: solo se borraban al borrar el libro entero. Quien
 * itera sus ilustraciones iba llenando el navegador hasta el error de espacio.
 *
 * Solo es seguro al ABRIR el libro: mientras esta abierto, deshacer puede
 * devolver una ilustracion quitada, y su imagen tiene que seguir ahi. Y no se
 * toca nada subido en las ultimas `GRACIA_IMAGEN`: si el libro esta abierto en
 * OTRA pestaña, alli se sube la imagen al momento pero el proyecto que la usa
 * se guarda un poco despues, y abrir aqui en medio la borraria.
 */
export async function limpiarImagenes(
  db: Almacen,
  proyectoId: string,
  usadas: ReadonlySet<string>,
  ahora: number,
): Promise<number> {
  const tx = db.transaction('imagenes', 'readwrite')
  let borradas = 0
  for (const imagen of await tx.store.index('porProyecto').getAll(proyectoId)) {
    if (usadas.has(imagen.id)) continue
    if (imagen.creada !== undefined && ahora - imagen.creada < GRACIA_IMAGEN) continue
    await tx.store.delete(imagen.id)
    borradas += 1
  }
  await tx.done
  return borradas
}

export async function guardarImagen(db: Almacen, imagen: ImagenGuardada): Promise<void> {
  try {
    await db.put('imagenes', imagen)
  } catch (e) {
    if (esFaltaDeEspacio(e)) {
      throw new ErrorAlmacen(
        `No cabe «${imagen.nombreOriginal}» en este navegador. Guarda una copia (.zip) y revisa ` +
          'las ilustraciones más pesadas.',
        'sinEspacio',
      )
    }
    throw e
  }
}

export async function leerImagen(db: Almacen, id: string): Promise<ImagenGuardada | null> {
  return (await db.get('imagenes', id)) ?? null
}

export async function imagenesDelProyecto(
  db: Almacen,
  proyectoId: string,
): Promise<ImagenGuardada[]> {
  return db.getAllFromIndex('imagenes', 'porProyecto', proyectoId)
}

/** Los bytes de una imagen, listos para el core, que los quiere sincronos. */
export async function bytesDeImagen(imagen: ImagenGuardada): Promise<Uint8Array> {
  return new Uint8Array(await imagen.datos.arrayBuffer())
}
