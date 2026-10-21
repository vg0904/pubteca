/**
 * Generar los dos EPUB desde el navegador.
 *
 * Aqui se juntan las dos capas: lo asincrono (leer los Blob de las imagenes,
 * traer las fuentes) se hace ANTES, y el motor recibe todo en memoria y corre
 * sincrono, igual que en los golden tests. El camino es el mismo que el del
 * .zip y el de la vista previa: exportar() y nada mas.
 */
import { construir, type Construccion } from '../core/construir'
import { archivo, type Archivo } from '../core/proyecto'
import { exportar, type Exportado } from './exportar'
import type { Imagen, Proyecto } from './modelo'
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
  readonly construccion: Construccion
  readonly sinFuentes: boolean
}

export async function generarLibros(
  p: Proyecto,
  imagenes: ReadonlyMap<string, Imagen>,
  repo: Repositorio,
  ahora: Date,
): Promise<Generado> {
  const [bytes, fuentes] = await Promise.all([bytesDelProyecto(p, repo), cargarFuentes()])
  const exportado = exportar(p, imagenes, bytes, fuentes)
  // Se cede un fotograma para que la barra de progreso llegue a pintarse: el
  // motor es sincrono y bloquea mientras comprime.
  await new Promise((r) => setTimeout(r, 30))
  return { exportado, construccion: construir(exportado.proyecto, { ahora }), sinFuentes: fuentes.length === 0 }
}
