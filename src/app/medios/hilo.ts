/**
 * Lanzar una conversion en su hilo, con progreso, cancelar y PERRO GUARDIAN.
 *
 * El perro guardian vive aqui, en la pagina, y no en el hilo: un hilo colgado
 * no puede vigilarse a si mismo. En la fase 0 (plan.md) Safari se quedo parado
 * convirtiendo un video vertical: sin error, sin CPU, y sin que dispararan ni
 * los temporizadores del propio hilo. Si el hilo pasa `parado` milisegundos sin
 * dar señales (progreso o latido), se mata y se dice por que.
 *
 * Cancelar tambien mata el hilo: es lo unico que para de verdad un codificador
 * a medias. Lo que dejara escrito en OPFS lo borra `limpiarOpfs` al abrir.
 */
import type { Convertido, PlanConvertible } from './convertir'

export type CausaFallo = 'parado' | 'cancelado' | 'fallo'

export class ErrorConversion extends Error {
  readonly causa: CausaFallo
  constructor(causa: CausaFallo, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorConversion'
    this.causa = causa
  }
}

/** Lo que se usa de un Worker: asi los tests le pasan uno de mentira. */
export interface HiloConversion {
  postMessage(mensaje: unknown): void
  terminate(): void
  onmessage: ((e: MessageEvent) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

export interface Tarea {
  readonly hecho: Promise<Convertido>
  cancelar(): void
}

/** Cuanto se espera sin señales antes de dar el hilo por parado. */
export const PARADO = 30_000

function hiloDeVerdad(): HiloConversion {
  return new Worker(new URL('./conversion.worker.ts', import.meta.url), { type: 'module' }) as unknown as HiloConversion
}

export function convertirEnSuHilo(
  archivo: Blob,
  plan: PlanConvertible,
  alProgresar: (fraccion: number) => void,
  opciones: { readonly crearHilo?: () => HiloConversion; readonly parado?: number } = {},
): Tarea {
  const parado = opciones.parado ?? PARADO
  let terminar: (() => void) | null = null
  let fallar: (e: ErrorConversion) => void = () => undefined
  const hecho = new Promise<Convertido>((resolver, rechazar) => {
    let hilo: HiloConversion
    try {
      hilo = (opciones.crearHilo ?? hiloDeVerdad)()
    } catch (e) {
      rechazar(new ErrorConversion('fallo', e instanceof Error ? e.message : String(e)))
      return
    }
    let ultimaSenal = Date.now()
    let acabado = false
    const vigilar = setInterval(() => {
      if (Date.now() - ultimaSenal > parado) acabar(new ErrorConversion('parado', 'La conversión se quedó parada.'))
    }, Math.min(1000, parado / 4))
    const acabar = (r: Convertido | ErrorConversion): void => {
      if (acabado) return
      acabado = true
      clearInterval(vigilar)
      hilo.terminate()
      if (r instanceof ErrorConversion) rechazar(r)
      else resolver(r)
    }
    terminar = () => acabar(new ErrorConversion('cancelado', 'Conversión cancelada.'))
    fallar = (e) => acabar(e)
    hilo.onmessage = (e: MessageEvent) => {
      ultimaSenal = Date.now()
      const m = e.data as { tipo: string; fraccion?: number; datos?: Blob; enMemoria?: boolean; mensaje?: string }
      if (m.tipo === 'progreso' && typeof m.fraccion === 'number') alProgresar(m.fraccion)
      else if (m.tipo === 'hecho' && m.datos) acabar({ datos: m.datos, enMemoria: m.enMemoria === true })
      else if (m.tipo === 'error') acabar(new ErrorConversion('fallo', m.mensaje ?? 'Error al convertir.'))
    }
    hilo.onerror = (e: ErrorEvent) => {
      e.preventDefault()
      acabar(new ErrorConversion('fallo', e.message || 'El hilo de la conversión falló.'))
    }
    hilo.postMessage({ archivo, plan })
  })
  return {
    hecho,
    cancelar: () => {
      if (terminar) terminar()
      else fallar(new ErrorConversion('cancelado', 'Conversión cancelada.'))
    },
  }
}
