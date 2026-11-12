/**
 * Separar el fondo en CMYK en su hilo, para que la pagina no se congele los
 * segundos que tarda. Si el hilo no se puede abrir (o falla), se hace aqui,
 * con el mismo motor: el resultado es el mismo, solo que la pagina espera.
 */
import { separarYComprimir } from './cmyk-motor'
import type { PedidoCmyk, RespuestaCmyk } from './cmyk.worker'
import { ARCHIVO_PERFIL, perfilCmyk } from './perfil'

let hilo: Worker | null | undefined
let siguiente = 0
const esperando = new Map<number, (r: RespuestaCmyk) => void>()

function hiloCmyk(): Worker | null {
  if (hilo !== undefined) return hilo
  try {
    hilo = typeof Worker === 'function' ? new Worker(new URL('./cmyk.worker.ts', import.meta.url), { type: 'module' }) : null
  } catch {
    hilo = null
  }
  if (hilo) {
    hilo.addEventListener('message', (e: MessageEvent<RespuestaCmyk>) => {
      const r = esperando.get(e.data.id)
      esperando.delete(e.data.id)
      r?.(e.data)
    })
    hilo.addEventListener('error', (e) => {
      e.preventDefault()
      // El hilo no sirve: lo pendiente falla y lo siguiente se hace en la pagina.
      hilo?.terminate()
      hilo = null
      for (const [id, r] of esperando) r({ id, error: 'hilo' })
      esperando.clear()
    })
  }
  return hilo
}

async function enLaPagina(rgba: Uint8ClampedArray, ancho: number, alto: number, limite: number): Promise<Uint8Array> {
  const { perfil } = await perfilCmyk()
  // Un respiro para que se pinte el «Preparando…» antes de bloquear.
  await new Promise((r) => setTimeout(r, 0))
  return separarYComprimir(perfil, rgba, ancho, alto, limite)
}

/** El fondo RGBA del lienzo, separado y comprimido para el PDF. Se queda con `rgba` (se transfiere). */
export async function separarEnHilo(rgba: Uint8ClampedArray, ancho: number, alto: number, limite: number): Promise<Uint8Array> {
  const w = hiloCmyk()
  if (!w) return enLaPagina(rgba, ancho, alto, limite)
  const id = ++siguiente
  const urlPerfil = new URL(`${import.meta.env.BASE_URL}${ARCHIVO_PERFIL}`, location.href).href
  const r = await new Promise<RespuestaCmyk>((resolver) => {
    esperando.set(id, resolver)
    try {
      w.postMessage({ id, rgba, ancho, alto, limite, urlPerfil } satisfies PedidoCmyk, [rgba.buffer])
    } catch {
      esperando.delete(id)
      resolver({ id, error: 'no se pudo mandar' })
    }
  })
  if ('datos' in r) return r.datos
  // Si el hilo fallo y el RGBA no se llego a transferir, se hace aqui.
  if (rgba.byteLength > 0) return enLaPagina(rgba, ancho, alto, limite)
  throw new Error(r.error)
}
