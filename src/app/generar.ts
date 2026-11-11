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
import { esHueco, type Segmento } from '../core/zip'
import { entregaKindle, paraKindle, type Codificador } from './entrega'
import { exportar, type Exportado } from './exportar'
import { ajustarImagen } from './imagen-canvas'
import { idsDeImagenes, type Imagen, type Proyecto } from './modelo'
import type { LibroGenerado, PedidoMotor, RespuestaMotor } from './motor'
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
  /** Lo que pesaban y lo que pesan las imagenes de Kindle, si se comprimieron. */
  readonly kindle: { readonly antes: number; readonly ahora: number } | null
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

/**
 * El codificador de verdad: el lienzo.
 *
 * Los tests le pasan otro al motor de entrega (ver `paraKindle`), que es lo
 * que deja probar en node toda la decision sin un navegador.
 */
export const conLienzo: Codificador = async (origen, _imagen, ajuste) => {
  const r = await ajustarImagen(new Blob([origen as Uint8Array<ArrayBuffer>]), ajuste)
  return { bytes: new Uint8Array(await r.blob.arrayBuffer()), ancho: r.ancho, alto: r.alto, tipo: r.tipo }
}

/**
 * Genera los dos EPUB.
 *
 * Si el autor no pidio comprimir para Kindle, el motor corre UNA vez y saca los
 * dos libros del mismo proyecto, como siempre. Si lo pidio, corre dos veces: la
 * primera con las imagenes originales (de ahi sale el EPUB de Apple Books, y
 * tambien la revision y el reporte, que tienen que hablar de las imagenes que
 * el autor subio, no de las copias comprimidas) y la segunda con las imagenes
 * de Kindle, de la que solo se queda su EPUB.
 *
 * De la segunda vuelta si se recogen los ERRORES que no estuvieran ya en la
 * primera: son los que dicen que el paquete de Kindle ha salido roto, y eso hay
 * que verlo aunque venga de la vuelta que casi no se mira.
 */
export async function generarLibros(
  p: Proyecto,
  imagenes: ReadonlyMap<string, Imagen>,
  repo: Repositorio,
  ahora: Date,
  codificar: Codificador = conLienzo,
): Promise<Generado> {
  const [bytes, fuentes] = await Promise.all([bytesDelProyecto(p, repo), cargarFuentes()])
  // Los audios y videos van como FICHA (tamaño y CRC): el motor nunca recibe
  // sus bytes. Ver blobDelLibro.
  const exportado = exportar(p, imagenes, bytes, fuentes, repo.medios())
  const motor = await enSuHilo({ proyecto: exportado.proyecto, ahora: ahora.getTime() })

  const k = entregaKindle(p)
  if (!k.comprimir || motor.bloqueado !== null) {
    return { exportado, motor, sinFuentes: fuentes.length === 0, kindle: null }
  }

  const entrega = await paraKindle(p, imagenes, bytes, k, codificar)
  const paraEllos = exportar(p, entrega.imagenes, entrega.bytes, fuentes, repo.medios())
  const otro = await enSuHilo({ proyecto: paraEllos.proyecto, ahora: ahora.getTime() })
  const suyo = otro.resultados.find((r) => r.tienda === 'Kindle')

  return {
    exportado,
    motor: suyo
      ? {
          ...motor,
          resultados: motor.resultados.map((r) => (r.tienda === 'Kindle' ? suyo : r)),
          diagnosticos: {
            ...motor.diagnosticos,
            errores: [...motor.diagnosticos.errores, ...otro.diagnosticos.errores.filter((x) => !motor.diagnosticos.errores.includes(x))],
          },
        }
      : motor,
    sinFuentes: fuentes.length === 0,
    kindle: { antes: entrega.antes, ahora: entrega.ahora },
  }
}

/**
 * Los Blob de cada hueco del EPUB, por la ruta que el motor les dio
 * (`medios/cap01-v01.m4v`). La exportacion sabe que medio va en cada ruta.
 */
export function blobsDeHuecos(
  rutasMedios: ReadonlyMap<string, string>,
  blobMedio: (id: string) => Blob | undefined,
): (ruta: string) => Blob | undefined {
  const porRuta = new Map([...rutasMedios].map(([id, ruta]) => [ruta, id]))
  return (ruta) => {
    const id = porRuta.get(ruta)
    return id === undefined ? undefined : blobMedio(id)
  }
}

/**
 * Arma un archivo a partir de sus segmentos: los trozos que escribio el motor
 * y, en cada hueco, el Blob del medio.
 *
 * `new Blob([...])` con Blobs dentro NO copia sus bytes: el navegador apunta a
 * ellos, y los del almacen viven en disco. Un EPUB con 400 MB de video se
 * descarga sin que esos 400 MB pasen por la memoria de la pagina, que es lo
 * que en un iPad mataria la pestaña.
 *
 * Si un medio falta o no mide lo que el motor puso en la cabecera, se lanza
 * un error: un zip con un tamaño equivocado es un EPUB roto que Apple
 * rechazaria, y mas vale no darlo.
 */
export function blobDeSegmentos(
  segmentos: readonly Segmento[],
  medio: (ruta: string) => Blob | undefined,
  tipo: string,
): Blob {
  const partes: BlobPart[] = segmentos.map((s) => {
    if (!esHueco(s)) return s as Uint8Array<ArrayBuffer>
    const b = medio(s.medio)
    if (!b) throw new Error(`${s.medio}: el archivo no está en este navegador.`)
    if (b.size !== s.tamano) throw new Error(`${s.medio}: mide ${b.size} bytes y el EPUB espera ${s.tamano}.`)
    return b
  })
  return new Blob(partes, { type: tipo })
}

/** El EPUB listo para descargar. */
export function blobDelLibro(libro: LibroGenerado, exportado: Exportado, repo: Pick<Repositorio, 'blobMedio'>): Blob {
  return blobDeSegmentos(libro.segmentos, blobsDeHuecos(exportado.rutasMedios, (id) => repo.blobMedio(id)), 'application/epub+zip')
}
