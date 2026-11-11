/**
 * Que es un archivo de audio o video, leyendo su caja: contenedor, codecs,
 * duracion, medidas, giro, frecuencia y canales. Sin decodificar nada, igual
 * que las imagenes («bytes ANTES que canvas»): Mediabunny lee las cabeceras y
 * el indice de muestras, que en un .mov del iPhone estan al final, y solo pide
 * esos trozos del archivo.
 *
 * Mediabunny (MPL-2.0, sin dependencias) se carga con `import()` la primera
 * vez que hace falta: quien no usa audio ni video no lo descarga. Ver plan.md,
 * decision 1.
 *
 * Lo que SI decodifica (el primer y el ultimo fotograma, para ver si son
 * negros) va aparte, en `medirNegro`: necesita WebCodecs y un lienzo, y si el
 * navegador no puede, simplemente no se mide.
 */
import type { Capacidades, Contenedor, InfoMedio } from './clasificar'
import { esNegro } from './clasificar'

type Mediabunny = typeof import('./mb')

let cargado: Promise<Mediabunny> | null = null

/** Lo que se usa de Mediabunny (ver mb.ts), una vez por sesion. */
export function mediabunny(): Promise<Mediabunny> {
  cargado ??= import('./mb').catch((e: unknown) => {
    cargado = null
    throw e
  })
  return cargado
}

export interface Analisis {
  readonly info: InfoMedio
  readonly puede: Capacidades
}

/**
 * Lee el archivo y pregunta al navegador que puede hacer con el. null si no es
 * un audio o un video que se pueda leer.
 */
export async function analizar(archivo: Blob): Promise<Analisis | null> {
  const mb = await mediabunny()
  const input = new mb.Input({ source: new mb.BlobSource(archivo), formats: mb.FORMATOS })
  try {
    const formato = await input.getFormat()
    const contenedor: Contenedor =
      formato === mb.MP4
        ? 'mp4'
        : formato === mb.QTFF
          ? 'mov'
          : formato === mb.WAVE
            ? 'wave'
            : formato === mb.MP3
              ? 'mp3'
              : formato === mb.ADTS
                ? 'adts'
                : 'otro'
    const v = await input.getPrimaryVideoTrack()
    const a = await input.getPrimaryAudioTrack()
    const segundos = await input.computeDuration()
    const rot = v ? v.rotation : 0
    const info: InfoMedio = {
      contenedor,
      segundos,
      bytes: archivo.size,
      video: v
        ? {
            codec: v.codec,
            ancho: v.displayWidth,
            alto: v.displayHeight,
            rotacion: rot === 90 || rot === 180 || rot === 270 ? rot : 0,
            hdr: await v.hasHighDynamicRange(),
          }
        : null,
      audio: a ? { codec: a.codec, hz: a.sampleRate, canales: a.numberOfChannels } : null,
    }
    // Lo que este navegador sabe hacer. Sin WebCodecs (Node, un navegador
    // viejo) todo da false, y el plan lo dira.
    const seguro = async (f: () => Promise<boolean>): Promise<boolean> => {
      try {
        return await f()
      } catch {
        return false
      }
    }
    const puede: Capacidades = {
      decodificaVideo: v ? await seguro(() => v.canDecode()) : false,
      decodificaAudio: a ? await seguro(() => a.canDecode()) : false,
      codificaAvc: v ? await seguro(() => mb.canEncodeVideo('avc', { width: Math.min(v.displayWidth, 1920), height: Math.min(v.displayHeight, 1920) })) : false,
      codificaAac: await seguro(() => mb.canEncodeAudio('aac', { numberOfChannels: Math.min(2, a?.numberOfChannels ?? 2), sampleRate: 48_000 })),
    }
    return { info, puede }
  } catch {
    return null
  } finally {
    input.dispose()
  }
}

/** El lienzo pequeño con el que se mira si un fotograma es negro. */
export function opcionesDeMuestra(ancho: number, alto: number): { width: number; height: number; fit: 'fill' } {
  return { width: 64, height: Math.max(2, Math.round((64 * alto) / Math.max(1, ancho))), fit: 'fill' }
}

/**
 * Si el primer y el ultimo fotograma son negros, decodificandolos. undefined si
 * no se puede (sin WebCodecs, o el navegador no decodifica ese video): entonces
 * el plan cuenta como que no lo son, y recodifica.
 */
export async function medirNegro(archivo: Blob): Promise<InfoMedio['negro']> {
  try {
    const mb = await mediabunny()
    const input = new mb.Input({ source: new mb.BlobSource(archivo), formats: mb.FORMATOS })
    try {
      const v = await input.getPrimaryVideoTrack()
      if (!v || !(await v.canDecode())) return undefined
      // Pequeño: para decidir si es negro sobran 64 pixeles de ancho.
      // Con ancho Y alto, Mediabunny exige decir como encajar (si no, lanza, y
      // aqui eso se tragaba como «no se pudo medir»).
      const sink = new mb.CanvasSink(v, opcionesDeMuestra(v.displayWidth, v.displayHeight))
      const inicio = await v.getFirstTimestamp()
      const fin = await v.computeDuration()
      const primero = await sink.getCanvas(inicio)
      // El ultimo: el que se ve un instante antes del final.
      const ultimo = await sink.getCanvas(Math.max(inicio, fin - 0.001))
      const negro = (c: { canvas: HTMLCanvasElement | OffscreenCanvas } | null): boolean => {
        if (!c) return false
        const ctx = c.canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
        return ctx ? esNegro(ctx.getImageData(0, 0, c.canvas.width, c.canvas.height).data) : false
      }
      return { principio: negro(primero), final: negro(ultimo) }
    } finally {
      input.dispose()
    }
  } catch {
    return undefined
  }
}
