/**
 * El autoguardado, fuera de React para poder probarlo.
 *
 * Es la logica donde un fallo cuesta texto del autor, y vivia dentro de un
 * componente sin un solo test. Ahi se escondian dos fallos:
 *
 *   1. Dos guardados de la MISMA pestaña podian solaparse (el del temporizador
 *      todavia en vuelo y el de ocultar la pestaña, por ejemplo). Cada uno
 *      comprobaba el `modificado` que esta pestaña creia guardado ANTES de que
 *      el otro terminara, asi que el segundo encontraba el del primero y lo
 *      tomaba por un cambio de OTRA pestaña: la app dejaba de guardar y ofrecia
 *      «Recargar el libro guardado», que descartaba lo escrito desde entonces.
 *      Por eso los guardados van en COLA: uno no empieza hasta que acaba el
 *      anterior, y cada uno lee lo que dejo el de antes.
 *   2. Solo habia UN pendiente. Salir de un libro y crear o importar otro antes
 *      de que saltara el temporizador sustituia el pendiente del primero por el
 *      del segundo, y lo ultimo escrito en el primero no se guardaba nunca. Por
 *      eso hay un pendiente POR LIBRO.
 *
 * La comprobacion entre pestañas sigue en `guardarProyecto`: lo que cambia es
 * que esta pestaña ya no puede confundirse a si misma con otra.
 */
import type { Proyecto } from './modelo'

export type ResultadoGuardar = 'ok' | 'conflicto'

export interface OpcionesGuardador {
  /**
   * Escribe el proyecto si lo guardado sigue siendo `esperado` (null: el libro
   * es nuevo). Es `guardarProyecto` con el almacen ya puesto.
   */
  readonly guardar: (p: Proyecto, cuando: number, esperado: number | null) => Promise<ResultadoGuardar>
  readonly ahora: () => number
  /** Cuanto se espera tras el ultimo cambio para guardar. */
  readonly espera: number
  readonly alGuardar: (p: Proyecto) => void
  readonly alConflicto: (id: string) => void
  readonly alError: (e: unknown) => void
}

export class Guardador {
  private readonly o: OpcionesGuardador
  /** Lo ultimo sin guardar de cada libro. */
  private readonly pendientes = new Map<string, Proyecto>()
  /** El `modificado` que esta pestaña sabe que hay guardado de cada libro. */
  private readonly conocido = new Map<string, number | null>()
  /** Libros que otra pestaña cambio: aqui ya no se guardan. */
  private readonly enConflicto = new Set<string>()
  private cola: Promise<void> = Promise.resolve()
  private temporizador: ReturnType<typeof setTimeout> | null = null

  constructor(opciones: OpcionesGuardador) {
    this.o = opciones
  }

  /**
   * Lo que hay guardado de un libro recien abierto o creado (null si es nuevo).
   * Si estaba en conflicto, deja de estarlo: se acaba de leer lo de verdad.
   */
  conocer(id: string, modificado: number | null): void {
    this.conocido.set(id, modificado)
    this.enConflicto.delete(id)
    this.pendientes.delete(id)
  }

  /** Apunta un cambio. Se guarda cuando pasa `espera` sin otro cambio. */
  programar(p: Proyecto): void {
    if (this.enConflicto.has(p.id) || this.pendientes.get(p.id) === p) return
    this.pendientes.set(p.id, p)
    if (this.temporizador) clearTimeout(this.temporizador)
    this.temporizador = setTimeout(() => {
      this.temporizador = null
      void this.ya()
    }, this.o.espera)
  }

  /** Si queda algo por guardar. */
  get hayPendientes(): boolean {
    return this.pendientes.size > 0
  }

  /**
   * Guarda YA todo lo pendiente, detras de lo que ya se este guardando.
   * La promesa se cumple cuando ha terminado: se puede esperar antes de leer.
   */
  ya(): Promise<void> {
    if (this.temporizador) {
      clearTimeout(this.temporizador)
      this.temporizador = null
    }
    this.cola = this.cola.then(() => this.vaciar())
    return this.cola
  }

  private async vaciar(): Promise<void> {
    const tanda = [...this.pendientes.values()]
    this.pendientes.clear()
    for (const p of tanda) {
      if (this.enConflicto.has(p.id)) continue
      const cuando = this.o.ahora()
      try {
        const r = await this.o.guardar(p, cuando, this.conocido.get(p.id) ?? null)
        if (r === 'conflicto') {
          this.enConflicto.add(p.id)
          this.o.alConflicto(p.id)
          continue
        }
        this.conocido.set(p.id, cuando)
        this.o.alGuardar(p)
      } catch (e) {
        // Se queda pendiente (salvo que ya haya otro mas nuevo): el siguiente
        // guardado lo reintenta. Sin temporizador, para no repetir el error en
        // bucle; el siguiente cambio o el siguiente ocultar la pestaña bastan.
        if (!this.pendientes.has(p.id)) this.pendientes.set(p.id, p)
        this.o.alError(e)
      }
    }
  }
}
