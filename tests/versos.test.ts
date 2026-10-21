import { describe, expect, it } from 'vitest'
import type { Marca, Tramo } from '../src/app/modelo'
import { alternarMarcaVerso, borrarAlInicio, intro, pegarLineas, versosVacios } from '../src/app/versos'

/** Los versos se editan como una lista: Intro, Intro en vacio, borrar al principio. */

const t = (texto: string, ...marcas: Marca[]): Tramo => ({ texto, marcas })
const textos = (e: readonly (readonly Tramo[])[]): string[][] => e.map((x) => x.map((v) => v.texto))

describe('Intro en un verso', () => {
  it('parte el verso por el cursor y lleva el cursor al nuevo', () => {
    const r = intro([[t('verde que te quiero')]], { estrofa: 0, verso: 0, offset: 5 })
    expect('estrofas' in r && textos(r.estrofas)).toEqual([['verde', ' que te quiero']])
    expect('foco' in r && r.foco).toEqual({ estrofa: 0, verso: 1, offset: 0 })
  })

  it('el verso nuevo hereda la cursiva del verso partido', () => {
    const r = intro([[t('una cancion', 'cursiva')]], { estrofa: 0, verso: 0, offset: 11 })
    expect('estrofas' in r && r.estrofas[0]?.[1]).toEqual(t('', 'cursiva'))
  })

  it('Intro en un verso vacio al final de la estrofa abre una estrofa nueva', () => {
    const r = intro([[t('uno'), t('')]], { estrofa: 0, verso: 1, offset: 0 })
    expect('estrofas' in r && textos(r.estrofas)).toEqual([['uno'], ['']])
    expect('foco' in r && r.foco).toEqual({ estrofa: 1, verso: 0, offset: 0 })
  })

  it('Intro otra vez en esa estrofa recien abierta sale del bloque', () => {
    const r = intro([['uno'].map((x) => t(x)), [t('')]], { estrofa: 1, verso: 0, offset: 0 })
    expect('salir' in r && textos(r.salir)).toEqual([['uno']])
  })

  it('un verso vacio en mitad de la estrofa NO abre estrofa: es un verso en blanco que se esta escribiendo', () => {
    const r = intro([[t('uno'), t(''), t('tres')]], { estrofa: 0, verso: 1, offset: 0 })
    expect('estrofas' in r && textos(r.estrofas)).toEqual([['uno', '', '', 'tres']])
  })
})

describe('Borrar al principio de un verso', () => {
  it('lo une con el anterior y deja el cursor en la costura', () => {
    const r = borrarAlInicio([[t('ab'), t('cd')]], { estrofa: 0, verso: 1, offset: 0 })
    expect(r && textos(r.estrofas)).toEqual([['abcd']])
    expect(r?.foco).toEqual({ estrofa: 0, verso: 0, offset: 2 })
  })

  it('al principio de una estrofa, la une con la anterior', () => {
    const r = borrarAlInicio([[t('a')], [t('b'), t('c')]], { estrofa: 1, verso: 0, offset: 0 })
    expect(r && textos(r.estrofas)).toEqual([['a', 'b', 'c']])
    expect(r?.foco).toEqual({ estrofa: 0, verso: 1, offset: 0 })
  })

  it('en el primer verso de todos no hay nada que unir', () => {
    expect(borrarAlInicio([[t('a')]], { estrofa: 0, verso: 0, offset: 0 })).toBeNull()
  })
})

describe('formato y pegado', () => {
  it('la cursiva va en el verso entero', () => {
    const r = alternarMarcaVerso([[t('a'), t('b')]], 0, 1, 'cursiva')
    expect(r).toEqual([[t('a'), t('b', 'cursiva')]])
    expect(alternarMarcaVerso(r, 0, 1, 'cursiva')).toEqual([[t('a'), t('b')]])
  })

  it('pegar un poema: cada linea es un verso y una linea en blanco es estrofa nueva', () => {
    const r = pegarLineas([[t('')]], { estrofa: 0, verso: 0, offset: 0 }, 0, ['uno', 'dos', '', 'tres'])
    expect(textos(r.estrofas)).toEqual([['uno', 'dos'], ['tres']])
    expect(r.foco).toEqual({ estrofa: 1, verso: 0, offset: 4 })
  })

  it('pegar en mitad de un verso conserva lo de antes y lo de despues', () => {
    const r = pegarLineas([[t('AB'), t('C')]], { estrofa: 0, verso: 0, offset: 1 }, 1, ['x', 'y'])
    expect(textos(r.estrofas)).toEqual([['Ax', 'yB', 'C']])
    expect(r.foco).toEqual({ estrofa: 0, verso: 1, offset: 1 })
  })

  it('versosVacios', () => {
    expect(versosVacios([[t(''), t(' ')]])).toBe(true)
    expect(versosVacios([[t(''), t('a')]])).toBe(false)
  })
})
