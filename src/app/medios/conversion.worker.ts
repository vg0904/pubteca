/**
 * El hilo de la conversion. Recibe el archivo y el plan, convierte y devuelve
 * el resultado. Ver convertir.ts y hilo.ts.
 *
 * Avisa de que sigue vivo cada segundo, ademas de con el progreso: es lo que
 * vigila el perro guardian de la pagina. Si este hilo se cuelga (Safari lo hacia
 * con algun video vertical, sin ningun error), deja de avisar, y la pagina lo
 * mata y lo dice en vez de enseñar una barra quieta para siempre.
 */
import { convertir, type PlanConvertible } from './convertir'

const hilo = self as unknown as {
  onmessage: ((e: MessageEvent<{ archivo: Blob; plan: PlanConvertible }>) => void) | null
  postMessage(mensaje: unknown): void
}

hilo.onmessage = (e) => {
  const latido = setInterval(() => hilo.postMessage({ tipo: 'vivo' }), 1000)
  let ultimo = 0
  convertir(e.data.archivo, e.data.plan, (fraccion) => {
    const ahora = Date.now()
    if (ahora - ultimo < 150 && fraccion < 1) return
    ultimo = ahora
    hilo.postMessage({ tipo: 'progreso', fraccion })
  }).then(
    (r) => hilo.postMessage({ tipo: 'hecho', datos: r.datos, enMemoria: r.enMemoria }),
    (error: unknown) => hilo.postMessage({ tipo: 'error', mensaje: error instanceof Error ? error.message : String(error) }),
  ).finally(() => clearInterval(latido))
}
