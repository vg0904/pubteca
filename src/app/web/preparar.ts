/**
 * El libro web en la app, sin navegador: que se puede publicar, que se
 * publica, y como se le dice al core.
 *
 * Como en el impreso, lo que el autor elige se guarda por los ids de la app
 * (un capitulo no cambia de id al moverlo) y llega al core por el nombre de su
 * archivo, que es lo unico que el core conoce.
 */
import { CONFIG_WEB_POR_DEFECTO, urlSegura, type ConfigWeb, type EnlaceWeb } from '../../core/web/config'
import type { Exportado } from '../exportar'
import type { Extra, Proyecto } from '../modelo'
import { nombreDeCapitulo, nombreDeExtra } from '../revision'

/** Las opciones que el libro tenga guardadas, o las de fabrica. */
export function configWeb(p: Proyecto): ConfigWeb {
  return p.web ?? CONFIG_WEB_POR_DEFECTO
}

export interface ParteElegible {
  readonly id: string
  readonly clase: 'capitulo' | 'extra'
  readonly nombre: string
  readonly publicada: boolean
}

/** Un extra va al principio del libro si lo dice, o si es una dedicatoria o un epigrafe. */
const alPrincipio = (x: Extra): boolean => x.donde === 'inicio' || x.tipo !== 'conTitulo'

/**
 * Lo que el autor puede publicar o no, en el orden en que se lee: las paginas
 * extra del principio, los capitulos y las del final. La portada, las laminas
 * y los derechos no se eligen: van siempre.
 */
export function partesElegibles(p: Proyecto): ParteElegible[] {
  const fuera = new Set(configWeb(p).omitidos)
  const extra = (x: Extra): ParteElegible => ({ id: x.id, clase: 'extra', nombre: nombreDeExtra(x), publicada: !fuera.has(x.id) })
  return [
    ...p.extras.filter(alPrincipio).map(extra),
    ...p.capitulos.map((c, i): ParteElegible => ({ id: c.id, clase: 'capitulo', nombre: nombreDeCapitulo(c, i), publicada: !fuera.has(c.id) })),
    ...p.extras.filter((x) => !alPrincipio(x)).map(extra),
  ]
}

/** Cuantos capitulos se publican y cuantos hay. Con menos de los que hay, es una muestra. */
export function capitulosPublicados(p: Proyecto): { readonly publicados: number; readonly total: number } {
  const fuera = new Set(configWeb(p).omitidos)
  return { publicados: p.capitulos.filter((c) => !fuera.has(c.id)).length, total: p.capitulos.length }
}

/**
 * Las opciones tal como las entiende el core: lo omitido, por la ruta de su
 * archivo en el proyecto del motor. Un id que ya no es de nada (el capitulo se
 * borro) no llega.
 */
export function configParaElCore(p: Proyecto, e: Pick<Exportado, 'archivosCapitulos' | 'archivosExtras'>): ConfigWeb {
  const c = configWeb(p)
  const omitidos = c.omitidos.flatMap((id) => {
    const capitulo = e.archivosCapitulos.get(id)
    if (capitulo) return [`capitulos/${capitulo}`]
    const extra = e.archivosExtras.get(id)
    return extra ? [`extras/${extra}`] : []
  })
  return { ...c, omitidos }
}

/** Que le pasa a un enlace: sin direccion todavia, listo para publicarse, o no es una direccion web. */
export function estadoDeEnlace(e: EnlaceWeb): 'vacio' | 'bien' | 'mal' {
  if (!e.url.trim()) return 'vacio'
  return urlSegura(e.url) ? 'bien' : 'mal'
}
