/**
 * El hilo del impreso: recibe, compone (o escribe el PDF) y devuelve. Ver motor.ts.
 * El PDF vuelve TRANSFERIDO: aqui nadie lo vuelve a usar.
 */
import { MotorImpreso, type PedidoImpreso } from './motor'

/** Lo que hace falta del ambito global de un worker, sin cargar la lib de tipos WebWorker. */
const hilo = self as unknown as {
  onmessage: ((e: MessageEvent<PedidoImpreso>) => void) | null
  postMessage(mensaje: unknown, transferir?: Transferable[]): void
}

const motor = new MotorImpreso()

hilo.onmessage = (e) => {
  const r = motor.atender(e.data)
  if (r.tipo === 'pdf' && r.pdf.buffer instanceof ArrayBuffer) hilo.postMessage(r, [r.pdf.buffer])
  else hilo.postMessage(r)
}
