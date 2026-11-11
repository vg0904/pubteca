/**
 * Guardar en el almacen un medio ya convertido y su poster, con los datos
 * MEDIDOS del archivo que queda (no los del original): la duracion, las
 * medidas y la frecuencia son las de lo que va a ir dentro del libro.
 */
import { inspeccionarImagen } from '../../core/imagen-inspeccion'
import { crearId } from '../ids'
import type { Imagen, Medio } from '../modelo'
import type { Repositorio } from '../repositorio'
import { analizar } from './inspeccionar'
import { fotograma, momentoPorDefecto } from './poster'

/** Guarda una imagen JPEG como poster. */
export async function guardarPoster(repo: Repositorio, jpeg: Blob, nombre: string): Promise<Imagen> {
  const bytes = new Uint8Array(await jpeg.arrayBuffer())
  const info = { ...inspeccionarImagen(bytes), bytes: bytes.length }
  if (info.tipo !== 'jpeg') throw new Error('El póster no salió como JPEG.')
  return repo.anadir(crearId('img'), nombre, jpeg, info, 'jpeg')
}

export interface Guardado {
  readonly medio: Medio
  /** El poster por defecto de un video, o null en un audio (o si no se pudo sacar). */
  readonly poster: Imagen | null
}

export async function guardarConvertido(repo: Repositorio, datos: Blob, nombreOriginal: string, ahora: number): Promise<Guardado> {
  const a = await analizar(datos)
  if (!a) throw new Error('El archivo convertido no se puede leer.')
  const { info } = a
  const medio = await repo.anadirMedio(
    crearId('medio'),
    nombreOriginal,
    datos,
    {
      tipo: info.video ? 'm4v' : 'm4a',
      segundos: info.segundos,
      ...(info.audio && !info.video ? { hz: info.audio.hz, canales: info.audio.canales } : {}),
      ...(info.video ? { ancho: info.video.ancho, alto: info.video.alto } : {}),
    },
    ahora,
  )
  if (!info.video) return { medio, poster: null }
  try {
    const f = await fotograma(repo.blobMedio(medio.id) ?? datos, momentoPorDefecto(info.segundos))
    const base = nombreOriginal.replace(/\.[^.]+$/u, '')
    return { medio, poster: await guardarPoster(repo, f.jpeg, `${base} (póster).jpg`) }
  } catch {
    // Sin poster el video entra igual: la tarjeta pide elegirlo, y la
    // revision lo dice antes de generar.
    return { medio, poster: null }
  }
}
