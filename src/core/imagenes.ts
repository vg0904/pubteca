/**
 * Registro de imagenes. Port de generar_epub.py 226-280 (clase Imagenes).
 *
 * Lleva el catalogo de lo que hay en ilustraciones/, registra cada imagen que
 * entra al libro deduplicando por ruta, desambigua nombres repetidos y acumula
 * las que se quedaron sin descripcion.
 */
import { EXT_IMAGEN, inspeccionarImagen, mediaType, type InfoImagen } from './imagen-inspeccion'
import { revisarImagen, type RolImagen } from './imagen-validacion'
import type { Diagnosticos } from './mensajes'
import type { Archivo } from './proyecto'
import { nombreSeguro, ordenarNatural } from './texto'

export interface Registro {
  readonly id: string
  readonly href: string
  readonly media: string
  readonly info: InfoImagen
  readonly origen: Archivo
  readonly etiqueta: string
  /** true para los logos: no entran en la version de Kindle. */
  readonly soloApple: boolean
}

export class Imagenes {
  /** stem en minusculas -> archivo. El PRIMERO gana si hay dos con el mismo stem. */
  readonly disponibles = new Map<string, Archivo>()
  /** ruta canonica -> registro. Es tambien el orden del manifiesto. */
  readonly usadas = new Map<string, Registro>()
  readonly sinDescripcion: string[] = []

  /** Campo explicito, no propiedad de parametro: erasableSyntaxOnly las prohibe. */
  readonly dg: Diagnosticos

  constructor(ilustraciones: readonly Archivo[], dg: Diagnosticos) {
    this.dg = dg
    // Orden natural sobre el NOMBRE COMPLETO, con extension. Consecuencia: con
    // cap01-01.jpg y cap01-01.png presentes gana el .jpg, porque en el tramo
    // de texto final ".jpg" va antes que ".png".
    const porNombre = new Map(ilustraciones.map((a) => [a.nombre, a]))
    for (const nombre of ordenarNatural([...porNombre.keys()])) {
      const p = porNombre.get(nombre) as Archivo
      if (EXT_IMAGEN.includes(p.suffix.toLowerCase() as (typeof EXT_IMAGEN)[number])) {
        const clave = p.stem.toLowerCase()
        if (!this.disponibles.has(clave)) this.disponibles.set(clave, p)
      } else if (!p.nombre.startsWith('.')) {
        this.dg.aviso(`ilustraciones/${p.nombre}: no es PNG ni JPG, la ignoré.`)
      }
    }
  }

  /**
   * Registra una imagen para que entre al libro.
   *
   * La clave de deduplicacion es la ruta canonica del proyecto, que sustituye
   * al `Path.resolve()` del Python: dos `File` del mismo archivo arrastrado dos
   * veces son objetos distintos, y comparar por identidad lo duplicaria.
   *
   * Si ya estaba registrada devuelve el registro EXISTENTE sin revalidar ni
   * actualizar las banderas, igual que el Python. Eso tiene una consecuencia
   * documentada: ver `construir.ts`, donde se comprueba que ninguna pagina
   * referencie un recurso ausente del manifiesto de su tienda.
   */
  registrar(
    origen: Archivo,
    etiqueta: string,
    opciones: { rol?: RolImagen; soloApple?: boolean } = {},
  ): Registro | null {
    const existente = this.usadas.get(origen.ruta)
    if (existente) return existente

    const info = inspeccionarImagen(origen.bytes)
    if (info.tipo === null) {
      this.dg.error(
        `${etiqueta}: no es un PNG ni un JPG de verdad (¿HEIC, WebP o un archivo renombrado?). No la incluí.`,
      )
      return null
    }

    revisarImagen(etiqueta, info, opciones.rol ?? 'ilustracion', this.dg)

    const ext = info.tipo === 'png' ? '.png' : '.jpg'
    const base = nombreSeguro(origen.stem)
    const existentes = new Set([...this.usadas.values()].map((u) => u.href))
    let nombre = base + ext
    let n = 2
    while (existentes.has(`imagenes/${nombre}`)) {
      nombre = `${base}-${n}${ext}`
      n += 1
    }

    const stemFinal = nombre.slice(0, nombre.lastIndexOf('.'))
    const reg: Registro = {
      id: `img-${nombreSeguro(stemFinal)}`,
      href: `imagenes/${nombre}`,
      media: mediaType(info.tipo),
      info,
      origen,
      etiqueta,
      soloApple: opciones.soloApple ?? false,
    }
    this.usadas.set(origen.ruta, reg)
    return reg
  }

  /**
   * Resuelve lo que pide una marca `[ilustracion: nombre | alt]`.
   * Acepta que el autor escriba la extension: se quita antes de buscar.
   */
  buscar(nombre: string, donde: string): Registro | null {
    const clave = nombre.trim().toLowerCase().replace(/\.(png|jpe?g)$/u, '')
    const p = this.disponibles.get(clave)
    if (p === undefined) {
      this.dg.error(
        `${donde}: la marca pide «${nombre}», pero no hay ilustraciones/${clave}.png ni .jpg.`,
      )
      return null
    }
    return this.registrar(p, `ilustraciones/${p.nombre}`)
  }
}
