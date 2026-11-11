/**
 * El hilo del motor. Solo recibe, corre `correrMotor` y devuelve: ver motor.ts.
 *
 * Los EPUB vuelven TRANSFERIDOS, no copiados: son del hilo y nadie los vuelve a
 * usar aqui, y con un libro ilustrado son cientos de MB.
 */
import { correrMotor, type PedidoMotor } from './motor'

/** Lo que hace falta del ambito global de un worker, sin cargar la lib de tipos WebWorker. */
const hilo = self as unknown as {
  onmessage: ((e: MessageEvent<PedidoMotor>) => void) | null
  postMessage(mensaje: unknown, transferir?: Transferable[]): void
}

hilo.onmessage = (e) => {
  try {
    const r = correrMotor(e.data)
    const buffers = new Set<ArrayBuffer>()
    for (const x of r.resultados) {
      for (const s of x.segmentos) {
        if (s instanceof Uint8Array && s.buffer instanceof ArrayBuffer && s.byteOffset === 0 && s.byteLength === s.buffer.byteLength) {
          buffers.add(s.buffer)
        }
      }
    }
    hilo.postMessage({ ok: true, respuesta: r }, [...buffers])
  } catch (error) {
    hilo.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
