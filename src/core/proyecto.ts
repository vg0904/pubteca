/**
 * Sistema de archivos virtual. Reemplaza a `pathlib`.
 *
 * Es el unico modulo del core que no existe en el Python, y su razon de ser es
 * aislar al resto de `File`, `Blob` e IndexedDB. Todos los bytes se cargan
 * ANTES de entrar al core: asi el core puede ser 100% sincrono, que es lo que
 * hace deterministas los golden tests.
 */

/** Un archivo del proyecto, con semantica de nombres igual a la de pathlib. */
export interface Archivo {
  /**
   * Clave canonica dentro del proyecto, p. ej. `ilustraciones/cap01-01.png`.
   * Sustituye a `Path.resolve()` como clave de deduplicacion de imagenes: dos
   * `File` del mismo archivo arrastrado dos veces son objetos distintos, asi
   * que comparar por identidad duplicaria la imagen.
   */
  readonly ruta: string
  /** Nombre con extension: `cap01-01.png`. */
  readonly nombre: string
  /** Nombre sin la ultima extension: `cap01-01`. */
  readonly stem: string
  /** Ultima extension CON el punto y en la caja original: `.png`, `.PNG`. */
  readonly suffix: string
  readonly bytes: Uint8Array
}

export interface Proyecto {
  /** Contenido de libro.txt, o undefined si no existe. */
  readonly libroTxt: string | undefined
  readonly capitulos: readonly Archivo[]
  readonly ilustraciones: readonly Archivo[]
  readonly portada: readonly Archivo[]
  readonly extras: readonly Archivo[]
  readonly fuentes: readonly Archivo[]
  /**
   * Audios, videos y los posters de los videos. Opcional: es de Pubteca (el
   * Python no tiene esta carpeta), y un proyecto sin ella se construye
   * exactamente igual que antes.
   *
   * Un audio o un video puede llegar como `Ficha`, sin sus bytes: en el
   * navegador un video de 400 MB no se carga en memoria (en un iPad mataria
   * la pestaña). El motor solo necesita saber cuanto pesa y su CRC-32 para
   * escribir las cabeceras del zip, y deja un hueco donde iran sus bytes (ver
   * `zip.ts`). Los posters siempre llegan con sus bytes: son imagenes.
   */
  readonly medios?: readonly (Archivo | Ficha)[]
}

/**
 * Un archivo que el motor NO carga: solo sabe como se llama, cuanto pesa y su
 * CRC-32. Lo calcula quien tiene los bytes, por trozos, con `crc32`.
 */
export interface Ficha {
  readonly ruta: string
  readonly nombre: string
  readonly stem: string
  readonly suffix: string
  readonly tamano: number
  readonly crc32: number
}

export function ficha(ruta: string, tamano: number, crc32: number): Ficha {
  const { nombre, stem, suffix } = archivo(ruta, new Uint8Array(0))
  return { ruta, nombre, stem, suffix, tamano, crc32 }
}

export function esFicha(a: Archivo | Ficha): a is Ficha {
  return !('bytes' in a)
}

/**
 * Construye un Archivo partiendo el nombre como lo hace pathlib:
 * el ultimo punto separa stem de suffix, pero un nombre que EMPIEZA por punto
 * es todo stem y no tiene suffix (`.gitkeep` -> stem `.gitkeep`, suffix ``).
 * Y `a.b.c` -> stem `a.b`, suffix `.c`.
 */
export function archivo(ruta: string, bytes: Uint8Array): Archivo {
  const nombre = ruta.slice(ruta.lastIndexOf('/') + 1)
  const punto = nombre.lastIndexOf('.')
  const tienePunto = punto > 0 // > 0, no >= 0: los ocultos no cuentan
  return {
    ruta,
    nombre,
    stem: tienePunto ? nombre.slice(0, punto) : nombre,
    suffix: tienePunto ? nombre.slice(punto) : '',
    bytes,
  }
}

/** Proyecto vacio, util como base en los tests y en la app. */
export const PROYECTO_VACIO: Proyecto = {
  libroTxt: undefined,
  capitulos: [],
  ilustraciones: [],
  portada: [],
  extras: [],
  fuentes: [],
}

/**
 * `buscar_en(carpeta, base)`: el primer archivo cuyo stem (en minusculas)
 * coincide y cuya extension esta permitida, recorriendo en orden alfabetico
 * por nombre, que es lo que hace `sorted(carpeta.iterdir())`.
 */
export function buscarEn(
  archivos: readonly Archivo[],
  base: string,
  extensiones: readonly string[],
): Archivo | undefined {
  return [...archivos]
    .sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0))
    .find((p) => p.stem.toLowerCase() === base && extensiones.includes(p.suffix.toLowerCase()))
}
