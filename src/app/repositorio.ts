/**
 * Las imagenes de un proyecto abierto: los Blob en memoria, una URL para cada
 * miniatura, y la copia en IndexedDB.
 *
 * El modelo solo guarda ids; los bytes viven aqui. Si IndexedDB no esta (una
 * ventana privada de Safari), el repositorio sigue funcionando en memoria y la
 * interfaz ya avisa de que nada se guarda.
 */
import type { InfoImagen } from '../core/imagen-inspeccion'
import { guardarImagen, imagenesDelProyecto, type Almacen } from './almacen'
import type { Imagen } from './modelo'

export class Repositorio {
  readonly proyectoId: string
  private readonly db: Almacen | null
  private readonly blobs = new Map<string, Blob>()
  private readonly urls = new Map<string, string>()

  constructor(db: Almacen | null, proyectoId: string) {
    this.db = db
    this.proyectoId = proyectoId
  }

  /** Carga las imagenes guardadas del proyecto. */
  static async abrir(db: Almacen | null, proyectoId: string): Promise<{ repo: Repositorio; imagenes: Imagen[] }> {
    const repo = new Repositorio(db, proyectoId)
    if (!db) return { repo, imagenes: [] }
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
