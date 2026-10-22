/**
 * El idioma de la INTERFAZ.
 *
 * El compilador ya exige que `en.ts` tenga todas las claves de `es.ts` (ver el
 * tipo `Ui`), pero no puede ver tres cosas que si rompen la interfaz:
 *
 *   1. una traduccion que se deja el texto en español;
 *   2. una funcion que no usa los argumentos que recibe, y entonces se come un
 *      numero o un nombre que el autor tenia que leer;
 *   3. un componente que lee `ui` en el cuerpo de su MODULO: eso se resuelve
 *      una sola vez, al cargar, y se queda congelado en el idioma inicial.
 *      Es el fallo clasico al meter idiomas en una app que no los tenia, y no
 *      da ningun error: simplemente ese texto no cambia nunca.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ui as en } from '../src/i18n/en'
import { ui as es } from '../src/i18n/es'
import { IDIOMAS, NOMBRES, esIdioma, idiomaInicial, textos } from '../src/i18n'

type Cualquiera = Record<string, unknown>

/** Todas las rutas de un objeto de textos: «inicio.nuevo», «copia.errores.danada»... */
function rutas(x: unknown, prefijo = ''): string[] {
  if (typeof x !== 'object' || x === null) return [prefijo]
  return Object.entries(x as Cualquiera).flatMap(([k, v]) =>
    rutas(v, prefijo ? `${prefijo}.${k}` : k),
  )
}

function enRuta(x: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((o, k) => (o as Cualquiera)?.[k], x)
}

/**
 * Llama a un texto-funcion y devuelve lo que dice, o `null` si esos argumentos
 * no le valen.
 *
 * No todos aceptan de todo: los de `formato` solo trabajan con numeros y
 * reventarian con una cadena. Probar con varios tipos y quedarse con el que
 * funcione es lo que deja que estas comprobaciones valgan para TODOS los
 * textos sin tener que ir excluyendo claves a mano.
 */
function probar(f: (...x: unknown[]) => unknown, args: readonly unknown[]): string | null {
  try {
    return String(f(...args))
  } catch {
    return null
  }
}

/** Todos los textos-funcion de una tabla, con su ruta. */
function funciones(t: unknown): { ruta: string; f: (...x: unknown[]) => unknown }[] {
  return rutas(t).flatMap((ruta) => {
    const f = enRuta(t, ruta)
    return typeof f === 'function' ? [{ ruta, f: f as (...x: unknown[]) => unknown }] : []
  })
}

describe('las dos traducciones tienen la misma forma', () => {
  it('las mismas claves, en el mismo sitio', () => {
    expect(rutas(en).sort()).toEqual(rutas(es).sort())
  })

  it('cada clave es del mismo tipo en los dos idiomas', () => {
    const distintos = rutas(es).filter((r) => typeof enRuta(en, r) !== typeof enRuta(es, r))
    expect(distintos).toEqual([])
  })

  it('las funciones piden los mismos argumentos', () => {
    const distintos = rutas(es).filter((r) => {
      const a = enRuta(es, r)
      const b = enRuta(en, r)
      return typeof a === 'function' && typeof b === 'function' && a.length !== b.length
    })
    expect(distintos).toEqual([])
  })

  /**
   * Una funcion que ignora su argumento es un texto roto, no un texto corto:
   * `(n) => 'chapters'` se come el numero y el autor lee «chapters» a secas.
   * Se comprueba que el resultado dependa de lo que entra.
   */
  it('ninguna funcion se come su argumento', () => {
    const sospechosas: string[] = []
    for (const [idioma, t] of [
      ['es', es],
      ['en', en],
    ] as const) {
      for (const { ruta, f } of funciones(t)) {
        if (f.length === 0) continue
        const n = f.length
        // Dos llamadas con argumentos distintos, en texto y en numeros: si el
        // resultado no cambia con NINGUNO de los dos, el argumento se perdio.
        const cambia = (a: readonly unknown[], b: readonly unknown[]): boolean => {
          const x = probar(f, a)
          const y = probar(f, b)
          return x !== null && y !== null && x !== y
        }
        const conTexto = cambia(
          Array.from({ length: n }, (_, i) => `«A${i}»`),
          Array.from({ length: n }, (_, i) => `«B${i}»`),
        )
        // Los dos numeros tienen que estar LEJOS: `tamano(7)` y `tamano(9)`
        // son los dos «1 kB», y el texto parecia comerse el argumento.
        const conNumeros = cambia(
          Array.from({ length: n }, () => 7),
          Array.from({ length: n }, () => 7_654_321),
        )
        if (!conTexto && !conNumeros) sospechosas.push(`${idioma}.${ruta}`)
      }
    }
    expect(sospechosas).toEqual([])
  })

  /**
   * Un texto sin traducir es el fallo mas visible y el mas facil de colar.
   * No se puede comparar palabra por palabra, asi que se busca lo que delata
   * al español: sus signos y sus palabras mas comunes.
   */
  it('el ingles no se dejo texto en español', () => {
    /**
     * Palabras que en ingles NO se traducen, porque no son palabras: son
     * nombres de archivo del generador, marcas que el motor sustituye y las
     * etiquetas de capitulo que el EPUB solo entiende en español. Se quitan
     * del texto ANTES de buscar español, en vez de perdonar la clave entera,
     * para que el resto de la frase siga vigilado.
     */
    const LITERALES = [
      'Pubteca',
      'libro.txt',
      'proyecto.json',
      'reporte.txt',
      'LEEME.txt',
      'capitulos/',
      'ilustraciones/',
      'portada/',
      'extras/',
      'fuentes/',
      '{año}',
      '{autor}',
      'Capítulo',
      'Prólogo',
      'Epílogo',
      'Interludio',
      'Índice',
      'Español',
    ]
    const ESPAÑOL =
      /[¿¡áéíóúñÁÉÍÓÚÑ]|\b(el|la|los|las|del|que|para|una|con|este|esta|tus|tu|libro|imagen|imágenes|capítulo|página)\b/iu
    const sinTraducir = rutas(es).filter((r) => {
      const v = enRuta(en, r)
      const texto =
        typeof v === 'function'
          ? (probar(v as (...x: unknown[]) => unknown, ['x', 'y']) ?? probar(v as (...x: unknown[]) => unknown, [7, 7_654_321]))
          : v
      if (typeof texto !== 'string') return false
      const limpio = LITERALES.reduce((t, lit) => t.replaceAll(lit, ''), texto)
      return ESPAÑOL.test(limpio)
    })
    expect(sinTraducir).toEqual([])
  })

  it('ningun texto se quedo vacio por descuido', () => {
    // Los tres vacios son a proposito: los grupos sin consejo y el grupo «otro»,
    // que ensena el mensaje del motor tal cual.
    const APROPOSITO = ['grupos.horizontal.consejo', 'grupos.capituloVacio.consejo', 'grupos.otro.titulo', 'grupos.otro.consejo']
    for (const [idioma, t] of [
      ['es', es],
      ['en', en],
    ] as const) {
      const vacios = rutas(t).filter((r) => enRuta(t, r) === '' && !APROPOSITO.includes(r))
      expect(vacios, idioma).toEqual([])
    }
  })
})

describe('elegir el idioma', () => {
  it('manda lo que el autor eligio', () => {
    expect(idiomaInicial(['en-US', 'en'], 'es')).toBe('es')
    expect(idiomaInicial(['es-ES'], 'en')).toBe('en')
  })

  it('un valor guardado que no es un idioma se ignora', () => {
    expect(idiomaInicial(['en'], 'klingon')).toBe('en')
    expect(idiomaInicial(['en'], '')).toBe('en')
    expect(idiomaInicial(['en'], null)).toBe('en')
  })

  it('sin eleccion, el primer idioma del navegador que Pubteca hable', () => {
    expect(idiomaInicial(['en-GB', 'es'])).toBe('en')
    expect(idiomaInicial(['es-419'])).toBe('es')
    // El orden del navegador se respeta: el catalan todavia no esta, asi que
    // gana el español porque va antes que el ingles.
    expect(idiomaInicial(['ca', 'es', 'en'])).toBe('es')
    expect(idiomaInicial(['ca', 'en', 'es'])).toBe('en')
  })

  it('sin nada conocido, español', () => {
    expect(idiomaInicial(['ja', 'ko'])).toBe('es')
    expect(idiomaInicial([])).toBe('es')
    expect(idiomaInicial()).toBe('es')
  })

  it('cada idioma se nombra en si mismo', () => {
    expect(NOMBRES.es).toBe('Español')
    expect(NOMBRES.en).toBe('English')
    for (const i of IDIOMAS) expect(NOMBRES[i]).toBeTruthy()
  })

  it('textos() devuelve la tabla del idioma', () => {
    expect(textos('es')).toBe(es)
    expect(textos('en')).toBe(en)
  })

  it('esIdioma solo acepta los que hay', () => {
    expect(esIdioma('es')).toBe(true)
    expect(esIdioma('en')).toBe(true)
    expect(esIdioma('ES')).toBe(false)
    expect(esIdioma('pt')).toBe(false)
    expect(esIdioma(null)).toBe(false)
  })
})

describe('la interfaz no congela los textos al cargar', () => {
  const UI = join(import.meta.dirname, '..', 'src', 'app', 'ui')
  const archivos = readdirSync(UI).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))

  it('hay componentes que vigilar', () => {
    expect(archivos.length).toBeGreaterThan(10)
  })

  it('ningun componente importa un idioma concreto', () => {
    // El unico que puede es `contexto.ts`, que necesita el español como valor
    // por defecto del contexto.
    const culpables = archivos.filter(
      (f) => f !== 'contexto.ts' && /from '\.\.\/\.\.\/i18n\/(es|en)'/u.test(readFileSync(join(UI, f), 'utf8')),
    )
    expect(culpables).toEqual([])
  })

  it('ningun modulo lee `ui` fuera de un componente', () => {
    // Una declaracion en la columna 0 se ejecuta al importar el modulo, una
    // sola vez: el texto que saque de `ui` se queda en el idioma de entonces.
    const culpables: string[] = []
    for (const f of archivos) {
      const lineas = readFileSync(join(UI, f), 'utf8').split('\n')
      for (const [i, l] of lineas.entries()) {
        if (/^(export\s+)?(const|let|var)\s.*(?<![\w.'"])ui\./u.test(l)) culpables.push(`${f}:${i + 1}`)
      }
    }
    expect(culpables).toEqual([])
  })
})
