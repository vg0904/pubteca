/**
 * Generar el libro web desde el navegador.
 *
 * El mismo camino que los EPUB (`generar.ts`): lo asincrono se hace antes
 * (leer las imagenes del almacen, aligerarlas, traer el lector), y el motor
 * recibe todo en memoria y corre sincrono, en su hilo.
 */
import { archivosDeLetra, familiasWeb } from '../../core/web/letras'
import type { Idioma } from '../../i18n'
import type { Codificador } from '../entrega'
import { exportar, type Exportado } from '../exportar'
import { bytesDelProyecto, conLienzo } from '../generar'
import type { Imagen, Proyecto } from '../modelo'
import type { Repositorio } from '../repositorio'
import { paraLaWeb } from './imagenes'
import type { PedidoWeb, RespuestaWeb } from './motor'
import { configParaElCore, configWeb } from './preparar'

export interface WebGenerada {
  readonly respuesta: RespuestaWeb
  readonly exportado: Exportado
  /** Lo que pesaban y lo que pesan las imagenes, si se aligeraron. */
  readonly imagenes: { readonly antes: number; readonly ahora: number } | null
}

/**
 * El lector y su LEEME. Viajan dentro de la app como texto, no como codigo de
 * la app: son lo que se mete en el .zip. Solo los descarga quien genera un
 * libro web. El LEEME va en el idioma de la interfaz, que es el del autor.
 */
export async function recursosDelLector(idioma: Idioma): Promise<{ lector: string; leeme: string }> {
  const [lector, leeme] = await Promise.all([
    import('../../lector/lector.js?raw'),
    idioma === 'en' ? import('../../lector/LEEME.en.md?raw') : import('../../lector/LEEME.es.md?raw'),
  ])
  return { lector: lector.default, leeme: leeme.default }
}

let letrasEnCache: Promise<Map<string, Uint8Array>> | null = null

/**
 * Las letras del libro web: las del impreso, de `public/fuentes/impreso/`, con
 * su licencia. Una familia que no llega entera se deja fuera (el core no la
 * ofrece) en vez de parar el libro: sin conexion sale con la letra del aparato.
 */
export function cargarLetras(): Promise<Map<string, Uint8Array>> {
  letrasEnCache ??= Promise.all(
    familiasWeb().map(async (f) => {
      const { caras, licencia } = archivosDeLetra(f)
      try {
        return await Promise.all(
          [...caras.map((c) => c.ttf), licencia].map(async (nombre) => {
            const r = await fetch(`${import.meta.env.BASE_URL}fuentes/impreso/${nombre}`)
            if (!r.ok) throw new Error(`${nombre}: ${r.status}`)
            return [nombre, new Uint8Array(await r.arrayBuffer())] as const
          }),
        )
      } catch {
        return []
      }
    }),
  ).then((familias) => {
    const todas = new Map(familias.flat())
    // Si no llego ninguna, se vuelve a intentar la proxima vez.
    if (todas.size === 0) letrasEnCache = null
    return todas
  })
  return letrasEnCache
}

/** El hilo: se abre la primera vez y se reutiliza. null si no se puede. */
let hilo: Worker | null | undefined

function hiloDeLaWeb(): Worker | null {
  if (hilo !== undefined) return hilo
  try {
    hilo = typeof Worker === 'function' ? new Worker(new URL('./web.worker.ts', import.meta.url), { type: 'module' }) : null
  } catch {
    hilo = null
  }
  return hilo
}

async function aqui(pedido: PedidoWeb): Promise<RespuestaWeb> {
  const { correrWeb } = await import('./motor')
  return correrWeb(pedido)
}

/** Corre el motor en su hilo; si el hilo no se puede usar, aqui. El pedido se copia, como en los EPUB. */
function enSuHilo(pedido: PedidoWeb): Promise<RespuestaWeb> {
  const w = hiloDeLaWeb()
  if (!w) return aqui(pedido)
  return new Promise((resolver, rechazar) => {
    const limpiar = (): void => {
      w.removeEventListener('message', alResponder)
      w.removeEventListener('error', alFallar)
    }
    const alResponder = (e: MessageEvent<{ ok: true; respuesta: RespuestaWeb } | { ok: false; error: string }>): void => {
      limpiar()
      if (e.data.ok) resolver(e.data.respuesta)
      else rechazar(new Error(e.data.error))
    }
    const alFallar = (e: ErrorEvent): void => {
      limpiar()
      e.preventDefault()
      w.terminate()
      hilo = null
      aqui(pedido).then(resolver, rechazar)
    }
    w.addEventListener('message', alResponder)
    w.addEventListener('error', alFallar)
    w.postMessage(pedido)
  })
}

export async function generarWeb(
  p: Proyecto,
  originales: ReadonlyMap<string, Imagen>,
  repo: Repositorio,
  ahora: Date,
  idioma: Idioma,
  codificar: Codificador = conLienzo,
  recursos: (idioma: Idioma) => Promise<{ lector: string; leeme: string }> = recursosDelLector,
  letras: () => Promise<ReadonlyMap<string, Uint8Array>> = cargarLetras,
): Promise<WebGenerada> {
  const c = configWeb(p)
  const [crudos, { lector, leeme }, deLetras] = await Promise.all([bytesDelProyecto(p, repo), recursos(idioma), letras()])
  const entrega = c.aligerar ? await paraLaWeb(p, c, originales, crudos, codificar) : null
  // Sin fuentes: en la web la letra la pone el lector, o el sitio. Los audios
  // y videos van como ficha, lo justo para que sus marcas no den error.
  const exportado = exportar(p, entrega?.imagenes ?? originales, entrega?.bytes ?? crudos, [], repo.medios())
  const respuesta = await enSuHilo({
    proyecto: exportado.proyecto,
    ahora: ahora.getTime(),
    lector,
    leeme,
    config: configParaElCore(p, exportado),
    letras: deLetras,
  })
  return { respuesta, exportado, imagenes: entrega && entrega.ahora < entrega.antes ? { antes: entrega.antes, ahora: entrega.ahora } : null }
}
