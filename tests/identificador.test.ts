import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  NAMESPACE_URL,
  PREFIJO_SEMILLA,
  identificador,
  sha1,
  uuid5,
} from '../src/core/identificador'
import { oraculo } from './oraculo'

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

describe('sha1', () => {
  // Vectores publicados de FIPS 180-1, para no depender solo de node:crypto.
  it('cadena vacia', () => {
    expect(hex(sha1(new Uint8Array(0)))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  it('"abc"', () => {
    expect(hex(sha1(new TextEncoder().encode('abc')))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    )
  })

  it('las 448 bits de "abcdbcde..." (prueba el relleno justo en el limite)', () => {
    const s = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    expect(hex(sha1(new TextEncoder().encode(s)))).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    )
  })

  it('un millon de "a" (varios bloques)', () => {
    expect(hex(sha1(new TextEncoder().encode('a'.repeat(1_000_000))))).toBe(
      '34aa973cd4c4daa4f61eeb2bdbad27316534016f',
    )
  })

  // El relleno es lo que se rompe en una implementacion a mano: cuando la
  // longitud cae justo en 55, 56 o 64 bytes cambia el numero de bloques.
  for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129]) {
    it(`coincide con node:crypto para ${n} bytes`, () => {
      const datos = new Uint8Array(n).map((_, i) => (i * 37) % 256)
      const esperado = createHash('sha1').update(datos).digest('hex')
      expect(hex(sha1(datos))).toBe(esperado)
    })
  }

  it('coincide con node:crypto para 300 entradas pseudoaleatorias', () => {
    // Generador determinista a proposito: con randomBytes, un fallo no se
    // podria reproducir, que es lo peor que le puede pasar a un test de hash.
    let semilla = 0x2545f491
    const siguiente = (): number => {
      semilla = (semilla * 1103515245 + 12345) & 0x7fffffff
      return (semilla >>> 8) & 0xff
    }
    for (let n = 0; n < 300; n++) {
      const datos = new Uint8Array(n)
      for (let i = 0; i < n; i++) datos[i] = siguiente()
      expect(hex(sha1(datos))).toBe(createHash('sha1').update(datos).digest('hex'))
    }
  })
})

describe('uuid5 contra la salida real de Python', () => {
  it('el espacio de nombres es el de URL, que acaba en b811', () => {
    // El NAMESPACE_DNS acaba en b810 y es el que se copia por error.
    expect(NAMESPACE_URL).toBe('6ba7b811-9dad-11d1-80b4-00c04fd430c8')
    expect(NAMESPACE_URL.endsWith('b811-9dad-11d1-80b4-00c04fd430c8')).toBe(true)
  })

  it(`el prefijo de la semilla es «${PREFIJO_SEMILLA}»`, () => {
    expect(PREFIJO_SEMILLA).toBe('generador-epub:')
  })

  for (const caso of oraculo.uuid5) {
    it(`${JSON.stringify(caso.nombre)} -> ${caso.uuid}`, () => {
      expect(uuid5(NAMESPACE_URL, caso.nombre)).toBe(caso.uuid)
    })

    it(`identificador(${JSON.stringify(caso.titulo)}, ${JSON.stringify(caso.autor)}) -> ${caso.urn}`, () => {
      expect(identificador(caso.titulo, caso.autor, '')).toBe(caso.urn)
    })
  }

  it('con titulo y autor vacios la semilla es «generador-epub:|»', () => {
    const vacio = oraculo.uuid5.find((c) => c.titulo === '' && c.autor === '')
    expect(vacio?.nombre).toBe('generador-epub:|')
    expect(identificador('', '', '')).toBe(vacio?.urn)
  })

  it('es determinista: dos llamadas dan lo mismo', () => {
    expect(identificador('El faro', 'Ana Ruiz', '')).toBe(identificador('El faro', 'Ana Ruiz', ''))
  })

  it('el espacio equivocado daria otro UUID (por eso el test de arriba importa)', () => {
    const dns = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    expect(uuid5(dns, 'generador-epub:El faro|Ana Ruiz')).not.toBe(
      uuid5(NAMESPACE_URL, 'generador-epub:El faro|Ana Ruiz'),
    )
  })

  it('la version y la variante quedan fijadas', () => {
    const u = uuid5(NAMESPACE_URL, 'cualquier cosa')
    expect(u[14]).toBe('5') // version 5
    expect('89ab').toContain(u[19]) // variante RFC 4122
  })
})

describe('identificador: el ISBN gana al UUID', () => {
  it('limpia el ISBN de guiones y espacios', () => {
    expect(identificador('T', 'A', '978-84-00-00000-0')).toBe('urn:isbn:9788400000000')
    expect(identificador('T', 'A', ' 978 84 000 ')).toBe('urn:isbn:97884000')
  })

  it('conserva la X de control en la caja en que la escribio el autor', () => {
    expect(identificador('T', 'A', '0-8044-2957-X')).toBe('urn:isbn:080442957X')
    expect(identificador('T', 'A', '0-8044-2957-x')).toBe('urn:isbn:080442957x')
  })

  it('un ISBN sin digitos cae en el UUID', () => {
    expect(identificador('T', 'A', 'por determinar')).toMatch(/^urn:uuid:/)
    expect(identificador('T', 'A', '---')).toMatch(/^urn:uuid:/)
    expect(identificador('T', 'A', '')).toMatch(/^urn:uuid:/)
  })
})
