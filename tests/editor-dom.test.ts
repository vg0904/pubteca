// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { leer, pintar, ponerCursor, seleccionEn } from '../src/app/editor-dom'
import type { Marca, Tramo } from '../src/app/modelo'
import { bloquesDePegado, lineasDeHtml, lineasDeTexto } from '../src/app/pegar'

/**
 * El puente entre el DOM del editor y los tramos del modelo.
 *
 * El navegador escribe el formato a su manera (Chrome con <b> e <i>, Safari
 * quitando una negrita con un span de font-weight normal) y el editor tiene que
 * leerlo igual que lo pinto. Y lo que se pega viene de Word o de Google Docs,
 * que tienen sus propias trampas.
 */

const t = (texto: string, ...marcas: Marca[]): Tramo => ({ texto, marcas })

let el: HTMLDivElement
beforeEach(() => {
  document.body.innerHTML = ''
  el = document.createElement('div')
  el.contentEditable = 'true'
  document.body.appendChild(el)
})

describe('pintar y leer', () => {
  const casos: [string, Tramo[]][] = [
    ['texto llano', [t('Hola mundo')]],
    ['cursiva y negrita', [t('a '), t('b', 'cursiva'), t(' c '), t('d', 'negrita')]],
    ['las dos a la vez', [t('x', 'cursiva', 'negrita'), t(' y')]],
    ['caracteres que en HTML significan algo', [t('<b>no</b> & "sí"', 'cursiva')]],
    ['vacio', []],
  ]
  for (const [nombre, tramos] of casos) {
    it(`ida y vuelta: ${nombre}`, () => {
      pintar(el, tramos)
      expect(leer(el)).toEqual(tramos)
    })
  }

  it('el texto nunca se interpreta como HTML', () => {
    pintar(el, [t('<img src=x onerror=alert(1)>')])
    expect(el.querySelector('img')).toBeNull()
  })

  it('lee las etiquetas que escribe Chrome con execCommand', () => {
    el.innerHTML = 'El faro <i>estaba</i> encendido.<b> Fuerte</b>'
    expect(leer(el)).toEqual([t('El faro '), t('estaba', 'cursiva'), t(' encendido.'), t(' Fuerte', 'negrita')])
  })

  it('una negrita quitada con un span de font-weight normal deja de ser negrita (Safari)', () => {
    el.innerHTML = '<strong>uno <span style="font-weight: normal">dos</span> tres</strong>'
    expect(leer(el)).toEqual([t('uno ', 'negrita'), t('dos'), t(' tres', 'negrita')])
  })

  it('la cursiva por estilo cuenta como cursiva', () => {
    el.innerHTML = 'a <span style="font-style: italic">b</span>'
    expect(leer(el)).toEqual([t('a '), t('b', 'cursiva')])
  })

  it('los <br> que mete el navegador al vaciar un bloque no son texto', () => {
    el.innerHTML = '<br>'
    expect(leer(el)).toEqual([])
  })

  it('un salto de linea dentro del texto se lee como espacio, sin cambiar la longitud', () => {
    el.textContent = 'uno\ndos'
    expect(leer(el)).toEqual([t('uno dos')])
  })
})

describe('el cursor', () => {
  it('ponerCursor y seleccionEn cuentan igual, atravesando las etiquetas', () => {
    pintar(el, [t('Hola '), t('mundo', 'cursiva'), t(' azul')])
    for (const o of [0, 3, 5, 7, 10, 15]) {
      ponerCursor(el, o)
      expect(seleccionEn(el)).toEqual({ inicio: o, fin: o })
    }
  })

  it('en la frontera de dos tramos, el cursor queda al final del de antes', () => {
    // Asi lo que se escribe despues sigue en el formato del texto anterior,
    // que es lo que hace cualquier procesador de texto.
    pintar(el, [t('abc', 'cursiva'), t('def')])
    ponerCursor(el, 3)
    const r = getSelection()?.getRangeAt(0)
    expect(r?.startContainer.parentElement?.localName).toBe('em')
  })

  it('inicio y fin', () => {
    pintar(el, [t('abc'), t('de', 'negrita')])
    ponerCursor(el, 'fin')
    expect(seleccionEn(el)).toEqual({ inicio: 5, fin: 5 })
    ponerCursor(el, 'inicio')
    expect(seleccionEn(el)).toEqual({ inicio: 0, fin: 0 })
  })

  it('una seleccion fuera del elemento no cuenta', () => {
    const otro = document.createElement('p')
    otro.textContent = 'fuera'
    document.body.appendChild(otro)
    pintar(el, [t('dentro')])
    const r = document.createRange()
    r.setStart(otro.firstChild as Node, 1)
    getSelection()?.removeAllRanges()
    getSelection()?.addRange(r)
    expect(seleccionEn(el)).toBeNull()
  })

  it('un rango de seleccion', () => {
    pintar(el, [t('Hola '), t('mundo', 'cursiva')])
    ponerCursor(el, 2, 8)
    expect(seleccionEn(el)).toEqual({ inicio: 2, fin: 8 })
  })
})

describe('pegar', () => {
  it('Google Docs envuelve todo en un <b> de peso normal: no es negrita', () => {
    const html =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-x">' +
      '<p dir="ltr"><span style="font-weight:400;">Uno con </span><span style="font-weight:400;font-style:italic;">cursiva</span></p>' +
      '<p dir="ltr"><span style="font-weight:700;">Dos</span></p></b>'
    expect(lineasDeHtml(html)).toEqual([[t('Uno con '), t('cursiva', 'cursiva')], [t('Dos', 'negrita')]])
  })

  it('Word: fuera el <style> y los parrafos vacios con &nbsp;', () => {
    // Outlook y algunas versiones de Word meten el <style> DENTRO del body:
    // leido como texto, el libro empezaria con cien lineas de reglas «mso-».
    const html =
      '<html><head></head><body><style>p.MsoNormal{mso-style-name:x}</style>' +
      '<p class=MsoNormal><i>Primero</i></p><p class=MsoNormal><o:p>&nbsp;</o:p></p>' +
      '<p class=MsoNormal>Segundo</p></body></html>'
    expect(lineasDeHtml(html)).toEqual([[t('Primero', 'cursiva')], [t('Segundo')]])
  })

  it('un <br> parte el parrafo', () => {
    expect(lineasDeHtml('<p>uno<br>dos</p>')).toEqual([[t('uno')], [t('dos')]])
  })

  it('texto plano: una linea por parrafo, y las vacias no cuentan', () => {
    expect(lineasDeTexto('uno\r\n\r\ndos\n')).toEqual([[t('uno')], [t('dos')]])
  })

  it('los «* * *» se pegan como cambio de escena', () => {
    let n = 0
    const b = bloquesDePegado('', 'Antes.\n* * *\nDespués.', () => `b${++n}`)
    expect(b.map((x) => x.tipo)).toEqual(['parrafo', 'escena', 'parrafo'])
  })

  it('un HTML sin texto (una imagen copiada) cae al texto plano', () => {
    let n = 0
    const b = bloquesDePegado('<img src="x.png">', 'pie de foto', () => `b${++n}`)
    expect(b).toEqual([{ id: 'b1', tipo: 'parrafo', tramos: [t('pie de foto')] }])
  })
})
