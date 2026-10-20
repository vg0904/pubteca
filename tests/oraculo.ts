/**
 * Carga tests/casos-texto.json: el comportamiento REAL de generar_epub.py,
 * extraido por scripts/exportar-casos-texto.py.
 *
 * El port se prueba contra esto y no contra expectativas escritas a mano,
 * porque escribirlas a mano seria adivinar justo lo que hay que medir.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Par = [string, string]
export type ParBool = [string, boolean]

export interface CasoOrden {
  entrada: string[]
  salida: string[]
  claves: string[][]
}

export interface CasoTitulo {
  entrada: string
  casa: boolean
  grupo1?: string
  grupo2?: string | null
  num_final?: string
  titulo_final?: string
}

export interface CasoIlus {
  entrada: string
  casa: boolean
  nombre: string | null
  alt: string | null
}

export type Tupla = (string | string[])[]

export interface CasoCapitulo {
  nombre: string
  entrada: string
  lineas_de: string[]
  titulo: string | null
  antes: Tupla[]
  bloques: Tupla[]
  tramos: Tupla[]
}

export interface CasoConfig {
  nombre: string
  entrada: string | null
  salida: Record<string, string>
  avisos: string[]
}

export interface CasoUuid {
  titulo: string
  autor: string
  nombre: string
  uuid: string
  urn: string
}

export interface CasoXhtml {
  titulo: string
  cuerpo: string
  idioma: string
  clase_body: string
  salida: string
}

export interface CasoPaginaImagen {
  href: string
  alt: string
  clase: string
  salida: string
}

export interface CaraExportada {
  familia: string
  style: string
  weight: string
  href: string
  id: string
  media: string
}

export interface CasoFuentes {
  nombre: string
  archivos: string[]
  salida: CaraExportada[]
  avisos: string[]
}

export interface CasoCssLibro {
  nombre: string
  familias: string[]
  preferida: string
  salida: string
}

export interface Oraculo {
  _fuente: string
  _sha256_fuente: string
  _version_generador: string
  esc: Par[]
  esc_inline: Par[]
  sin_acentos: Par[]
  nombre_seguro: Par[]
  desescapar: Par[]
  en_linea: Par[]
  texto_plano: Par[]
  limpiar_titulo: Par[]
  si: ParBool[]
  orden_natural: CasoOrden[]
  RE_TITULO: CasoTitulo[]
  RE_ESCENA: ParBool[]
  RE_ILUS: CasoIlus[]
  capitulos: CasoCapitulo[]
  configs: CasoConfig[]
  uuid5: CasoUuid[]
  xhtml: CasoXhtml[]
  pagina_imagen: CasoPaginaImagen[]
  fuentes: CasoFuentes[]
  css_libro: CasoCssLibro[]
  CSS: string
  CONFIG_DEFAULT: Record<string, string>
}

export const oraculo = JSON.parse(
  readFileSync(join(import.meta.dirname, 'casos-texto.json'), 'utf8'),
) as Oraculo

/** Una etiqueta legible para el nombre del test, con los invisibles a la vista. */
export function etiqueta(s: string): string {
  if (s === '') return '(cadena vacia)'
  return JSON.stringify(s)
}
