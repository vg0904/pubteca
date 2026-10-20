/**
 * Datos del libro. Port de generar_epub.py 79-115 y 626-628 (libro.txt).
 */
import type { Diagnosticos } from './mensajes'
import { sinAcentos } from './texto'

/** `CONFIG_DEFAULT`. El orden de las claves es el del Python. */
export const CONFIG_DEFAULT = {
  titulo: 'Sin título',
  subtitulo: '',
  autor: '',
  sello: '',
  idioma: 'es',
  descripcion: '',
  isbn: '',
  fecha_publicacion: '',
  derechos: '© {año} {autor}. Todos los derechos reservados.',
  incluir_contraportada: 'si',
  separador_de_escena: '* * *',
  fuente: 'Baskerville',
} as const

/** Claves conocidas, mas las que el autor invente: el Python acepta cualquiera. */
export type Config = Record<string, string> & { [K in keyof typeof CONFIG_DEFAULT]: string }

/**
 * `str.splitlines()` de Python, que corta por mas limites que un split por salto de linea y
 * NO deja un elemento vacio final cuando el texto acaba en salto.
 */
const CODIGOS_SALTO = new Set([
  0x0a, // \n
  0x0b, // tabulacion vertical
  0x0c, // form feed
  0x0d, // \r
  0x1c, 0x1d, 0x1e, // separadores de archivo/grupo/registro
  0x85, // NEL
  0x2028, // LINE SEPARATOR
  0x2029, // PARAGRAPH SEPARATOR
])

function partirLineas(s: string): string[] {
  if (s === '') return []
  const lineas: string[] = []
  let actual = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (CODIGOS_SALTO.has(c)) {
      // \r\n cuenta como un solo limite, igual que en Python.
      if (c === 0x0d && s.charCodeAt(i + 1) === 0x0a) i++
      lineas.push(actual)
      actual = ''
    } else {
      actual += s[i]
    }
  }
  if (actual !== '') lineas.push(actual)
  return lineas
}

/**
 * Lee `libro.txt` en formato `clave: valor`.
 *
 * `contenido` es undefined cuando no existe el archivo. El Python lee con
 * `utf-8-sig`: el BOM se quita en texto.ts/lineasDe y aqui a mano.
 *
 * TRAMPA: `s.split(":", 1)` de Python parte UNA vez y devuelve dos trozos, asi
 * que un valor con dos puntos («descripcion: a: b: c») se conserva entero.
 */
export function leerConfig(contenido: string | undefined, dg: Diagnosticos): Config {
  const cfg: Record<string, string> = { ...CONFIG_DEFAULT }
  if (contenido === undefined) {
    dg.aviso('No encontré libro.txt; usé datos genéricos (título «Sin título», sin autor).')
    return cfg as Config
  }
  const lineas = partirLineas(contenido.replace(/^﻿/u, ''))
  for (let i = 0; i < lineas.length; i++) {
    const s = (lineas[i] as string).trim()
    if (!s || s.startsWith('#')) continue
    const corte = s.indexOf(':')
    if (corte === -1) {
      dg.aviso(`libro.txt, línea ${i + 1}: no tiene «clave: valor», la ignoré → ${s.slice(0, 50)}`)
      continue
    }
    const clave = sinAcentos(s.slice(0, corte).trim().toLowerCase()).replace(/\s+/gu, '_')
    cfg[clave] = s.slice(corte + 1).trim()
  }
  return cfg as Config
}

/**
 * `si()`: interpreta un valor de si/no.
 * El orden importa: primero quita acentos, luego recorta, luego baja a
 * minusculas, asi «SÍ» tambien cuenta.
 */
export function si(valor: string): boolean {
  const v = sinAcentos(String(valor)).trim().toLowerCase()
  return v === 'si' || v === 's' || v === 'yes' || v === 'true' || v === '1'
}

/**
 * `anio()`: los primeros cuatro digitos de fecha_publicacion, o el ano actual.
 *
 * Devuelve la cadena tal cual la encontro, igual que el Python (que usa
 * `m.group(0)`, no `int()`). El ano actual se INYECTA: el core no lee el reloj,
 * o los golden tests dejan de ser reproducibles.
 */
export function anio(cfg: Config, anioActual: number): string {
  const m = /\p{Nd}{4}/u.exec(cfg.fecha_publicacion ?? '')
  return m ? m[0] : String(anioActual)
}
