/**
 * El hilo del libro web. Solo recibe, corre `correrWeb` y devuelve: ver
 * motor.ts. El .zip vuelve TRANSFERIDO, no copiado.
 */
import { correrWeb, type PedidoWeb } from './motor'

/** Lo que hace falta del ambito global de un worker, sin cargar la lib de tipos WebWorker. */
const hilo = self as unknown as {
  onmessage: ((e: MessageEvent<PedidoWeb>) => void) | null
  postMessage(mensaje: unknown, transferir?: Transferable[]): void
}

hilo.onmessage = (e) => {
  try {
    const r = correrWeb(e.data)
    const b = r.bytes
    const entero = b !== null && b.buffer instanceof ArrayBuffer && b.byteOffset === 0 && b.byteLength === b.buffer.byteLength
    hilo.postMessage({ ok: true, respuesta: r }, entero ? [b.buffer as ArrayBuffer] : [])
  } catch (error) {
    hilo.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
