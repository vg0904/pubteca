import { describe, expect, it } from 'vitest'
import {
  RE_ESCENA,
  RE_ILUS,
  RE_SEPARADOR_TITULO,
  RE_TITULO,
  parsear,
  type Bloque,
} from '../src/core/parser'
import { secuencia, type Tramo } from '../src/core/secuencia'
import { partirUnaVez, textoPlano } from '../src/core/texto'
import { etiqueta, oraculo, type Tupla } from './oraculo'
import { CAPITULOS } from './divergencias'

/** Convierte un bloque al formato de tupla que exporta el Python. */
function bloqueATupla(b: Bloque): Tupla {
  switch (b.tipo) {
    case 'ilus':
      return ['ilus', b.nombre, b.alt]
    case 'escena':
      return ['escena']
    case 'estrofa':
      return ['estrofa']
    case 'verso':
      return ['verso', b.html]
    case 'sub':
      return ['sub', b.html]
    case 'p':
      return ['p', b.html]
  }
}

function tramoATupla(t: Tramo): Tupla {
  return t.tipo === 'texto' ? ['texto', [...t.lineas]] : ['ilus', t.nombre, t.alt]
}

/** Las lineas de un tramo de texto, fallando claro si no lo es. */
function lineas(t: Tramo | undefined): string[] {
  if (!t || t.tipo !== 'texto') throw new Error(`se esperaba un tramo de texto, llego ${t?.tipo}`)
  return [...t.lineas]
}

const p = (html: string): Bloque => ({ tipo: 'p', html })

describe(`parsear + secuencia (${oraculo.capitulos.length} capitulos del Python)`, () => {
  for (const caso of oraculo.capitulos) {
    const d = CAPITULOS.get(caso.nombre)

    describe(d ? `${caso.nombre} (divergencia a proposito)` : caso.nombre, () => {
      const r = parsear(caso.entrada)

      it('mismo titulo', () => {
        expect(r.titulo).toBe(d ? d.titulo : caso.titulo)
      })

      it('mismas ilustraciones antes del titulo', () => {
        const antes = r.antes.map((a): Tupla => ['ilus', a.nombre, a.alt])
        expect(antes).toEqual(d ? [] : caso.antes)
      })

      it('mismos bloques', () => {
        expect(r.bloques.map(bloqueATupla)).toEqual(d ? d.bloques : caso.bloques)
      })

      it('mismos tramos', () => {
        expect(secuencia(r.bloques, '* * *').map(tramoATupla)).toEqual(d ? d.tramos : caso.tramos)
      })

      if (d) {
        it('el Python hacia otra cosa, y el registro lo dice', () => {
          // Si el oraculo dejara de diferir, la divergencia estaria obsoleta.
          const distinto =
            JSON.stringify(caso.bloques) !== JSON.stringify(d.bloques) ||
            JSON.stringify(caso.tramos) !== JSON.stringify(d.tramos) ||
            caso.titulo !== d.titulo
          expect(distinto).toBe(true)
          expect(d.motivo.length).toBeGreaterThan(40)
        })
      }
    })
  }
})

describe(`RE_ILUS (${oraculo.RE_ILUS.length} casos del Python)`, () => {
  for (const caso of oraculo.RE_ILUS) {
    it(etiqueta(caso.entrada), () => {
      const m = RE_ILUS.exec(caso.entrada)
      expect(Boolean(m)).toBe(caso.casa)
      if (m) {
        expect(m[1]).toBe(caso.nombre)
        expect((m[2] ?? '').trim()).toBe(caso.alt)
      }
    })
  }
})

describe(`RE_ESCENA (${oraculo.RE_ESCENA.length} casos del Python)`, () => {
  for (const [entrada, esperado] of oraculo.RE_ESCENA) {
    it(`${etiqueta(entrada)} -> ${esperado}`, () => {
      expect(Boolean(RE_ESCENA.exec(entrada))).toBe(esperado)
    })
  }
})

describe(`RE_TITULO (${oraculo.RE_TITULO.length} casos del Python)`, () => {
  for (const caso of oraculo.RE_TITULO) {
    it(etiqueta(caso.entrada), () => {
      const m = RE_TITULO.exec(textoPlano(caso.entrada))
      expect(Boolean(m)).toBe(caso.casa)
      if (!m) return
      expect(m[1]).toBe(caso.grupo1)
      expect(m[2] ?? null).toBe(caso.grupo2 ?? null)

      if (m[2]) {
        // Lo que hace capitulos() despues del match, bug incluido.
        const crudo = partirUnaVez(caso.entrada, RE_SEPARADOR_TITULO)
        const tit = crudo.length === 2 ? crudo[1] : m[2].trim()
        expect(m[1]).toBe(caso.num_final)
        expect(tit).toBe(caso.titulo_final)
      }
    })
  }

  it('replica el bug de «Cap. 3»: el titulo sale como «3: El bosque»', () => {
    // El re.split parte en el PRIMER separador, que es el punto de «Cap.».
    // Esta en el plan como divergencia a corregir, con su propio test.
    const t = 'Cap. 3: El bosque'
    const m = RE_TITULO.exec(textoPlano(t))
    expect(m?.[1]).toBe('Cap. 3')
    expect(partirUnaVez(t, RE_SEPARADOR_TITULO)[1]).toBe('3: El bosque')
  })

  it('«Capítulo 3» a secas no deja titulo, asi que no se parte', () => {
    const m = RE_TITULO.exec('Capítulo 3')
    expect(m?.[1]).toBe('Capítulo 3')
    expect(m?.[2]).toBeUndefined()
  })
})

describe('secuencia: donde se parte el capitulo', () => {
  it('una ilustracion cierra el tramo de texto y abre su propia pagina', () => {
    const t = secuencia([p('uno'), { tipo: 'ilus', nombre: 'a', alt: 'x' }, p('dos')], '* * *')
    expect(t.map((x: Tramo) => x.tipo)).toEqual(['texto', 'ilus', 'texto'])
  })

  it('el primer parrafo tras la cabecera va sin sangria, el resto con ella', () => {
    const t = secuencia([p('uno'), p('dos')], '* * *')
    expect(lineas(t[0])).toEqual(['<p class="primero">uno</p>', '<p>dos</p>'])
  })

  it('tras un cambio de escena el parrafo vuelve a ir sin sangria', () => {
    const t = secuencia([p('uno'), { tipo: 'escena' }, p('dos')], '* * *')
    expect(lineas(t[0])[2]).toBe('<p class="primero">dos</p>')
  })

  it('tras un subtitulo tambien vuelve a ir sin sangria', () => {
    const t = secuencia([p('uno'), { tipo: 'sub', html: 'S' }, p('dos')], '* * *')
    expect(lineas(t[0])[2]).toBe('<p class="primero">dos</p>')
  })

  it('el separador de escena se escapa', () => {
    const t = secuencia([{ tipo: 'escena' }], '<&>')
    expect(lineas(t[0])[0]).toBe('<p class="escena">&lt;&amp;&gt;</p>')
  })

  it('DECISION replicada: el texto tras una ilustracion SI lleva sangria', () => {
    // El flag `primero` no se reinicia al partir por una ilustracion. Es
    // correcto tipograficamente: el texto continua el mismo hilo tras la
    // lamina. Queda documentado para que nadie lo "arregle".
    const t = secuencia([p('uno'), { tipo: 'ilus', nombre: 'a', alt: 'x' }, p('dos')], '* * *')
    expect(lineas(t[2])[0]).toBe('<p>dos</p>')
  })

  it('los versos se cierran antes de una ilustracion, dentro del tramo anterior', () => {
    const t = secuencia(
      [{ tipo: 'verso', html: 'v' }, { tipo: 'ilus', nombre: 'a', alt: 'x' }],
      '* * *',
    )
    expect(lineas(t[0])).toEqual(['<div class="versos">\n<p>v</p>\n</div>'])
    expect(t[1]?.tipo).toBe('ilus')
  })

  it('una estrofa suelta antes del primer verso no genera clase', () => {
    const t = secuencia([{ tipo: 'estrofa' }, { tipo: 'verso', html: 'v' }], '* * *')
    expect(lineas(t[0])[0]).toBe('<div class="versos">\n<p>v</p>\n</div>')
  })

  it('una estrofa entre versos si genera la clase', () => {
    const t = secuencia(
      [
        { tipo: 'verso', html: 'a' },
        { tipo: 'estrofa' },
        { tipo: 'verso', html: 'b' },
      ],
      '* * *',
    )
    expect(lineas(t[0])[0]).toBe(
      '<div class="versos">\n<p>a</p>\n<p class="estrofa">b</p>\n</div>',
    )
  })

  it('sin bloques no hay tramos', () => {
    expect(secuencia([], '* * *')).toEqual([])
  })
})

describe('parsear sin titulo (dedicatoria y epigrafe)', () => {
  it('no consume la primera linea como titulo', () => {
    const r = parsear('Para quien lea esto.\nY para nadie mas.', false)
    expect(r.titulo).toBeNull()
    expect(r.bloques).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// BUG REPLICADO: escapar un marcador de BLOQUE no lo desactiva.
//
// La deteccion se hace sobre la linea DESESCAPADA (asi que el marcador se
// reconoce igual) pero el contenido se toma de la linea ORIGINAL (asi que
// encima queda basura visible). El escritor sigue la documentacion, escapa el
// marcador, y acaba con una barra invertida o una almohadilla impresas en su
// libro. Es el bug mas visible de los encontrados.
//
// Se replica para no romper la paridad; la correccion esta anotada en el plan.
// ---------------------------------------------------------------------------

describe('DIVERGENCIA: escapar un marcador de bloque SI lo desactiva', () => {
  // El Python clasificaba la linea sobre su version DESESCAPADA, asi que el
  // escape no servia de nada y encima dejaba basura impresa en el libro. Aqui
  // se clasifica sobre la linea ORIGINAL. Ver tests/divergencias.ts.
  //
  // Esto es lo que permite que la interfaz grafica no pierda nada: su modelo de
  // bloques se serializa a este dialecto para alimentar al motor y para el .zip
  // del proyecto, y un parrafo que empiece por «>», «#» o «* * *» tiene que
  // poder escaparse o se convertiria en otro tipo de bloque al releerlo.

  it('«\\> cita» es un parrafo, y sin barra visible', () => {
    const r = parsear('T\n\\> cita')
    expect(r.bloques[0]).toEqual({ tipo: 'p', html: '&gt; cita' })
  })

  it('una marca de ilustracion escapada sale como texto literal', () => {
    const r = parsear('T\n\\[ilustración: x | y\\]')
    expect(r.bloques[0]).toEqual({ tipo: 'p', html: '[ilustración: x | y]' })
  })

  it('«\\# algo» es un parrafo que empieza por almohadilla', () => {
    const r = parsear('T\n\\# no subtitulo')
    expect(r.bloques[0]).toEqual({ tipo: 'p', html: '# no subtitulo' })
  })

  it('«\\* \\* \\*» es un parrafo, no un cambio de escena', () => {
    expect(parsear('T\n\\* \\* \\*').bloques[0]).toEqual({ tipo: 'p', html: '* * *' })
  })

  it('sin escapar, los marcadores siguen funcionando exactamente igual', () => {
    expect(parsear('T\n> cita').bloques[0]).toEqual({ tipo: 'verso', html: 'cita' })
    expect(parsear('T\n#  sub').bloques[0]).toEqual({ tipo: 'sub', html: 'sub' })
    expect(parsear('T\n* * *').bloques[0]).toEqual({ tipo: 'escena' })
    expect(parsear('T\n[ilustración: x | y]').bloques[0]).toEqual({
      tipo: 'ilus',
      nombre: 'x',
      alt: 'y',
    })
  })

  it('el nombre y la descripcion de la marca se desescapan, como antes', () => {
    const r = parsear('T\n[ilustración: cap01-01 | con \\* asterisco \\*]')
    expect(r.bloques[0]).toEqual({ tipo: 'ilus', nombre: 'cap01-01', alt: 'con * asterisco *' })
  })

  it('dentro de un parrafo el escape seguia funcionando y sigue igual', () => {
    const r = parsear('T\nTexto con \\*asteriscos\\* y \\[corchetes\\].')
    expect(r.bloques[0]).toEqual({
      tipo: 'p',
      html: 'Texto con *asteriscos* y [corchetes].',
    })
  })
})

describe('parsear: otros detalles', () => {
  it('la primera linea no vacia se consume como titulo aunque no sea cabecera', () => {
    expect(parsear('El faro\nTexto.').titulo).toBe('El faro')
  })

  it('un archivo vacio no deja titulo', () => {
    expect(parsear('').titulo).toBeNull()
    expect(parsear('\n\n  \n').titulo).toBeNull()
  })
})
