/**
 * Las imagenes de un proyecto abierto: los Blob en memoria, una URL para cada
 * miniatura, y la copia en IndexedDB.
 *
 * El modelo solo guarda ids; los bytes viven aqui. Si IndexedDB no esta (una
 * ventana privada de Safari), el repositorio sigue funcionando en memoria y la
 * interfaz ya avisa de que nada se guarda.
 */
import { crc32 } from '../core/crc32'
import type { InfoImagen } from '../core/imagen-inspeccion'
import { guardarImagen, guardarMedio, imagenesDelProyecto, leerMedio, mediosDelProyecto, type Almacen } from './almacen'
import type { Imagen, Medio } from './modelo'

/** De cuanto en cuanto se lee un video para sacar su CRC: nunca entero. */
export const TROZO_CRC = 8 * 1024 * 1024

/**
 * El CRC-32 de un Blob, leido por trozos. Un video de 400 MB nunca esta entero
 * en memoria: cada trozo se suelta antes de leer el siguiente.
 */
export async function crcDeBlob(b: Blob, trozo = TROZO_CRC): Promise<number> {
  let c = 0
  for (let i = 0; i < b.size; i += trozo) {
    c = crc32(new Uint8Array(await b.slice(i, i + trozo).arrayBuffer()), c)
  }
  return c
}

export class Repositorio {
  readonly proyectoId: string
  private readonly db: Almacen | null
  private readonly blobs = new Map<string, Blob>()
  private readonly urls = new Map<string, string>()
  /** Audio y video: el Blob (en disco si viene de IndexedDB) y sus datos. */
  private readonly blobsMedios = new Map<string, Blob>()
  private readonly datosMedios = new Map<string, Medio>()

  constructor(db: Almacen | null, proyectoId: string) {
    this.db = db
    this.proyectoId = proyectoId
  }

  /** Carga las imagenes y los medios guardados del proyecto. */
  static async abrir(db: Almacen | null, proyectoId: string): Promise<{ repo: Repositorio; imagenes: Imagen[] }> {
    const repo = new Repositorio(db, proyectoId)
    if (!db) return { repo, imagenes: [] }
    for (const m of await mediosDelProyecto(db, proyectoId)) {
      repo.blobsMedios.set(m.id, m.datos)
      repo.datosMedios.set(m.id, { id: m.id, nombreOriginal: m.nombreOriginal, tipo: m.tipo, bytes: m.tamano, crc32: m.crc32, segundos: m.segundos })
    }
    const guardadas = await imagenesDelProyecto(db, proyectoId)
    const imagenes = guardadas.map((g): Imagen => {
      repo.blobs.set(g.id, g.datos)
      return {
        id: g.id,
        nombreOriginal: g.nombreOriginal,
        tipo: g.tipo,
        bytes: g.tamano,
        ancho: g.ancho,
        alto: g.alto,
        ...(g.alfa !== undefined ? { alfa: g.alfa } : {}),
        ...(g.cmyk !== undefined ? { cmyk: g.cmyk } : {}),
        ...(g.p3 !== undefined ? { p3: g.p3 } : {}),
      }
    })
    return { repo, imagenes }
  }

  /** Guarda una imagen ya inspeccionada y devuelve sus metadatos para el modelo. */
  async anadir(id: string, nombreOriginal: string, datos: Blob, info: InfoImagen, tipo: 'png' | 'jpeg'): Promise<Imagen> {
    // Se copia a un Blob propio: un File puede seguir apuntando al disco, y si
    // el autor mueve el archivo despues, se perderia.
    const blob = new Blob([await datos.arrayBuffer()], { type: tipo === 'png' ? 'image/png' : 'image/jpeg' })
    this.blobs.set(id, blob)
    const imagen: Imagen = {
      id,
      nombreOriginal,
      tipo,
      bytes: blob.size,
      ancho: info.ancho,
      alto: info.alto,
      alfa: info.alfa,
      cmyk: info.cmyk,
      p3: info.p3,
    }
    if (this.db) {
      await guardarImagen(this.db, {
        id,
        proyectoId: this.proyectoId,
        nombreOriginal,
        tipo,
        ancho: info.ancho,
        alto: info.alto,
        tamano: blob.size,
        datos: blob,
        alfa: info.alfa,
        cmyk: info.cmyk,
        p3: info.p3,
        creada: Date.now(),
      })
    }
    return imagen
  }

  /**
   * Guarda un audio o un video YA convertido (ver plan.md, M3) y devuelve sus
   * datos para el modelo.
   *
   * No se copia a memoria como una imagen: se guarda en IndexedDB y se vuelve
   * a leer de alli, y ese Blob vive en disco. Asi el archivo original puede
   * moverse sin perderse, y un video de 400 MB no ocupa 400 MB de memoria. El
   * CRC se saca aqui una vez, por trozos.
   */
  async anadirMedio(
    id: string,
    nombreOriginal: string,
    datos: Blob,
    info: { readonly tipo: Medio['tipo']; readonly segundos: number; readonly crc32?: number },
    ahora: number,
  ): Promise<Medio> {
    const tipoMime = info.tipo === 'm4v' ? 'video/mp4' : 'audio/mp4'
    const blob = datos.type === tipoMime ? datos : new Blob([datos], { type: tipoMime })
    const medio: Medio = {
      id,
      nombreOriginal,
      tipo: info.tipo,
      bytes: blob.size,
      crc32: info.crc32 ?? (await crcDeBlob(blob)),
      segundos: info.segundos,
    }
    let guardado = blob
    if (this.db) {
      await guardarMedio(this.db, {
        id,
        proyectoId: this.proyectoId,
        nombreOriginal,
        tipo: medio.tipo,
        tamano: medio.bytes,
        crc32: medio.crc32,
        segundos: medio.segundos,
        datos: blob,
        creada: ahora,
      })
      guardado = (await leerMedio(this.db, id))?.datos ?? blob
    }
    this.blobsMedios.set(id, guardado)
    this.datosMedios.set(id, medio)
    return medio
  }

  /** El Blob de un audio o un video, para armar el EPUB o la copia. */
  blobMedio(id: string): Blob | undefined {
    return this.blobsMedios.get(id)
  }

  /** Los datos de todos los audios y videos del proyecto, por id. */
  medios(): ReadonlyMap<string, Medio> {
    return this.datosMedios
  }

  /** Una URL para reproducirlo en la vista previa. Una sola por medio. */
  urlMedio(id: string): string | undefined {
    const clave = `medio:${id}`
    const ya = this.urls.get(clave)
    if (ya) return ya
    const b = this.blobsMedios.get(id)
    if (!b) return undefined
    const u = URL.createObjectURL(b)
    this.urls.set(clave, u)
    return u
  }

  tiene(id: string): boolean {
    return this.blobs.has(id)
  }

  blob(id: string): Blob | undefined {
    return this.blobs.get(id)
  }

  /** Una URL para pintar la miniatura. Se crea una sola vez por imagen. */
  url(id: string): string | undefined {
    const ya = this.urls.get(id)
    if (ya) return ya
    const b = this.blobs.get(id)
    if (!b) return undefined
    const u = URL.createObjectURL(b)
    this.urls.set(id, u)
    return u
  }

  async bytes(id: string): Promise<Uint8Array | null> {
    const b = this.blobs.get(id)
    return b ? new Uint8Array(await b.arrayBuffer()) : null
  }

  /** Suelta las URL de las miniaturas al cerrar el proyecto. */
  liberar(): void {
    for (const u of this.urls.values()) URL.revokeObjectURL(u)
    this.urls.clear()
  }
}
