import { afterEach, describe, expect, it, vi } from 'vitest'
import { construir } from '../src/core/construir'
import { correrMotor, type PedidoMotor } from '../src/app/motor'
import { leerProyecto } from '../scripts/leer-proyecto'

/**
 * El motor corre en su propio hilo. Lo que se prueba aqui es la FRONTERA: que
 * todo lo que la cruza se puede copiar entre hilos (structured clone no lleva
 * clases ni funciones), que el resultado es el mismo que el del motor en el
 * hilo de la pagina, y que si el hilo falla se corre aqui sin perder nada.
 */

const LIBRO = leerProyecto(`${import.meta.dirname}/fixtures/libro-prueba`)
const AHORA = Date.parse('2026-01-01T12:00:00Z')
const pedido: PedidoMotor = { proyecto: LIBRO, ahora: AHORA }

/**
 * Un Worker de mentira con la misma frontera que el de verdad: lo que entra y
 * lo que sale pasa por structuredClone. `fallar` simula un navegador que no
 * puede cargar el modulo del hilo.
 */
function workerFalso(fallar = false) {
  const creados: { mensajes: number }[] = []
  class Falso extends EventTarget {
    readonly registro = { mensajes: 0 }
    constructor() {
      super()
      creados.push(this.registro)
    }
    postMessage(m: PedidoMotor): void {
      this.registro.mensajes += 1
      setTimeout(() => {
        if (fallar) {
          this.dispatchEvent(Object.assign(new Event('error', { cancelable: true }), { message: 'no carga' }))
          return
        }
        const pedidoEnElHilo = structuredClone(m)
        const respuesta = structuredClone({ ok: true, respuesta: correrMotor(pedidoEnElHilo) })
        this.dispatchEvent(new MessageEvent('message', { data: respuesta }))
      }, 0)
    }
    terminate(): void {}
  }
  return { Falso, creados }
}

async function generarCon(Worker: unknown) {
  vi.resetModules()
  vi.stubGlobal('Worker', Worker)
  const { enSuHilo } = await import('../src/app/generar')
  return enSuHilo
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('el motor en su hilo', () => {
  it('lo que devuelve se puede mandar entre hilos', () => {
    // Si devolviera la Construccion del motor (con su Libro, una clase),
    // postMessage fallaria en el navegador.
    expect(() => structuredClone(correrMotor(pedido))).not.toThrow()
  })

  it('da los MISMOS EPUB que el motor en el hilo de la pagina', () => {
    const directo = construir(LIBRO, { ahora: new Date(AHORA) })
    const r = correrMotor(pedido)
    expect(r.resultados.map((x) => x.nombreArchivo)).toEqual(directo.resultados.map((x) => x.nombreArchivo))
    for (const [i, x] of r.resultados.entries()) expect(x.bytes).toEqual(directo.resultados[i]?.bytes)
    expect(r.uid).toBe(directo.uid)
    expect(r.diagnosticos.avisos).toEqual(directo.diagnosticos.avisos)
    // El reporte se escribe dentro del hilo, donde esta el Libro que lo necesita.
    expect(r.reporte).toContain('El faro de Ibar')
  })

  it('a traves de un hilo: el pedido va y la respuesta vuelve, copiados', async () => {
    const { Falso, creados } = workerFalso()
    const enSuHilo = await generarCon(Falso)
    const r = await enSuHilo(pedido)
    expect(creados).toHaveLength(1)
    expect(r.resultados.map((x) => x.tienda)).toEqual(['Kindle', 'AppleBooks'])
    expect(r.resultados[0]?.bytes).toEqual(correrMotor(pedido).resultados[0]?.bytes)
  })

  it('el hilo se abre UNA vez y se reutiliza', async () => {
    const { Falso, creados } = workerFalso()
    const enSuHilo = await generarCon(Falso)
    await enSuHilo(pedido)
    await enSuHilo(pedido)
    expect(creados).toHaveLength(1)
    expect(creados[0]?.mensajes).toBe(2)
  })

  it('si el hilo no se puede usar, se corre aqui con los mismos bytes, y no se vuelve a intentar', async () => {
    // Por eso el pedido se COPIA y no se transfiere: transferido, los bytes ya
    // no estarian aqui para repetirlo.
    const { Falso, creados } = workerFalso(true)
    const enSuHilo = await generarCon(Falso)
    const r = await enSuHilo(pedido)
    expect(r.resultados[1]?.bytes).toEqual(correrMotor(pedido).resultados[1]?.bytes)
    await enSuHilo(pedido)
    expect(creados).toHaveLength(1)
  })

  it('sin Worker en el navegador, corre aqui', async () => {
    const enSuHilo = await generarCon(undefined)
    const r = await enSuHilo(pedido)
    expect(r.bloqueado).toBeNull()
    expect(r.resultados).toHaveLength(2)
  })

  it('un error del motor dentro del hilo llega como error, no como cuelgue', async () => {
    class ConError extends EventTarget {
      postMessage(): void {
        setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { ok: false, error: 'algo salio mal' } })), 0)
      }
      terminate(): void {}
    }
    const enSuHilo = await generarCon(ConError)
    await expect(enSuHilo(pedido)).rejects.toThrow('algo salio mal')
  })
})
