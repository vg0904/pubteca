import { describe, expect, it } from 'vitest'
import {
  compararNatural,
  desescapar,
  enLinea,
  esc,
  escInline,
  limpiarTitulo,
  lineasDe,
  nombreSeguro,
  ordenNatural,
  ordenarNatural,
  partirUnaVez,
  sinAcentos,
  textoPlano,
} from '../src/core/texto'
import { etiqueta, oraculo, type Par } from './oraculo'
import { VALORES } from './divergencias'

/** Recorre los pares entrada->salida del Python y exige igualdad exacta. */
type ClavePar =
  | 'esc'
  | 'esc_inline'
  | 'sin_acentos'
  | 'nombre_seguro'
  | 'desescapar'
  | 'en_linea'
  | 'texto_plano'
  | 'limpiar_titulo'

function paridad(nombre: ClavePar, fn: (s: string) => string) {
  const pares: Par[] = oraculo[nombre]
  const divergentes = VALORES[nombre] ?? new Map()

  describe(`${nombre} (${pares.length} casos del Python)`, () => {
    it('hay casos de verdad que comprobar', () => {
      expect(pares.length).toBeGreaterThan(5)
    })

    for (const [entrada, esperado] of pares) {
      const d = divergentes.get(entrada)
      if (d) {
        // Divergencia registrada: se comprueba QUE hacia el Python y QUE
        // hacemos nosotros, para que el registro no se quede viejo en silencio.
        it(`${etiqueta(entrada)} -> ${etiqueta(d.nuestro)} (divergencia a proposito)`, () => {
          expect(esperado).toBe(d.python)
          expect(fn(entrada)).toBe(d.nuestro)
          expect(d.nuestro).not.toBe(d.python)
          expect(d.motivo.length).toBeGreaterThan(40)
        })
      } else {
        it(`${etiqueta(entrada)} -> ${etiqueta(esperado)}`, () => {
          expect(fn(entrada)).toBe(esperado)
        })
      }
    }
  })
}

paridad('esc', esc)
paridad('esc_inline', escInline)
paridad('sin_acentos', sinAcentos)
paridad('nombre_seguro', nombreSeguro)
paridad('desescapar', desescapar)
paridad('en_linea', enLinea)
paridad('texto_plano', textoPlano)
paridad('limpiar_titulo', limpiarTitulo)

describe('orden_natural', () => {
  for (const caso of oraculo.orden_natural) {
    it(`ordena ${JSON.stringify(caso.entrada)}`, () => {
      expect(ordenarNatural(caso.entrada)).toEqual(caso.salida)
    })
    it(`genera las mismas claves para ${JSON.stringify(caso.entrada)}`, () => {
      const claves = caso.entrada.map((n: string) => ordenNatural(n).map(String))
      expect(claves).toEqual(caso.claves)
    })
  }

  it('el comparador es consistente consigo mismo', () => {
    const a = ordenNatural('cap01.md')
    const b = ordenNatural('cap2.md')
    expect(compararNatural(a, b)).toBeLessThan(0)
    expect(compararNatural(b, a)).toBeGreaterThan(0)
    expect(compararNatural(a, ordenNatural('cap01.md'))).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Las trampas Python -> JavaScript, nombradas una a una.
// Estan ya cubiertas arriba por paridad, pero aqui se dejan explicitas para
// que al romper una, el nombre del test diga QUE se rompio y por que importa.
// ---------------------------------------------------------------------------

describe('trampas Python -> JavaScript', () => {
  it('1. \\w es Unicode en Python: la n con tilde protege el guion bajo', () => {
    // En JS \w es [A-Za-z0-9_], asi que un port ingenuo italizaria esto.
    expect(enLinea('camiñó_x_fin')).toBe('camiñó_x_fin')
    expect(enLinea('niño_x_fin')).toBe('niño_x_fin')
    expect(enLinea('café_x_fin')).toBe('café_x_fin')
    // y donde SI hay que italizar, se italiza
    expect(enLinea('dijo _hola_ y')).toBe('dijo <em>hola</em> y')
  })

  it('2. \\d es Unicode en Python: los digitos arabo-indicos cuentan', () => {
    // parseInt('٣') da NaN; el valor correcto es 3.
    expect(ordenNatural('cap٣.md')).toEqual(['cap', 3, '.md'])
    expect(ordenNatural('cap3.md')).toEqual(['cap', 3, '.md'])
    // claves iguales -> el sort estable conserva el orden de entrada
    expect(ordenarNatural(['cap٣.md', 'cap3.md'])).toEqual(['cap٣.md', 'cap3.md'])
    expect(ordenarNatural(['cap3.md', 'cap٣.md'])).toEqual(['cap3.md', 'cap٣.md'])
  })

  it('3. la apostrofe se escapa como &#x27;, no &#39; ni &apos;', () => {
    expect(esc(`a&b<c>"d'e`)).toBe('a&amp;b&lt;c&gt;&quot;d&#x27;e')
    expect(esc("D'Artagnan")).toBe('D&#x27;Artagnan')
    // el escapado suave deja comillas y apostrofes intactas
    expect(escInline(`a&b<c>"d'e`)).toBe(`a&amp;b&lt;c&gt;"d'e`)
  })

  it('4. sin_acentos descarta la categoria Mn entera, no solo el bloque latino', () => {
    expect(sinAcentos('Ñandú Año')).toBe('Nandu Ano')
    expect(sinAcentos('日本語')).toBe('日本語')
    expect(sinAcentos('ø')).toBe('ø')
    expect(sinAcentos('ß')).toBe('ß')
    // nombre_seguro recorta GUIONES, no espacios, y cae en "archivo"
    expect(nombreSeguro('-borde-')).toBe('borde')
    expect(nombreSeguro('日本語')).toBe('archivo')
    expect(nombreSeguro('---')).toBe('archivo')
    expect(nombreSeguro('   ')).toBe('archivo')
  })

  it('7. partirUnaVez es maxsplit, no el limite de String.split', () => {
    const re = /\s*[:.\-–—]\s*/u
    expect(partirUnaVez('Capítulo 3: El bosque', re)).toEqual(['Capítulo 3', 'El bosque'])
    // lo que hace el split nativo, y que perderia el titulo entero:
    expect('Capítulo 3: El bosque'.split(re, 1)).toEqual(['Capítulo 3'])
    // con varios separadores solo parte en el primero
    expect(partirUnaVez('a: b: c', re)).toEqual(['a', 'b: c'])
    expect(partirUnaVez('sin separador', re)).toEqual(['sin separador'])
  })

  it('8. el centinela se restaura con una funcion: un $ del autor no es un grupo', () => {
    expect(enLinea('**$&**')).toBe('<strong>$&amp;</strong>')
    expect(enLinea('*a$1b*')).toBe('<em>a$1b</em>')
    expect(enLinea('\\*no cursiva\\*')).toBe('*no cursiva*')
    // Y los escapes se guardan ANTES de escapar el HTML, asi que «\>» no deja
    // la barra a la vista. Es divergencia a proposito: ver tests/divergencias.ts.
    expect(enLinea('\\>')).toBe('&gt;')
  })
})

describe('lineasDe', () => {
  for (const caso of oraculo.capitulos) {
    it(`normaliza ${caso.nombre} igual que el Python`, () => {
      expect(lineasDe(caso.entrada)).toEqual(caso.lineas_de)
    })
  }
  it('quita el BOM, como hace utf-8-sig', () => {
    expect(lineasDe('﻿titulo')).toEqual(['titulo'])
  })
})

describe('limpiar_titulo replica el bug codicioso a proposito', () => {
  it('«*a* y *b*» da «a* y *b», no «a y b»', () => {
    // El regex casa el primer y el ultimo asterisco aunque sean de dos
    // enfasis distintos. Se replica para no romper los golden tests; la
    // correccion esta anotada en el plan como divergencia de fase 2.
    expect(limpiarTitulo('*a* y *b*')).toBe('a* y *b')
  })
})
