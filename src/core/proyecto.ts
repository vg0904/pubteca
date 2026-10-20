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
