/**
 * Generar los dos EPUB desde el navegador.
 *
 * Aqui se juntan las dos capas: lo asincrono (leer los Blob de las imagenes,
 * traer las fuentes) se hace ANTES, y el motor recibe todo en memoria y corre
 * sincrono, igual que en los golden tests. El camino es el mismo que el del
 * .zip y el de la vista previa: exportar() y nada mas.
 *
 * El motor corre en su propio hilo (motor.worker.ts): con un libro ilustrado
 * empaquetar lleva segundos, y en el hilo de la pagina la congelaba. Si el
 * navegador no puede abrir el hilo, corre aqui; el resultado es el mismo.
 */
import { archivo, type Archivo } from '../core/proyecto'
import { exportar, type Exportado } from './exportar'
import type { Imagen, Proyecto } from './modelo'
import type { PedidoMotor, RespuestaMotor } from './motor'
import type { Repositorio } from './repositorio'

/** Las fuentes que van dentro del EPUB de Apple Books. OFL, en public/fuentes. */
const FUENTES = ['LibreBaskerville-Regular.ttf', 'LibreBaskerville-Italic.ttf', 'LibreBaskerville-Bold.ttf']

let fuentesEnCache: Promise<Archivo[]> | null = null

/**
 * Trae las fuentes una vez por sesion. Si fallan (sin conexion y sin cache),
 * el libro sale igual: Apple Books usa su Baskerville, y Kindle nunca lleva
 * fuente propia.
 */
export function cargarFuentes(): Promise<Archivo[]> {
  fuentesEnCache ??= Promise.all(
    FUENTES.map(async (nombre) => {
      const r = await fetch(`${import.meta.env.BASE_URL}fuentes/${nombre}`)
      if (!r.ok) throw new Error(`${nombre}: ${r.status}`)
      return archivo(`fuentes/${nombre}`, new Uint8Array(await r.arrayBuffer()))
    }),
  ).catch(() => {
    fuentesEnCache = null
    return []
  })
  return fuentesEnCache
}

/** Todas las imagenes que el proyecto usa, por id. */
export function idsDeImagenes(p: Proyecto): Set<string> {
  const ids = new Set<string>([...p.laminas, ...Object.values(p.portada)])
  for (const c of p.capitulos) {
    for (const a of c.aperturas) ids.add(a.imagenId)
    for (const b of c.bloques) if (b.tipo === 'ilustracion') ids.add(b.imagenId)
  }
  for (const x of p.extras) for (const b of x.bloques) if (b.tipo === 'ilustracion') ids.add(b.imagenId)
  return ids
}

export async function bytesDelProyecto(p: Proyecto, repo: Repositorio): Promise<Map<string, Uint8Array>> {
  const bytes = new Map<string, Uint8Array>()
  for (const id of idsDeImagenes(p)) {
    const b = await repo.bytes(id)
    if (b) bytes.set(id, b)
  }
  return bytes
}

export interface Generado {
  readonly exportado: Exportado
  readonly motor: RespuestaMotor
  readonly sinFuentes: boolean
}

/** El hilo del motor: se abre la primera vez y se reutiliza. null si no se puede. */
let hilo: Worker | null | undefined

function hiloDelMotor(): Worker | null {
  if (hilo !== undefined) return hilo
  try {
    hilo = typeof Worker === 'function' ? new Worker(new URL('./motor.worker.ts', import.meta.url), { type: 'module' }) : null
  } catch {
    hilo = null
  }
  return hilo
}

/** El motor en el hilo de la pagina, cargado solo si hace falta. */
async function aqui(pedido: PedidoMotor): Promise<RespuestaMotor> {
  const { correrMotor } = await import('./motor')
  return correrMotor(pedido)
}

/**
 * Corre el motor en su hilo.
 *
 * El pedido se COPIA, no se transfiere: si el hilo fallara (un navegador que
 * no carga el modulo del worker, por ejemplo) hay que poder repetirlo aqui con
 * los mismos bytes, y las fuentes se reutilizan entre generaciones. Lo que
 * vuelve (los EPUB) si llega transferido.
 */
export function enSuHilo(pedido: PedidoMotor): Promise<RespuestaMotor> {
  const w = hiloDelMotor()
  if (!w) return aqui(pedido)
  return new Promise((resolver, rechazar) => {
    const limpiar = (): void => {
      w.removeEventListener('message', alResponder)
      w.removeEventListener('error', alFallar)
    }
    const alResponder = (e: MessageEvent<{ ok: true; respuesta: RespuestaMotor } | { ok: false; error: string }>): void => {
      limpiar()
      if (e.data.ok) resolver(e.data.respuesta)
      else rechazar(new Error(e.data.error))
    }
    const alFallar = (e: ErrorEvent): void => {
      limpiar()
      e.preventDefault()
      // El hilo no se pudo usar: no se vuelve a intentar, y esta vez se corre aqui.
      w.terminate()
      hilo = null
      aqui(pedido).then(resolver, rechazar)
    }
    w.addEventListener('message', alResponder)
    w.addEventListener('error', alFallar)
    w.postMessage(pedido)
  })
}

export async function generarLibros(
  p: Proyecto,
  imagenes: ReadonlyMap<string, Imagen>,
  repo: Repositorio,
  ahora: Date,
): Promise<Generado> {
  const [bytes, fuentes] = await Promise.all([bytesDelProyecto(p, repo), cargarFuentes()])
  const exportado = exportar(p, imagenes, bytes, fuentes)
  const motor = await enSuHilo({ proyecto: exportado.proyecto, ahora: ahora.getTime() })
  return { exportado, motor, sinFuentes: fuentes.length === 0 }
}
