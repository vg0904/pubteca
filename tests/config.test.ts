import { describe, expect, it } from 'vitest'
import { CONFIG_DEFAULT, anio, leerConfig, si } from '../src/core/config'
import { Diagnosticos } from '../src/core/mensajes'
import { oraculo } from './oraculo'

describe('CONFIG_DEFAULT', () => {
  it('coincide con el del Python, clave por clave y en el mismo orden', () => {
    expect(CONFIG_DEFAULT).toEqual(oraculo.CONFIG_DEFAULT)
    expect(Object.keys(CONFIG_DEFAULT)).toEqual(Object.keys(oraculo.CONFIG_DEFAULT))
  })
})

describe(`leerConfig (${oraculo.configs.length} casos del Python)`, () => {
  for (const caso of oraculo.configs) {
    it(`${caso.nombre}: devuelve los mismos datos`, () => {
      const dg = new Diagnosticos()
      const cfg = leerConfig(caso.entrada ?? undefined, dg)
      expect(cfg).toEqual(caso.salida)
    })
    it(`${caso.nombre}: produce los mismos avisos`, () => {
      const dg = new Diagnosticos()
      leerConfig(caso.entrada ?? undefined, dg)
      expect(dg.avisos).toEqual(caso.avisos)
      expect(dg.errores).toEqual([])
    })
  }

  it('un valor con dos puntos se conserva entero', () => {
    const dg = new Diagnosticos()
    expect(leerConfig('descripcion: a: b: c', dg).descripcion).toBe('a: b: c')
  })

  it('la clave se normaliza sin acentos y con guion bajo', () => {
    const dg = new Diagnosticos()
    const cfg = leerConfig('fecha publicacion: 2026\ntítulo: Acentuado', dg)
    expect(cfg.fecha_publicacion).toBe('2026')
    expect(cfg.titulo).toBe('Acentuado')
  })

  it('la ultima clave repetida gana', () => {
    const dg = new Diagnosticos()
    expect(leerConfig('titulo: primero\ntitulo: segundo', dg).titulo).toBe('segundo')
  })

  it('el numero de linea del aviso cuenta desde 1 e incluye las vacias', () => {
    const dg = new Diagnosticos()
    leerConfig('titulo: A\n\nlinea mala', dg)
    expect(dg.avisos[0]).toContain('línea 3')
  })
})

describe(`si (${oraculo.si.length} casos del Python)`, () => {
  for (const [entrada, esperado] of oraculo.si) {
    it(`${JSON.stringify(entrada)} -> ${esperado}`, () => {
      expect(si(entrada)).toBe(esperado)
    })
  }
  it('acepta «SÍ» con acento y en mayusculas', () => {
    expect(si('SÍ')).toBe(true)
  })
})

describe('anio', () => {
  const base = { ...CONFIG_DEFAULT } as Record<string, string>

  it('saca los cuatro digitos de fecha_publicacion', () => {
    expect(anio({ ...base, fecha_publicacion: '2026-12-01' } as never, 1999)).toBe('2026')
    expect(anio({ ...base, fecha_publicacion: '2026' } as never, 1999)).toBe('2026')
  })

  it('cae en el ano que se le inyecta cuando no hay fecha', () => {
    expect(anio({ ...base, fecha_publicacion: '' } as never, 2026)).toBe('2026')
    expect(anio({ ...base, fecha_publicacion: 'sin digitos' } as never, 2026)).toBe('2026')
  })

  it('devuelve la cadena tal cual, no un numero', () => {
    // El Python usa m.group(0), asi que no normaliza los digitos.
    expect(anio({ ...base, fecha_publicacion: 'del ٢٠٢٦' } as never, 1999))
      .toBe('٢٠٢٦')
  })
})
