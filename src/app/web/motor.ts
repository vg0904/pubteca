/**
 * El motor del libro web, tal como lo corre su hilo: entra y sale solo lo que
 * se puede mandar entre hilos. Lo mismo que `motor.ts` para los EPUB, y por lo
 * mismo: empaquetar un libro ilustrado lleva segundos, y en el hilo de la
 * pagina la congelaba.
 */
import type { Proyecto as ProyectoMotor } from '../../core/proyecto'
import type { ConfigWeb } from '../../core/web/config'
import { construirWeb } from '../../core/web/construir'

export interface PedidoWeb {
  readonly proyecto: ProyectoMotor
  /** La hora de la generacion, en ms: el motor no lee el reloj. */
  readonly ahora: number
  /** `lector.js` y el LEEME, ya leidos. */
  readonly lector: string
  readonly leeme: string
  /** Con lo omitido por la ruta de su archivo: ver `configParaElCore`. */
  readonly config: ConfigWeb
  /** Los archivos de las letras (TTF y su licencia), por su nombre. */
  readonly letras: ReadonlyMap<string, Uint8Array>
}

export interface RespuestaWeb {
  readonly nombreArchivo: string
  /** El .zip, o null si no se genero. */
  readonly bytes: Uint8Array | null
  /** Por que no se genero nada, o null. */
  readonly bloqueado: string | null
  readonly diagnosticos: { readonly errores: readonly string[]; readonly avisos: readonly string[]; readonly notas: readonly string[] }
  readonly muestra: boolean
  /** Cuantas partes y cuantas imagenes lleva, para decirlo. */
  readonly partes: number
  readonly imagenes: number
  /** Los audios y videos que se quedaron fuera: el libro web no los lleva. */
  readonly sinMedios: { readonly videos: number; readonly audios: number }
  /** Cuantas letras se pueden elegir, sin contar la del aparato. */
  readonly letras: number
}

export function correrWeb(p: PedidoWeb): RespuestaWeb {
  const w = construirWeb(p.proyecto, { ahora: new Date(p.ahora), lector: p.lector, leeme: p.leeme, config: p.config, letras: p.letras })
  return {
    nombreArchivo: w.nombreArchivo,
    bytes: w.bloqueado === null ? w.bytes : null,
    bloqueado: w.bloqueado,
    diagnosticos: { errores: [...w.diagnosticos.errores], avisos: [...w.diagnosticos.avisos], notas: [...w.diagnosticos.notas] },
    muestra: w.manifiesto?.muestra ?? false,
    partes: w.manifiesto?.partes.length ?? 0,
    imagenes: w.archivos.filter((a) => a.ruta.startsWith('libro/imagenes/')).length,
    sinMedios: w.sinMedios,
    letras: (w.manifiesto?.letras ?? []).filter((l) => l.familia !== null).length,
  }
}
