/**
 * Hablar con el hilo del impreso.
 *
 * El hilo atiende los pedidos en orden, asi que las respuestas vuelven en el
 * mismo orden: basta una cola de quien espera. Si el hilo no se puede abrir (o
 * falla al cargar), el motor corre en la pagina, una vez cargado con import():
 * el resultado es el mismo, solo que la pagina espera.
 *
 * Mientras se compone, los cambios que lleguen no hacen cola: gana el ultimo
 * (`ColaDeComposicion`). Arrastrar el deslizador del cuerpo manda un pedido
 * por cada paso, y componer los veinte seria llegar tarde a todos.
 */
import type { MotorImpreso, PedidoComponer, PedidoImpreso, RespuestaImpreso } from './motor'

let hilo: Worker | null | undefined
let enLaPagina: MotorImpreso | null = null
const esperando: ((r: RespuestaImpreso) => void)[] = []
const pedidos: PedidoImpreso[] = []

async function aqui(p: PedidoImpreso): Promise<RespuestaImpreso> {
  if (!enLaPagina) {
    const { MotorImpreso: M } = await import('./motor')
    enLaPagina = new M()
  }
  // Un respiro antes de bloquear: que la pagina pinte el «Componiendo…».
  await new Promise((r) => setTimeout(r, 0))
  return enLaPagina.atender(p)
}

function hiloDelImpreso(): Worker | null {
  if (hilo !== undefined) return hilo
  try {
    hilo = typeof Worker === 'function' ? new Worker(new URL('./impreso.worker.ts', import.meta.url), { type: 'module' }) : null
  } catch {
    hilo = null
  }
  if (hilo) {
    hilo.addEventListener('message', (e: MessageEvent<RespuestaImpreso>) => {
      pedidos.shift()
      esperando.shift()?.(e.data)
    })
    hilo.addEventListener('error', (e) => {
      e.preventDefault()
      // El hilo no sirve: no se vuelve a intentar, y lo pendiente se hace aqui.
      hilo?.terminate()
      hilo = null
      const pendientes = pedidos.splice(0)
      const quienes = esperando.splice(0)
      pendientes.forEach((p, i) => void aqui(p).then(quienes[i]))
    })
  }
  return hilo
}

/** Un pedido al motor, en su hilo si se puede. */
export function pedirAlImpreso(p: PedidoImpreso, transferir: Transferable[] = []): Promise<RespuestaImpreso> {
  const w = hiloDelImpreso()
  if (!w) return aqui(p)
  return new Promise((resolver) => {
    esperando.push(resolver)
    pedidos.push(p)
    w.postMessage(p, transferir)
  })
}

/** Componer, con un solo pedido en vuelo y solo el ultimo esperando. */
export class ColaDeComposicion {
  private enVuelo = false
  private siguiente: { readonly p: PedidoComponer; readonly resolver: (r: RespuestaImpreso | null) => void } | null = null
  private readonly pedir: (p: PedidoComponer) => Promise<RespuestaImpreso>

  constructor(pedir: (p: PedidoComponer) => Promise<RespuestaImpreso> = (p) => pedirAlImpreso(p)) {
    this.pedir = pedir
  }

  /** La respuesta, o null si llego otro pedido antes de que este saliera. */
  componer(p: PedidoComponer): Promise<RespuestaImpreso | null> {
    return new Promise((resolver) => {
      if (!this.enVuelo) {
        this.lanzar(p, resolver)
        return
      }
      this.siguiente?.resolver(null)
      this.siguiente = { p, resolver }
    })
  }

  private lanzar(p: PedidoComponer, resolver: (r: RespuestaImpreso | null) => void): void {
    this.enVuelo = true
    void this.pedir(p).then((r) => {
      resolver(r)
      this.enVuelo = false
      const s = this.siguiente
      this.siguiente = null
      if (s) this.lanzar(s.p, s.resolver)
    })
  }
}
