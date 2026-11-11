/**
 * El motor, tal como lo corre su hilo: entra y sale solo lo que se puede
 * mandar entre hilos.
 *
 * El motor es sincrono a proposito (asi los golden tests son deterministas), y
 * con un libro ilustrado bloqueaba la pagina mientras empaquetaba: la interfaz
 * se congelaba y la barra de progreso no se movia. Ahora corre en un Web Worker
 * (motor.worker.ts). Esta funcion es lo que ese hilo ejecuta, y tambien lo que
 * se ejecuta aqui mismo si el navegador no puede abrir el hilo: el mismo
 * codigo, solo cambia donde corre.
 *
 * `postMessage` copia con structured clone, que NO lleva clases ni funciones:
 * por eso aqui sale un objeto plano y no la `Construccion` del motor, y por
 * eso el reporte se escribe dentro del hilo, donde esta el `Libro` que lo
 * necesita.
 */
import { construir } from '../core/construir'
import type { Proyecto as ProyectoMotor } from '../core/proyecto'
import { reporte } from '../core/reporte'
import { esHueco, type Segmento } from '../core/zip'

export interface PedidoMotor {
  readonly proyecto: ProyectoMotor
  /** La hora de la generacion, en ms: el motor no lee el reloj. */
  readonly ahora: number
}

export interface LibroGenerado {
  readonly tienda: 'Kindle' | 'AppleBooks'
  readonly nombreArchivo: string
  /**
   * El EPUB en trozos, con un hueco donde va cada audio o video: sus bytes
   * nunca pasan por el motor ni por el hilo. Ver `blobDelLibro` en generar.ts.
   */
  readonly segmentos: readonly Segmento[]
  /** Lo que pesa el EPUB entero, medios incluidos. */
  readonly tamano: number
}

/**
 * El EPUB entero en memoria, si no tiene huecos (Kindle siempre, y Apple Books
 * sin audio ni video). Con huecos, null: hay que armarlo con `blobDelLibro`.
 */
export function bytesDelLibro(l: LibroGenerado): Uint8Array | null {
  const [unico, ...resto] = l.segmentos
  return unico && resto.length === 0 && !esHueco(unico) ? unico : null
}

export interface RespuestaMotor {
  readonly resultados: readonly LibroGenerado[]
  readonly uid: string
  /** Por que no se genero nada, o null. */
  readonly bloqueado: string | null
  readonly diagnosticos: { readonly errores: readonly string[]; readonly avisos: readonly string[]; readonly notas: readonly string[] }
  readonly reporte: string
}

export function correrMotor(p: PedidoMotor): RespuestaMotor {
  const ahora = new Date(p.ahora)
  const c = construir(p.proyecto, { ahora })
  return {
    resultados: c.resultados.map((r) => ({ tienda: r.tienda, nombreArchivo: r.nombreArchivo, segmentos: r.segmentos, tamano: r.tamano })),
    uid: c.uid,
    bloqueado: c.bloqueado,
    diagnosticos: { errores: [...c.diagnosticos.errores], avisos: [...c.diagnosticos.avisos], notas: [...c.diagnosticos.notas] },
    reporte: reporte(c, ahora),
  }
}
