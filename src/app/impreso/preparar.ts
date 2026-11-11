/**
 * Del libro de la app a lo que lee el compositor del impreso.
 *
 * Por el camino de siempre: `exportar()` da el proyecto del motor (el mismo
 * que hace los dos EPUB y la copia .zip) y `contenidoDe` lo lee con las mismas
 * reglas que el EPUB. Asi el papel no puede decir otra cosa que la pantalla.
 *
 * Para componer no hacen falta los bytes de las imagenes, solo sus medidas: se
 * exporta con bytes vacios y la composicion no espera a leer el almacen. Los
 * pixeles (en gris) se preparan despues, solo para el PDF (ver grises.ts).
 *
 * Puro y sincrono: se prueba en Node.
 */
import { CONFIG_IMPRESO_POR_DEFECTO, ordenDeExtras, type ConfigImpreso } from '../../core/impreso/config'
import { claveImagen, contenidoDe, type Contenido } from '../../core/impreso/contenido'
import type { ImagenImpresa } from '../../core/impreso/paginar'
import { exportar } from '../exportar'
import { idsDeImagenes, type Imagen, type Proyecto } from '../modelo'

export interface Preparado {
  readonly contenido: Contenido
  /** La configuracion para el core: el orden de los extras, por el nombre de su archivo. */
  readonly config: ConfigImpreso
  /** Las medidas de cada imagen, por la clave con que la pide el compositor (`cap02-01`, `logo`). */
  readonly imagenes: Readonly<Record<string, ImagenImpresa>>
  /** Clave del compositor -> id de la imagen en el almacen. */
  readonly idDeClave: ReadonlyMap<string, string>
}

/** Las opciones del impreso de un libro: las suyas, o las de por defecto. */
export function configDe(p: Proyecto): ConfigImpreso {
  return p.impreso ?? CONFIG_IMPRESO_POR_DEFECTO
}

/** El orden de los extras en el impreso, por sus ids de la app (para la interfaz). */
export function extrasDelImpreso(p: Proyecto): ReturnType<typeof ordenDeExtras> {
  return ordenDeExtras(configDe(p), p.extras.map((x) => ({ id: x.id, donde: x.donde })))
}

export function prepararImpreso(p: Proyecto, imagenes: ReadonlyMap<string, Imagen>, anioActual: number): Preparado {
  const vacios = new Map([...idsDeImagenes(p)].map((id) => [id, new Uint8Array(0)]))
  const e = exportar(p, imagenes, vacios)
  const contenido = contenidoDe(e.proyecto, anioActual)
  const c = configDe(p)
  const extras = extrasDelImpreso(p).flatMap((x) => {
    const archivo = e.archivosExtras.get(x.id)
    return archivo ? [{ ...x, id: archivo }] : []
  })
  const medidas: Record<string, ImagenImpresa> = {}
  const idDeClave = new Map<string, string>()
  for (const [id, nombre] of e.nombres) {
    const img = imagenes.get(id)
    if (!img) continue
    const clave = claveImagen(nombre)
    medidas[clave] = { id: clave, ancho: img.ancho, alto: img.alto }
    idDeClave.set(clave, id)
  }
  return { contenido, config: { ...c, extras }, imagenes: medidas, idDeClave }
}
