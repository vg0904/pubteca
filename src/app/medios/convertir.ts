/**
 * Convertir un audio o un video a lo que pide Apple Books, con Mediabunny
 * sobre WebCodecs. Corre en su propio hilo (conversion.worker.ts): recodificar
 * un video lleva minutos, y en la pagina la congelaria.
 *
 * Hace exactamente lo que dice el plan (`clasificar.ts`), que el autor ya vio
 * y acepto, y nada mas:
 *   - el video a H.264, como mucho de 1920 px, con el PRIMER y el ULTIMO
 *     fotograma en negro (Apple los exige). Se SUSTITUYEN, no se añaden:
 *     añadir obligaria a correr todos los tiempos y el sonido;
 *   - el giro se queda en los metadatos, como lo dejo el iPhone. Girar los
 *     fotogramas pasandolos por un lienzo colgaba Safari sin ningun error
 *     (medido en la fase 0, plan.md), y no hace falta: el reproductor lo gira;
 *   - el audio a AAC, a la frecuencia del libro, 256 kbps en estereo (128 en
 *     mono). Safari da menos de lo que se le pide; no hay forma de forzarlo;
 *   - fuera los metadatos del archivo: un video del iPhone lleva el sitio
 *     donde se grabo y el modelo del telefono, y eso no tiene que publicarse
 *     dentro de un libro;
 *   - solo la pista principal de video y la de audio.
 *
 * La salida se escribe en el almacen privado del navegador (OPFS) cuando se
 * puede, a trozos: un video de cientos de MB no se queda entero en memoria.
 * Si no se puede, en memoria, como ultimo recurso.
 */
import type { Paso, Plan } from './clasificar'
import { mediabunny } from './inspeccionar'

export type PlanConvertible = Extract<Plan, { clase: 'valido' | 'convertible' }>

interface Destino {
  readonly target: import('mediabunny').Target
  readonly enMemoria: boolean
  terminar(): Promise<Blob>
  descartar(): Promise<void>
}

/** Lo que se usa del acceso sincrono de OPFS (su tipo vive en la lib de workers, no en la del DOM). */
interface AccesoSincrono {
  write(datos: Uint8Array, opciones: { at: number }): number
  flush(): void
  close(): void
}

/** Un archivo en OPFS, escrito por posiciones con un acceso sincrono (solo en un worker). */
async function destinoOpfs(mb: typeof import('./mb'), tipo: string): Promise<Destino | null> {
  try {
    const raiz = await navigator.storage.getDirectory()
    const nombre = `pubteca-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`
    const manejador = await raiz.getFileHandle(nombre, { create: true })
    // createSyncAccessHandle solo existe dentro de un worker.
    const acceso = await (manejador as FileSystemFileHandle & { createSyncAccessHandle(): Promise<AccesoSincrono> }).createSyncAccessHandle()
    const escribir = new WritableStream<import('mediabunny').StreamTargetChunk>({
      write(trozo) {
        acceso.write(trozo.data, { at: trozo.position })
      },
    })
    return {
      target: new mb.StreamTarget(escribir),
      enMemoria: false,
      async terminar() {
        acceso.flush()
        acceso.close()
        const f = await manejador.getFile()
        return new Blob([f], { type: tipo })
      },
      async descartar() {
        try {
          acceso.close()
        } catch {
          // ya cerrado
        }
        await raiz.removeEntry(nombre).catch(() => undefined)
      },
    }
  } catch {
    return null
  }
}

function destinoEnMemoria(mb: typeof import('./mb'), tipo: string): Destino {
  const target = new mb.BufferTarget()
  return {
    target,
    enMemoria: true,
    terminar: async () => new Blob([target.buffer as ArrayBuffer], { type: tipo }),
    descartar: async () => undefined,
  }
}

/** Un fotograma negro del tamaño de `s`, en I420, sin pasar por un lienzo. */
function negroComo(mb: typeof import('./mb'), s: import('mediabunny').VideoSample): import('mediabunny').VideoSample {
  const w = s.codedWidth
  const h = s.codedHeight
  const cw = Math.ceil(w / 2)
  const ch = Math.ceil(h / 2)
  const datos = new Uint8Array(w * h + 2 * cw * ch)
  datos.fill(128, w * h) // croma neutra; la luma, a 0
  return new mb.VideoSample(datos, { format: 'I420', codedWidth: w, codedHeight: h, timestamp: s.timestamp, duration: s.duration })
}

export interface Convertido {
  readonly datos: Blob
  /** Si la salida tuvo que quedarse en memoria (sin OPFS). */
  readonly enMemoria: boolean
}

export async function convertir(
  archivo: Blob,
  plan: PlanConvertible,
  alProgresar: (fraccion: number) => void,
): Promise<Convertido> {
  const mb = await mediabunny()
  const tipo = plan.tipo === 'm4v' ? 'video/mp4' : 'audio/mp4'
  const input = new mb.Input({ source: new mb.BlobSource(archivo), formats: mb.FORMATOS })
  const destino = (await destinoOpfs(mb, tipo)) ?? destinoEnMemoria(mb, tipo)
  try {
    // Con OPFS se puede escribir el indice al final (se escribe por posicion);
    // en memoria, mejor delante, que es como lo leen todos los reproductores.
    const output = new mb.Output({
      format: new mb.Mp4OutputFormat(destino.enMemoria ? { fastStart: 'in-memory' } : { fastStart: false }),
      target: destino.target,
    })
    const pv = plan.pasos.find((p): p is Extract<Paso, { tipo: 'video' }> => p.tipo === 'video')
    const pa = plan.pasos.find((p): p is Extract<Paso, { tipo: 'audio' }> => p.tipo === 'audio')

    let video: import('mediabunny').ConversionVideoOptions | undefined
    if (pv) {
      const pista = await input.getPrimaryVideoTrack()
      const fin = pista ? await pista.computeDuration() : 0
      let primero = true
      video = {
        codec: 'avc',
        forceTranscode: true,
        width: pv.ancho,
        height: pv.alto,
        fit: 'contain',
        quality: mb.QUALITY_HIGH,
        process: (s) => {
          // El primero que llega y el que acaba en el final: en negro.
          const esPrimero = primero
          primero = false
          const esUltimo = s.timestamp + s.duration >= fin - 1e-3
          return esPrimero || esUltimo ? negroComo(mb, s) : s
        },
      }
    }

    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: 'primary',
      showWarnings: false,
      // Sin los metadatos del archivo: el sitio de la grabacion no va al libro.
      tags: () => ({}),
      ...(video ? { video } : {}),
      ...(pa
        ? {
            audio: {
              codec: 'aac' as const,
              forceTranscode: true,
              sampleRate: pa.hz,
              numberOfChannels: pa.canales,
              bitrate: pa.canales === 1 ? 128_000 : 256_000,
            },
          }
        : {}),
    })
    if (!conversion.isValid) {
      throw new Error(conversion.discardedTracks.map((t) => `${t.track.type}: ${t.reason}`).join('; ') || 'conversión no válida')
    }
    conversion.onProgress = (p) => alProgresar(p)
    await conversion.execute()
    return { datos: await destino.terminar(), enMemoria: destino.enMemoria }
  } catch (e) {
    await destino.descartar()
    throw e
  } finally {
    input.dispose()
  }
}

/**
 * Borra lo que haya quedado en OPFS de conversiones que no terminaron (una
 * pestaña cerrada a medias, un hilo parado y matado). Se llama al abrir.
 */
export async function limpiarOpfs(): Promise<void> {
  try {
    const raiz = await navigator.storage.getDirectory()
    const nombres: string[] = []
    for await (const [nombre] of (raiz as FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (nombre.startsWith('pubteca-')) nombres.push(nombre)
    }
    for (const n of nombres) await raiz.removeEntry(n).catch(() => undefined)
  } catch {
    // Sin OPFS no hay nada que limpiar.
  }
}
