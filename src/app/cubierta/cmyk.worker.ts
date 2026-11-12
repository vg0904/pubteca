/**
 * El hilo del CMYK: recibe el fondo de la cubierta en RGBA, lo separa con el
 * perfil y devuelve el flujo comprimido para el PDF. El perfil lo trae el
 * propio hilo la primera vez (de la URL que le pasan) y lo guarda.
 */
import { leerPerfil, type Perfil } from '../../core/impreso/icc'
import { separarYComprimir } from './cmyk-motor'

export interface PedidoCmyk {
  readonly id: number
  readonly rgba: Uint8ClampedArray
  readonly ancho: number
  readonly alto: number
  readonly limite: number
  readonly urlPerfil: string
}

export type RespuestaCmyk = { readonly id: number; readonly datos: Uint8Array } | { readonly id: number; readonly error: string }

const hilo = self as unknown as {
  onmessage: ((e: MessageEvent<PedidoCmyk>) => void) | null
  postMessage(mensaje: unknown, transferir?: Transferable[]): void
}

let perfil: Promise<Perfil> | null = null

hilo.onmessage = (e) => {
  const p = e.data
  void (async () => {
    try {
      perfil ??= fetch(p.urlPerfil).then(async (r) => {
        if (!r.ok) throw new Error(`perfil: ${r.status}`)
        return leerPerfil(new Uint8Array(await r.arrayBuffer()))
      })
      const datos = separarYComprimir(await perfil, p.rgba, p.ancho, p.alto, p.limite)
      hilo.postMessage({ id: p.id, datos } satisfies RespuestaCmyk, [datos.buffer])
    } catch (err) {
      perfil = null
      hilo.postMessage({ id: p.id, error: err instanceof Error ? err.message : String(err) } satisfies RespuestaCmyk)
    }
  })()
}
