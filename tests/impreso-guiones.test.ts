import { describe, expect, it } from 'vitest'
import { LETRAS_MINIMAS, Particion, particionDe } from '../src/core/impreso/guiones'

// La particion a final de linea: los patrones de Liang (hyph-utf8) y encima
// las reglas de la Ortografia de la RAE (2010, 4.1.1).

const es = new Particion('es')

/**
 * Palabras con su division a final de linea segun la RAE. Cada guion de la
 * derecha es un corte VALIDO segun la Ortografia; donde la RAE admite mas de
 * uno («des-am-pa-ro» y «de-sam-pa-ro»), se da el que sale. Ninguna palabra
 * puede salir con un corte que no este aqui.
 */
const RAE: readonly (readonly [string, string])[] = [
  // Silabas simples; «ll», «rr» y «ch» no se separan nunca.
  ['caballo', 'ca-ba-llo'],
  ['carretera', 'ca-rre-te-ra'],
  ['chocolate', 'cho-co-la-te'],
  ['guerrero', 'gue-rre-ro'],
  ['callejón', 'ca-lle-jón'],
  ['lluvia', 'llu-via'],
  // Nunca una letra sola a un lado del guion: no «a-mistad» ni «o-chenta».
  ['amistad', 'amis-tad'],
  ['ochenta', 'ochen-ta'],
  ['ayuntamiento', 'ayun-ta-mien-to'],
  // Nunca se separan dos vocales seguidas, aunque formen hiato.
  ['teatro', 'tea-tro'],
  ['poeta', 'poe-ta'],
  ['aéreo', 'aé-reo'],
  ['acuario', 'acua-rio'],
  ['héroe', 'hé-roe'],
  ['caótico', 'caó-ti-co'],
  ['reunión', 'reu-nión'],
  ['biografía', 'bio-gra-fía'],
  ['extraordinario', 'ex-traor-di-na-rio'],
  ['leíais', 'leíais'],
  ['dieciséis', 'die-ci-séis'],
  // Grupos de consonantes: la ultima con la vocal que sigue.
  ['construcción', 'cons-truc-ción'],
  ['perspicacia', 'pers-pi-ca-cia'],
  ['abstracto', 'abs-trac-to'],
  ['instaurar', 'ins-tau-rar'],
  ['psicología', 'psi-co-lo-gía'],
  // Prefijos.
  ['desamparo', 'des-am-pa-ro'],
  ['inexacto', 'in-exac-to'],
  ['subrayar', 'sub-ra-yar'],
  ['deshacer', 'des-ha-cer'],
  // La «h» intercalada.
  ['prohibir', 'prohi-bir'],
  ['cohete', 'cohe-te'],
  ['desahucio', 'de-sahu-cio'],
  // La «x» entre vocales va con la siguiente; sola al principio, no.
  ['exámenes', 'exá-me-nes'],
  ['examen', 'examen'],
  ['sexto', 'sex-to'],
  // Mayuscula inicial: se parte igual.
  ['Sevilla', 'Se-vi-lla'],
  // De menos de cinco letras, y las siglas, no se parten.
  ['taxi', 'taxi'],
  ['búho', 'búho'],
  ['casa', 'casa'],
  ['UNESCO', 'UNESCO'],
]

describe('la particion en español pasa la lista de la RAE', () => {
  for (const [palabra, esperada] of RAE) {
    it(`${palabra} → ${esperada}`, () => {
      expect(es.partida(palabra)).toBe(esperada)
    })
  }
})

describe('reglas de la RAE sobre muchas palabras', () => {
  // Cualquier palabra del español que se ocurra: las reglas valen para todas.
  const MUCHAS =
    'aeropuerto ahorcado alcohol almohada búsqueda caoba coágulo creía cuidadoso desoír enhebrar espontaneidad guiar huevo inhumano leía maíz oasis paraíso petróleo poesía reacción rehusar río sabía teoría transeúnte vehículo zoológico baúl ciudad cuatro europeo heroico increíble línea océano prohíbo realidad sabíais tío veíamos aéreos cacatúa'.split(' ')
  const VOCAL = /[aeiouáéíóúü]/u

  it('nunca separa dos vocales', () => {
    for (const p of MUCHAS) {
      const letras = [...p.toLowerCase()]
      for (const i of es.cortes(p)) {
        expect(VOCAL.test(letras[i - 1] as string) && VOCAL.test(letras[i] as string), `${es.partida(p)}`).toBe(false)
      }
    }
  })

  it('nunca deja una letra sola a un lado ni entre dos cortes', () => {
    for (const p of [...MUCHAS, ...RAE.map((x) => x[0])]) {
      const c = es.cortes(p)
      const n = [...p].length
      for (const [k, i] of c.entries()) {
        expect(i, es.partida(p)).toBeGreaterThanOrEqual(2)
        expect(n - i, es.partida(p)).toBeGreaterThanOrEqual(2)
        if (k > 0) expect(i - (c[k - 1] as number), es.partida(p)).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it(`no parte palabras de menos de ${LETRAS_MINIMAS} letras aunque los patrones puedan`, () => {
    // «ca-sa» es una division correcta: los patrones la dan.
    expect(es.silabas('casa')).toEqual([2])
    expect(es.cortes('casa')).toEqual([])
  })
})

describe('ingles', () => {
  const en = new Particion('en')
  it('usa la lista de excepciones de hyph-utf8', () => {
    expect(en.partida('project')).toBe('project')
    expect(en.partida('associate')).toBe('as-so-ciate')
  })
  it('parte con los patrones', () => {
    expect(en.partida('hyphenation')).toBe('hy-phen-ation')
    expect(en.partida('typography')).toBe('ty-pog-ra-phy')
  })
  it('no deja un trozo de una letra entre dos cortes (de-mo-c-rat)', () => {
    for (const p of ['democrat', 'democratic', 'aristocrat', 'bureaucrat']) {
      const c = en.cortes(p)
      for (let k = 1; k < c.length; k++) expect((c[k] as number) - (c[k - 1] as number), en.partida(p)).toBeGreaterThanOrEqual(2)
    }
  })
  it('no separa vocales: esa regla es del español', () => {
    // «cre-ate» en ingles es correcto.
    expect(en.cortes('creation').length).toBeGreaterThan(0)
  })
})

describe('idiomas', () => {
  it('da la particion por idioma, con o sin region', () => {
    expect(particionDe('es')?.idioma).toBe('es')
    expect(particionDe('es-MX')?.idioma).toBe('es')
    expect(particionDe('en_GB')?.idioma).toBe('en')
  })
  it('sin patrones, no hay particion', () => {
    expect(particionDe('fr')).toBeNull()
    expect(particionDe('pt-BR')).toBeNull()
  })
  it('la construye una sola vez', () => {
    expect(particionDe('es')).toBe(particionDe('es-ES'))
  })
})
