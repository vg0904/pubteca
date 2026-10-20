/**
 * Colector de diagnosticos. Port de ERRORES/AVISOS/NOTAS (generar_epub.py 42-54).
 *
 * El Python los tiene como listas a nivel de modulo. Aqui NO: en una webapp
 * eso filtraria avisos de una generacion a la siguiente. Se pasa un
 * Diagnosticos por constructor y cada generacion crea el suyo.
 *
 * El orden de insercion importa: el reporte y los golden tests comparan listas
 * ordenadas.
 */
export class Diagnosticos {
  readonly errores: string[] = []
  readonly avisos: string[] = []
  readonly notas: string[] = []

  /** Algo que hay que arreglar. El EPUB se genera igual (el Python tambien). */
  error(mensaje: string): void {
    this.errores.push(mensaje)
  }

  /** Conviene revisar: el libro sale, pero peor de lo que podria. */
  aviso(mensaje: string): void {
    this.avisos.push(mensaje)
  }

  /** Detalle informativo. */
  nota(mensaje: string): void {
    this.notas.push(mensaje)
  }

  get hayErrores(): boolean {
    return this.errores.length > 0
  }

  get total(): number {
    return this.errores.length + this.avisos.length + this.notas.length
  }
}

/** Marcas del reporte en texto, tal como las imprime el Python (1075). */
export const MARCA = { error: '✗', aviso: '!', nota: '·' } as const
