/**
 * Adaptador de Node: lee una carpeta de libro a memoria.
 *
 * Vive fuera de src/core a proposito. El core no toca el disco: recibe los
 * bytes ya cargados. Este modulo es el equivalente para Node de lo que en el
 * navegador hara la capa de app con File e IndexedDB.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { archivo, type Archivo, type Proyecto } from '../src/core/proyecto.ts'

function leerCarpeta(raiz: string, nombre: string): Archivo[] {
  let entradas: string[]
  try {
    entradas = readdirSync(join(raiz, nombre))
  } catch {
    return []
  }
  const salida: Archivo[] = []
  for (const e of entradas.sort()) {
    const ruta = join(raiz, nombre, e)
    if (e.startsWith('.') || !statSync(ruta).isFile()) continue
    salida.push(archivo(`${nombre}/${e}`, new Uint8Array(readFileSync(ruta))))
  }
  return salida
}

export function leerProyecto(raiz: string): Proyecto {
  let libroTxt: string | undefined
  try {
    libroTxt = readFileSync(join(raiz, 'libro.txt'), 'utf8')
  } catch {
    libroTxt = undefined
  }
  return {
    libroTxt,
    capitulos: leerCarpeta(raiz, 'capitulos'),
    ilustraciones: leerCarpeta(raiz, 'ilustraciones'),
    portada: leerCarpeta(raiz, 'portada'),
    extras: leerCarpeta(raiz, 'extras'),
    fuentes: leerCarpeta(raiz, 'fuentes'),
  }
}
