import { describe, expect, it } from 'vitest'
import type { Marca, Tramo } from '../src/app/modelo'
import {
  alternarMarca,
  canonicos,
  igualesTramos,
  limpiarTexto,
  longitud,
  partir,
  prefijoComun,
  recortar,
  sustituir,
  tieneMarca,
  unir,
} from '../src/app/tramos'

/**
 * Las operaciones del editor sobre una linea. Son las que deciden que pasa con
 * la cursiva al partir un parrafo o al pegar en mitad de una negrita: si fallan,
 * el escritor ve una cosa y el libro dice otra.
 */

const t = (texto: string, ...marcas: Marca[]): Tramo => ({ texto, marcas })

describe('partir y unir', () => {
  const linea = [t('Dijo '), t('en voz baja', 'cursiva'), t(' y se fue.')]

  it('partir en mitad de una cursiva deja cursiva a los dos lados', () => {
    const [a, b] = partir(linea, 8)
    expect(a).toEqual([t('Dijo '), t('en ', 'cursiva')])
    expect(b).toEqual([t('voz baja', 'cursiva'), t(' y se fue.')])
  })

  it('partir conserva el espacio del extremo: el autor lo esta escribiendo', () => {
    const [a] = partir([t('Hola mundo')], 5)
    expect(a).toEqual([t('Hola ')])
  })

  it('partir y volver a unir devuelve la misma linea', () => {
    for (let o = 0; o <= longitud(linea); o++) {
      const [a, b] = partir(linea, o)
      expect(unir(a, b)).toEqual(linea)
    }
  })

  it('unir junta los tramos con las mismas marcas', () => {
    expect(unir([t('a', 'cursiva')], [t('b', 'cursiva')])).toEqual([t('ab', 'cursiva')])
  })

  it('partir fuera de rango no rompe', () => {
    expect(partir(linea, -3)[0]).toEqual([])
    expect(partir(linea, 999)[1]).toEqual([])
  })

  it('recortar respeta las fronteras de los tramos', () => {
    expect(recortar(linea, 3, 9)).toEqual([t('o '), t('en v', 'cursiva')])
  })
})

describe('cursiva y negrita en un rango', () => {
  it('poner cursiva en un trozo de texto llano', () => {
    expect(alternarMarca([t('una palabra suelta')], 4, 11, 'cursiva')).toEqual([
      t('una '),
      t('palabra', 'cursiva'),
      t(' suelta'),
    ])
  })

  it('si TODO el rango ya es cursiva, se quita', () => {
    const linea = [t('una '), t('palabra', 'cursiva'), t(' suelta')]
    expect(alternarMarca(linea, 4, 11, 'cursiva')).toEqual([t('una palabra suelta')])
  })

  it('si solo PARTE del rango es cursiva, se pone en todo', () => {
    // Es lo que hace Word: un rango mixto se iguala hacia la marca.
    const linea = [t('una '), t('pala', 'cursiva'), t('bra suelta')]
    expect(alternarMarca(linea, 4, 11, 'cursiva')).toEqual([t('una '), t('palabra', 'cursiva'), t(' suelta')])
  })

  it('negrita encima de cursiva da las dos, en orden canonico', () => {
    const r = alternarMarca([t('todo', 'cursiva')], 0, 4, 'negrita')
    expect(r).toEqual([t('todo', 'cursiva', 'negrita')])
  })

  it('un rango vacio no cambia nada', () => {
    const linea = [t('abc')]
    expect(alternarMarca(linea, 2, 2, 'cursiva')).toEqual(linea)
  })

  it('tieneMarca mira el rango entero', () => {
    const linea = [t('ab', 'negrita'), t('cd')]
    expect(tieneMarca(linea, 0, 2, 'negrita')).toBe(true)
    expect(tieneMarca(linea, 0, 3, 'negrita')).toBe(false)
    expect(tieneMarca(linea, 1, 1, 'negrita')).toBe(false)
  })
})

describe('pegar dentro de una linea', () => {
  it('sustituye la seleccion por lo pegado, con sus marcas', () => {
    const r = sustituir([t('Hola mundo')], 5, 10, [t('amigo', 'cursiva')])
    expect(r).toEqual([t('Hola '), t('amigo', 'cursiva')])
  })

  it('pegar texto con saltos de linea no puede partir el parrafo en el archivo', () => {
    // En el dialecto cada linea es un bloque: un \n dentro de un parrafo lo
    // partiria en dos al guardar, en silencio.
    const r = sustituir([t('ab')], 1, 1, [t('x\ny\r\nz')])
    expect(r).toEqual([t('ax y  zb')])
  })
})

describe('limpieza', () => {
  it('limpiarTexto cambia los saltos por espacios sin cambiar la longitud', () => {
    const s = 'a\nb\u2028c\u2029d\re'
    expect(limpiarTexto(s)).toBe('a b c d e')
    expect(limpiarTexto(s).length).toBe(s.length)
  })

  it('los separadores U+001C a U+001E tambien son saltos para el motor', () => {
    // Sin esto, el parrafo se partia en dos al generar.
    expect(limpiarTexto('a\u001cb\u001dc\u001ed')).toBe('a b c d')
  })

  it('quita lo que XML no admite, que dejaria el EPUB invalido', () => {
    expect(limpiarTexto('a\u0001b\u0000c\ufffed')).toBe('abcd')
  })

  it('canonicos quita tramos vacios y une los iguales', () => {
    expect(canonicos([t(''), t('a'), t('b'), t('', 'cursiva')])).toEqual([t('ab')])
  })

  it('igualesTramos no depende del orden de las marcas', () => {
    expect(igualesTramos([t('a', 'negrita', 'cursiva')], [t('a', 'cursiva', 'negrita')])).toBe(true)
    expect(igualesTramos([t('a', 'cursiva')], [t('a')])).toBe(false)
  })

  it('prefijoComun dice donde empieza el cambio', () => {
    expect(prefijoComun('Hola mundo', 'Hola mundial')).toBe(9)
    expect(prefijoComun('', 'x')).toBe(0)
  })
})
