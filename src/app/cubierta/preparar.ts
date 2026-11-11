/**
 * Del libro de la app a lo que lee la cubierta del core. Puro: se prueba en Node.
 *
 * Lo que la cubierta necesita del interior (el corte, el papel, el destino, el
 * ISBN del impreso) sale de las opciones del impreso; el numero de paginas,
 * del interior YA COMPUESTO: asi, al quitar un capitulo, el lomo cambia solo.
 */
import { CONFIG_CUBIERTA_POR_DEFECTO, type ConfigCubierta } from '../../core/impreso/cubierta-config'
import type { DatosCubierta, ImagenDeCubierta, Luminancias, RolCubierta } from '../../core/impreso/cubierta'
import { medidasDeCorte } from '../../core/impreso/plan'
import type { Imagen, Proyecto } from '../modelo'
import { configDe } from '../impreso/preparar'

export const ROLES_CUBIERTA: readonly RolCubierta[] = ['portada', 'contraportada', 'sello', 'selloBlanco', 'isotipo', 'isotipoBlanco']

export function configCubiertaDe(p: Proyecto): ConfigCubierta {
  return p.cubierta ?? CONFIG_CUBIERTA_POR_DEFECTO
}

/** Lo que la app ya midio de cada dibujo: su luminancia en rejilla y el color de su borde izquierdo. */
export interface Medicion {
  readonly luz: Luminancias
  readonly borde: string
}

export function datosDeCubierta(
  p: Proyecto,
  imagenes: ReadonlyMap<string, Imagen>,
  paginas: number,
  mediciones: Readonly<Partial<Record<'portada' | 'contraportada', Medicion>>> = {},
): DatosCubierta {
  const c = configDe(p)
  const imgs: Partial<Record<RolCubierta, ImagenDeCubierta>> = {}
  for (const rol of ROLES_CUBIERTA) {
    const id = p.portada[rol]
    const img = id ? imagenes.get(id) : undefined
    if (!img) continue
    const luz = rol === 'portada' || rol === 'contraportada' ? mediciones[rol]?.luz : undefined
    imgs[rol] = { ancho: img.ancho, alto: img.alto, ...(luz ? { luz } : {}) }
  }
  const borde = mediciones.portada?.borde
  return {
    titulo: p.datos.titulo,
    autor: p.datos.autor,
    sello: p.datos.sello,
    descripcion: p.datos.descripcion,
    idioma: p.datos.idioma,
    isbn: c.isbn,
    destino: c.destino,
    papel: c.papel,
    corte: medidasDeCorte(c),
    paginas,
    imagenes: imgs,
    ...(borde ? { bordePortada: borde } : {}),
  }
}
