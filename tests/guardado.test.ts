import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirAlmacen, guardarProyecto, leerProyecto } from '../src/app/almacen'
import { proyectoVacio } from '../src/app/estado'
import { Guardador, type OpcionesGuardador, type ResultadoGuardar } from '../src/app/guardado'
import type { Proyecto } from '../src/app/modelo'

/**
 * Un almacen en memoria con la MISMA regla que `guardarProyecto`: solo escribe
 * si lo guardado es lo que la pestaña esperaba. `lento` hace que cada
 * escritura tarde, que es lo que abre la ventana para que dos se solapen.
 */
function almacenFalso(lento = 0) {
  const guardado = new Map<string, { p: Proyecto; modificado: number }>()
  const escrituras: string[] = []
  const guardar = async (p: Proyecto, cuando: number, esperado: number | null): Promise<ResultadoGuardar> => {
    const actual = guardado.get(p.id)?.modificado ?? null
    if (lento) await new Promise((r) => setTimeout(r, lento))
    // Se vuelve a leer DESPUES de esperar, como haria la transaccion real.
    if ((guardado.get(p.id)?.modificado ?? actual) !== esperado) return 'conflicto'
    guardado.set(p.id, { p, modificado: cuando })
    escrituras.push(`${p.id}:${p.datos.titulo}`)
    return 'ok'
  }
  return { guardado, escrituras, guardar }
}

function guardador(guardar: OpcionesGuardador['guardar']) {
  let reloj = 1000
  const eventos: string[] = []
  const g = new Guardador({
    guardar,
    ahora: () => ++reloj,
    espera: 700,
    alGuardar: (p) => eventos.push(`guardado ${p.id}:${p.datos.titulo}`),
    alConflicto: (id) => eventos.push(`conflicto ${id}`),
    alError: (e) => eventos.push(`error ${(e as Error).message}`),
  })
  return { g, eventos }
}

const libro = (id: string, titulo: string): Proyecto => {
  const p = proyectoVacio(id, `${id}-c`, `${id}-b`)
  return { ...p, datos: { ...p.datos, titulo } }
}

describe('Guardador', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('EL FALLO: dos guardados seguidos de la misma pestaña no se toman por otra pestaña', async () => {
    // El primero aun esta escribiendo cuando llega el segundo (el temporizador
    // y el ocultar la pestaña, por ejemplo). Antes el segundo comprobaba un
    // `modificado` viejo y daba conflicto consigo mismo.
    const a = almacenFalso(50)
    const { g, eventos } = guardador(a.guardar)
    g.conocer('x', null)
    g.programar(libro('x', 'uno'))
    const primero = g.ya()
    // El primero ya esta escribiendo (tarda 50 ms) cuando llega el segundo.
    await vi.advanceTimersByTimeAsync(10)
    g.programar(libro('x', 'dos'))
    const segundo = g.ya()
    await vi.runAllTimersAsync()
    await Promise.all([primero, segundo])
    expect(eventos).toEqual(['guardado x:uno', 'guardado x:dos'])
    expect(a.guardado.get('x')?.p.datos.titulo).toBe('dos')
  })

  it('EL FALLO, con el almacen de verdad', async () => {
    // Sin relojes falsos: fake-indexeddb los necesita de verdad.
    vi.useRealTimers()
    const db = await abrirAlmacen()
    const { g, eventos } = guardador((p, cuando, esperado) => guardarProyecto(db, p, cuando, esperado))
    g.conocer('real', null)
    g.programar(libro('real', 'uno'))
    const primero = g.ya()
    // Unas vueltas de microtareas: la primera transaccion ya esta abierta y
    // esperando a IndexedDB cuando llega el segundo cambio.
    for (let i = 0; i < 5; i++) await Promise.resolve()
    g.programar(libro('real', 'dos'))
    await Promise.all([primero, g.ya()])
    expect(eventos).toEqual(['guardado real:uno', 'guardado real:dos'])
    expect((await leerProyecto(db, 'real'))?.datos.titulo).toBe('dos')
  })

  it('cambiar de libro antes de que salte el temporizador no pierde el primero', async () => {
    // Antes habia UN pendiente: el del libro nuevo sustituia al del viejo.
    const a = almacenFalso()
    const { g } = guardador(a.guardar)
    g.conocer('viejo', null)
    g.conocer('nuevo', null)
    g.programar(libro('viejo', 'lo ultimo que escribi'))
    g.programar(libro('nuevo', 'recien creado'))
    await vi.advanceTimersByTimeAsync(700)
    await g.ya()
    expect(a.escrituras.sort()).toEqual(['nuevo:recien creado', 'viejo:lo ultimo que escribi'])
  })

  it('espera a que el autor deje de escribir, y guarda solo lo ultimo', async () => {
    const a = almacenFalso()
    const { g } = guardador(a.guardar)
    g.conocer('x', null)
    g.programar(libro('x', 'a'))
    await vi.advanceTimersByTimeAsync(500)
    g.programar(libro('x', 'ab'))
    await vi.advanceTimersByTimeAsync(500)
    expect(a.escrituras).toEqual([])
    await vi.advanceTimersByTimeAsync(200)
    expect(a.escrituras).toEqual(['x:ab'])
  })

  it('un conflicto de verdad (otra pestaña) para el guardado de ESE libro', async () => {
    const a = almacenFalso()
    const { g, eventos } = guardador(a.guardar)
    // Esta pestaña cree que no hay nada guardado, pero otra ya guardo.
    a.guardado.set('x', { p: libro('x', 'de la otra pestaña'), modificado: 1 })
    g.conocer('x', null)
    g.conocer('y', null)
    g.programar(libro('x', 'mio'))
    g.programar(libro('y', 'otro libro'))
    await g.ya()
    expect(eventos).toEqual(['conflicto x', 'guardado y:otro libro'])
    expect(a.guardado.get('x')?.p.datos.titulo).toBe('de la otra pestaña')
    // Ya no se intenta: escribir encima borraria lo de la otra pestaña.
    g.programar(libro('x', 'mio otra vez'))
    await g.ya()
    expect(eventos).toHaveLength(2)
    // Hasta que se vuelve a leer lo guardado.
    g.conocer('x', 1)
    g.programar(libro('x', 'tras recargar'))
    await g.ya()
    expect(a.guardado.get('x')?.p.datos.titulo).toBe('tras recargar')
  })

  it('un error deja el cambio pendiente para el siguiente intento', async () => {
    let falla = true
    const a = almacenFalso()
    const { g, eventos } = guardador(async (p, c, e) => {
      if (falla) throw new Error('sin espacio')
      return a.guardar(p, c, e)
    })
    g.conocer('x', null)
    g.programar(libro('x', 'importante'))
    await g.ya()
    expect(eventos).toEqual(['error sin espacio'])
    expect(g.hayPendientes).toBe(true)
    falla = false
    await g.ya()
    expect(a.escrituras).toEqual(['x:importante'])
  })

  it('ya() se puede esperar: al cumplirse, todo esta escrito', async () => {
    const a = almacenFalso(30)
    const { g } = guardador(a.guardar)
    g.conocer('x', null)
    g.programar(libro('x', 'antes de leer'))
    const fin = g.ya()
    await vi.runAllTimersAsync()
    await fin
    expect(a.escrituras).toEqual(['x:antes de leer'])
    expect(g.hayPendientes).toBe(false)
  })
})
