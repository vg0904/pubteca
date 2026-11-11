/**
 * Registro de audios y videos. Es de Pubteca: el Python no los conoce.
 *
 * Funciona como `Imagenes`: lleva el catalogo de lo que hay en `medios/`,
 * registra lo que entra al libro deduplicando por ruta, y le da a cada archivo
 * su nombre y su id dentro del EPUB.
 *
 * El motor NO convierte nada. Acepta lo que Apple Books pide tal cual (Asset
 * Guide 5.3.1): video H.264 o HEVC en MPEG-4 (`.m4v`, o `.mp4`) y audio AAC en
 * `.m4a`. Convertir un `.mov` del iPhone o una nota de voz es trabajo de la
 * capa de app, que tiene WebCodecs; aqui solo se empaqueta.
 *
 * EL MEDIA-TYPE: Apple pone `audio/m4a` en su ejemplo, pero ese tipo no es un
 * tipo central de EPUB 3.3 y EPUBCheck 5.3.0 y 5.4.0 lo rechazan con RSC-032
 * (recurso ajeno sin alternativa). `audio/mp4` es el tipo central para AAC en
 * MPEG-4, y es el que se declara. Medido en la fase 0 (plan.md). El video esta
 * exento de alternativa, y `video/mp4` es su tipo registrado.
 *
 * El POSTER de un video es la imagen de `medios/` con el mismo nombre
 * (`cap03-v01.m4v` y `cap03-v01.jpg`). Apple lo exige, del mismo tamaño y
 * proporcion que el video, y no admite videos sin el.
 */
import type { ClaseMedio } from './parser'
import type { Imagenes, Registro } from './imagenes'
import type { Diagnosticos } from './mensajes'
import type { Archivo } from './proyecto'
import { nombreSeguro, ordenarNatural } from './texto'

export const EXT_VIDEO = ['.m4v', '.mp4']
export const EXT_AUDIO = ['.m4a']
const EXT_POSTER = ['.png', '.jpg', '.jpeg']

/** La extension con la que se ESCRIBE en el EPUB. `.m4v` es la que Apple prefiere. */
const EXT_SALIDA: Record<ClaseMedio, string> = { video: '.m4v', audio: '.m4a' }
const MEDIA_TYPE: Record<ClaseMedio, string> = { video: 'video/mp4', audio: 'audio/mp4' }

export interface RegistroMedio {
  readonly id: string
  readonly href: string
  readonly media: string
  readonly clase: ClaseMedio
  readonly origen: Archivo
  /** Solo los videos. null si falta: ya se dio el error. */
  readonly poster: Registro | null
}

export function claseDe(archivo: Archivo): ClaseMedio | null {
  const ext = archivo.suffix.toLowerCase()
  return EXT_VIDEO.includes(ext) ? 'video' : EXT_AUDIO.includes(ext) ? 'audio' : null
}

export class Medios {
  /** stem en minusculas -> archivo de audio o video. El primero gana. */
  readonly disponibles = new Map<string, Archivo>()
  /** stem en minusculas -> imagen de `medios/`: el poster del video del mismo nombre. */
  readonly posters = new Map<string, Archivo>()
  /** ruta -> registro. Es tambien el orden del manifiesto. */
  readonly usados = new Map<string, RegistroMedio>()
  readonly sinDescripcion: string[] = []

  readonly dg: Diagnosticos

  constructor(archivos: readonly Archivo[], dg: Diagnosticos) {
    this.dg = dg
    const porNombre = new Map(archivos.map((a) => [a.nombre, a]))
    for (const nombre of ordenarNatural([...porNombre.keys()])) {
      const p = porNombre.get(nombre) as Archivo
      const clave = p.stem.toLowerCase()
      if (claseDe(p)) {
        if (!this.disponibles.has(clave)) this.disponibles.set(clave, p)
      } else if (EXT_POSTER.includes(p.suffix.toLowerCase())) {
        if (!this.posters.has(clave)) this.posters.set(clave, p)
      } else if (!p.nombre.startsWith('.')) {
        this.dg.aviso(
          `medios/${p.nombre}: Apple Books solo acepta video en .m4v o .mp4 y audio en .m4a; lo ignoré.`,
        )
      }
    }
  }

  /** Cuantos videos y audios entraron al libro. */
  cuenta(): { videos: number; audios: number } {
    let videos = 0
    let audios = 0
    for (const u of this.usados.values()) {
      if (u.clase === 'video') videos += 1
      else audios += 1
    }
    return { videos, audios }
  }

  /**
   * Resuelve lo que pide una marca `[video: nombre | alt]` o `[audio: ...]`.
   * Acepta que el autor escriba la extension.
   */
  buscar(clase: ClaseMedio, nombre: string, donde: string, imagenes: Imagenes): RegistroMedio | null {
    const clave = nombre.trim().toLowerCase().replace(/\.(m4v|mp4|m4a)$/u, '')
    const p = this.disponibles.get(clave)
    if (p === undefined) {
      const ext = clase === 'video' ? '.m4v ni .mp4' : '.m4a'
      this.dg.error(`${donde}: la marca pide «${nombre}», pero no hay medios/${clave}${ext}.`)
      return null
    }
    const real = claseDe(p) as ClaseMedio
    if (real !== clase) {
      this.dg.error(
        `${donde}: la marca pide un ${clase === 'video' ? 'video' : 'audio'}, pero medios/${p.nombre} es un ${real}.`,
      )
      return null
    }

    const existente = this.usados.get(p.ruta)
    if (existente) return existente

    const base = nombreSeguro(p.stem)
    const ext = EXT_SALIDA[clase]
    const existentes = new Set([...this.usados.values()].map((u) => u.href))
    let archivoFinal = base + ext
    let n = 2
    while (existentes.has(`medios/${archivoFinal}`)) {
      archivoFinal = `${base}-${n}${ext}`
      n += 1
    }

    let poster: Registro | null = null
    if (clase === 'video') {
      const img = this.posters.get(clave)
      if (img === undefined) {
        this.dg.error(
          `${donde}: el video «${nombre}» no tiene póster (medios/${clave}.jpg o .png). Apple Books no acepta un video sin él.`,
        )
      } else {
        // El poster solo viaja a Apple Books: en Kindle no hay video.
        poster = imagenes.registrar(img, `medios/${img.nombre}`, { rol: 'poster', soloApple: true })
      }
    }

    const reg: RegistroMedio = {
      id: `medio-${nombreSeguro(archivoFinal.slice(0, archivoFinal.lastIndexOf('.')))}`,
      href: `medios/${archivoFinal}`,
      media: MEDIA_TYPE[clase],
      clase,
      origen: p,
      poster,
    }
    this.usados.set(p.ruta, reg)
    return reg
  }
}
