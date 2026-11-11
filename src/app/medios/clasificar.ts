/**
 * Que es un archivo de audio o video y que hay que hacerle para que quede como
 * lo pide Apple Books (Asset Guide 5.3.1, plan.md parte A).
 *
 * Es la regla del proyecto: NADA se aplica sin confirmar. Antes de tocar el
 * archivo, el autor ve lo que se le va a hacer, y eso sale de aqui. Por eso es
 * una funcion pura, sin navegador: se prueba en Node con todos los casos, y la
 * interfaz solo pinta el plan.
 *
 * Tres respuestas posibles:
 *   - `valido`: ya es lo que Apple pide; como mucho cambia de caja (un .mov
 *     con H.264 pasa a MPEG-4 sin recodificar nada);
 *   - `convertible`: hay que recodificar algo, y este navegador puede;
 *   - `imposible`: este navegador no puede, con el motivo y lo que hacer.
 *
 * Lo que decide un video (decisiones 1 y 2 del autor):
 *   - el codec tiene que ser H.264 o HEVC; si no, se recodifica a H.264;
 *   - si es HDR (los videos del iPhone lo son por defecto), se recodifica a
 *     H.264 SDR: Apple pide BT.709;
 *   - tiene que EMPEZAR y ACABAR en negro. Solo pasa tal cual si se MIDIO que
 *     ya lo hace; si no se pudo medir, se recodifica (y se ponen los negros);
 *   - al recodificar, el lado largo no pasa de 1920 px: lo que Apple pide para
 *     HD, y lo que mantiene el libro por debajo de los 500 MB recomendados;
 *   - su audio, si lo tiene, en AAC.
 * Y un audio: AAC, como mucho estereo, y a la MISMA frecuencia que los demas
 * audios del libro. Mono se deja mono (Apple lo acepta si no hay estereo).
 */

import type { Medio, Proyecto } from '../modelo'

export type Contenedor = 'mp4' | 'mov' | 'wave' | 'mp3' | 'adts' | 'otro'

export interface InfoVideo {
  /** El nombre corto de Mediabunny: `avc`, `hevc`, `vp9`, `prores`... o null si no se sabe. */
  readonly codec: string | null
  /** Lo que mide en pantalla, ya girado. */
  readonly ancho: number
  readonly alto: number
  readonly rotacion: 0 | 90 | 180 | 270
  readonly hdr: boolean
}

export interface InfoAudio {
  readonly codec: string | null
  readonly hz: number
  readonly canales: number
}

export interface InfoMedio {
  readonly contenedor: Contenedor
  readonly segundos: number
  readonly bytes: number
  readonly video: InfoVideo | null
  readonly audio: InfoAudio | null
  /**
   * Si el primer y el ultimo fotograma son negros, MEDIDO decodificandolos. Sin
   * medir (no se pudo decodificar), no esta: y entonces se cuenta como que no.
   */
  readonly negro?: { readonly principio: boolean; readonly final: boolean }
}

/** Lo que ESTE navegador puede hacer con ESTE archivo. */
export interface Capacidades {
  readonly decodificaVideo: boolean
  readonly decodificaAudio: boolean
  /** H.264, a las medidas de salida. */
  readonly codificaAvc: boolean
  /** AAC. Safari no lo tiene hasta la version 26 (no tiene AudioEncoder). */
  readonly codificaAac: boolean
}

export type Paso =
  /** Cambiar de caja a MPEG-4, sin recodificar. */
  | { readonly tipo: 'contenedor'; readonly de: Contenedor }
  /** Recodificar el video a H.264, con un fotograma negro al principio y al final. */
  | {
      readonly tipo: 'video'
      readonly motivo: 'codec' | 'hdr' | 'negro'
      readonly ancho: number
      readonly alto: number
      /** Si se reduce: las medidas de antes. */
      readonly antes?: { readonly ancho: number; readonly alto: number }
    }
  /** Recodificar el audio a AAC. */
  | { readonly tipo: 'audio'; readonly motivo: 'codec' | 'frecuencia' | 'canales'; readonly hz: number; readonly canales: number }

export type MotivoImposible =
  /** No es un formato de audio o video que se pueda leer. */
  | 'formato'
  /** Se lee, pero no trae ni audio ni video. */
  | 'sinPistas'
  /** Este navegador no sabe decodificarlo. */
  | 'noDecodifica'
  /** Hay que recodificar el video y este navegador no codifica H.264. */
  | 'sinH264'
  /** Hay que codificar AAC y este navegador no puede (Safari antes de la 26). */
  | 'sinAac'

export type Plan =
  | { readonly clase: 'valido' | 'convertible'; readonly tipo: 'm4v' | 'm4a'; readonly pasos: readonly Paso[] }
  | { readonly clase: 'imposible'; readonly motivo: MotivoImposible }

/** El lado largo maximo al recodificar: HD, lo que pide Apple. */
export const LADO_MAXIMO = 1920

/** Las frecuencias que el codificador AAC de todos los navegadores acepta. */
const FRECUENCIAS_AAC = [44_100, 48_000]

/** Medidas pares (H.264 con 4:2:0 las exige) que caben en LADO_MAXIMO conservando la proporcion. */
export function medidasDeSalida(ancho: number, alto: number): { ancho: number; alto: number } {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto))
  const par = (n: number): number => Math.max(2, Math.round((n * escala) / 2) * 2)
  return { ancho: par(ancho), alto: par(alto) }
}

/**
 * El plan para un archivo.
 *
 * `frecuenciaDelLibro` es la de los audios que el libro ya tiene (null si no
 * tiene ninguno): un audio nuevo tiene que ir a esa.
 */
export function clasificar(info: InfoMedio | null, puede: Capacidades, frecuenciaDelLibro: number | null): Plan {
  if (!info || info.contenedor === 'otro') return { clase: 'imposible', motivo: 'formato' }
  if (!info.video && !info.audio) return { clase: 'imposible', motivo: 'sinPistas' }
  const pasos: Paso[] = []
  if (info.contenedor !== 'mp4') pasos.push({ tipo: 'contenedor', de: info.contenedor })

  if (info.video) {
    const v = info.video
    const motivo: 'codec' | 'hdr' | 'negro' | null =
      v.codec !== 'avc' && v.codec !== 'hevc'
        ? 'codec'
        : v.hdr
          ? 'hdr'
          : !info.negro?.principio || !info.negro.final
            ? 'negro'
            : null
    if (motivo) {
      if (!puede.decodificaVideo) return { clase: 'imposible', motivo: 'noDecodifica' }
      if (!puede.codificaAvc) return { clase: 'imposible', motivo: 'sinH264' }
      const salida = medidasDeSalida(v.ancho, v.alto)
      const reduce = salida.ancho !== v.ancho || salida.alto !== v.alto
      pasos.push({ tipo: 'video', motivo, ...salida, ...(reduce ? { antes: { ancho: v.ancho, alto: v.alto } } : {}) })
    }
    // El sonido del video: AAC, como mucho estereo. Su frecuencia no se toca:
    // la regla de Apple es para los archivos de AUDIO del libro.
    if (info.audio) {
      const a = info.audio
      const motivoAudio = a.codec !== 'aac' ? 'codec' : a.canales > 2 ? 'canales' : null
      if (motivoAudio) {
        if (!puede.decodificaAudio) return { clase: 'imposible', motivo: 'noDecodifica' }
        if (!puede.codificaAac) return { clase: 'imposible', motivo: 'sinAac' }
        const hz = FRECUENCIAS_AAC.includes(a.hz) ? a.hz : 48_000
        pasos.push({ tipo: 'audio', motivo: motivoAudio, hz, canales: Math.min(2, a.canales) })
      }
    }
    return { clase: pasos.some((p) => p.tipo !== 'contenedor') ? 'convertible' : 'valido', tipo: 'm4v', pasos }
  }

  const a = info.audio as InfoAudio
  // La frecuencia del libro manda; si es el primero, se queda la suya, salvo
  // que haya que recodificar y la suya no sea una que acepte el codificador.
  const yaEsAac = a.codec === 'aac'
  const objetivo = frecuenciaDelLibro ?? (yaEsAac || FRECUENCIAS_AAC.includes(a.hz) ? a.hz : 44_100)
  const motivo: 'codec' | 'frecuencia' | 'canales' | null = !yaEsAac
    ? 'codec'
    : a.hz !== objetivo
      ? 'frecuencia'
      : a.canales > 2
        ? 'canales'
        : null
  if (motivo) {
    if (!puede.decodificaAudio) return { clase: 'imposible', motivo: 'noDecodifica' }
    if (!puede.codificaAac) return { clase: 'imposible', motivo: 'sinAac' }
    pasos.push({ tipo: 'audio', motivo, hz: objetivo, canales: Math.min(2, a.canales) })
  }
  return { clase: motivo ? 'convertible' : 'valido', tipo: 'm4a', pasos }
}

/**
 * Si un fotograma es negro, por sus pixeles RGBA (de un lienzo pequeño).
 *
 * Negro de verdad: la luminancia media muy baja Y casi ningun pixel claro. Un
 * fotograma oscuro de noche con una farola encendida no es negro, y Apple
 * pide negro.
 */
export function esNegro(rgba: ArrayLike<number>): boolean {
  let suma = 0
  let claros = 0
  let n = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const y = 0.2126 * (rgba[i] as number) + 0.7152 * (rgba[i + 1] as number) + 0.0722 * (rgba[i + 2] as number)
    suma += y
    if (y > 32) claros += 1
    n += 1
  }
  return n > 0 && suma / n <= 16 && claros / n <= 0.01
}

/**
 * La frecuencia de los audios que el libro ya tiene, en el orden del libro, o
 * null si no tiene ninguno con la frecuencia conocida. `sin` deja fuera un
 * medio: el que se esta sustituyendo.
 */
export function frecuenciaDelLibro(
  p: Pick<Proyecto, 'capitulos' | 'extras'>,
  medios: ReadonlyMap<string, Medio>,
  sin?: string,
): number | null {
  for (const c of [...p.capitulos, ...p.extras]) {
    for (const b of c.bloques) {
      if (b.tipo !== 'audio' || b.medioId === sin) continue
      const hz = medios.get(b.medioId)?.hz
      if (hz) return hz
    }
  }
  return null
}

/**
 * El nombre que el autor puede reconocer de un codec de Mediabunny. Son
 * nombres propios (H.264, AAC), los mismos en todos los idiomas.
 */
export function nombreDeCodec(codec: string | null): string {
  if (!codec) return '?'
  if (codec.startsWith('pcm') || codec === 'ulaw' || codec === 'alaw') return 'PCM'
  return (
    ({ avc: 'H.264', hevc: 'HEVC', vp8: 'VP8', vp9: 'VP9', av1: 'AV1', prores: 'ProRes', aac: 'AAC', mp3: 'MP3', opus: 'Opus', vorbis: 'Vorbis', flac: 'FLAC', ac3: 'AC-3', eac3: 'E-AC-3' } as Record<string, string>)[codec] ??
    codec.toUpperCase()
  )
}
