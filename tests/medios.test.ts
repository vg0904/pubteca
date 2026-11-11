import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { construir, type Construccion } from '../src/core/construir'
import { CSS_MEDIOS } from '../src/core/css'
import { parsear } from '../src/core/parser'
import { archivo, type Proyecto } from '../src/core/proyecto'
import { secuencia, type Tramo } from '../src/core/secuencia'
import { leerProyecto } from '../scripts/leer-proyecto'

/**
 * Audio y video en el EPUB de Apple Books (hito M1 de la ronda 2).
 *
 * El fixture es tests/fixtures/libro-medios: un video con su poster y dos
 * audios, uno de ellos SOLO en una pagina (tras una ilustracion), que es el
 * caso en que a Kindle le quedaria una pagina vacia. Los medios los genera
 * scripts/medios-prueba.py.
 *
 * Lo que fija cada bloque esta medido en la fase 0 contra EPUBCheck 5.3.0 y
 * 5.4.0 (plan.md): CI pasa este mismo libro por los dos.
 */

const RAIZ = join(import.meta.dirname, '..')
const FIXTURE = join(RAIZ, 'tests', 'fixtures', 'libro-medios')
const AHORA = new Date('2026-11-11T12:00:00Z')

const utf8 = (b: Uint8Array | undefined): string => new TextDecoder('utf-8').decode(b)
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

function epub(c: Construccion, tienda: 'Kindle' | 'AppleBooks'): Map<string, Uint8Array> {
  const r = c.resultados.find((x) => x.tienda === tienda)
  if (!r) throw new Error(`no hay EPUB de ${tienda}`)
  return new Map(Object.entries(unzipSync(r.bytes as Uint8Array)))
}

/** Metodo de compresion de cada entrada, leido de las cabeceras locales. */
function metodos(bytes: Uint8Array): Map<string, number> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const r = new Map<string, number>()
  let i = 0
  while (i + 30 <= bytes.length && dv.getUint32(i, true) === 0x04034b50) {
    const comprimido = dv.getUint32(i + 18, true)
    const largo = dv.getUint16(i + 26, true)
    const extra = dv.getUint16(i + 28, true)
    r.set(utf8(bytes.subarray(i + 30, i + 30 + largo)), dv.getUint16(i + 8, true))
    i += 30 + largo + extra + comprimido
  }
  return r
}

/** Las paginas del spine, en orden, como rutas dentro del EPUB. */
function spine(e: Map<string, Uint8Array>): string[] {
  const opf = utf8(e.get('OEBPS/content.opf'))
  const porId = new Map<string, string>()
  for (const m of opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/gu)) porId.set(m[1] as string, `OEBPS/${m[2]}`)
  return [...opf.matchAll(/<itemref idref="([^"]+)"/gu)].map((m) => porId.get(m[1] as string) as string)
}

/**
 * Lo que EPUBCheck comprueba con NAV-011: el indice sigue el orden de lectura.
 * Cada enlace, en el orden del nav, tiene que caer en la misma pagina o en una
 * posterior del spine, y dentro de la misma pagina, en un id posterior.
 */
function enOrdenDeLectura(e: Map<string, Uint8Array>): string[] {
  const orden = spine(e)
  const nav = utf8(e.get('OEBPS/texto/nav.xhtml'))
  const toc = nav.slice(nav.indexOf('<nav epub:type="toc"'), nav.indexOf('</nav>'))
  const fallos: string[] = []
  let previo = { pagina: -1, pos: -1 }
  for (const m of toc.matchAll(/<a href="([^"#]+)(?:#([^"]+))?"/gu)) {
    const ruta = `OEBPS/texto/${m[1]}`
    const pagina = orden.indexOf(ruta)
    const pos = m[2] ? utf8(e.get(ruta)).indexOf(`id="${m[2]}"`) : 0
    if (pagina === -1 || pos === -1) fallos.push(`${m[0]}: destino inexistente`)
    else if (pagina < previo.pagina || (pagina === previo.pagina && pos < previo.pos)) fallos.push(`${m[0]}: fuera de orden`)
    previo = { pagina, pos }
  }
  return fallos
}

/** Todo lo que una pagina pide (src y poster) tiene que estar en el manifiesto. */
function referenciasRotas(e: Map<string, Uint8Array>): string[] {
  const opf = utf8(e.get('OEBPS/content.opf'))
  const enManifiesto = new Set([...opf.matchAll(/href="([^"]+)"/gu)].map((m) => `OEBPS/${m[1]}`))
  const rotas: string[] = []
  for (const [ruta, datos] of e) {
    if (!ruta.endsWith('.xhtml')) continue
    for (const m of utf8(datos).matchAll(/\b(?:src|poster)="\.\.\/([^"]+)"/gu)) {
      const destino = `OEBPS/${m[1]}`
      if (!enManifiesto.has(destino) || !e.has(destino)) rotas.push(`${ruta} -> ${destino}`)
    }
  }
  return rotas
}

const c = construir(leerProyecto(FIXTURE), { ahora: AHORA })
const apple = epub(c, 'AppleBooks')
const kindle = epub(c, 'Kindle')

describe('el libro con medios se construye sin errores', () => {
  it('no hay errores ni avisos, y las notas dicen lo que hay que saber', () => {
    expect(c.bloqueado).toBeNull()
    expect(c.diagnosticos.errores).toEqual([])
    expect(c.diagnosticos.avisos).toEqual([])
    expect(c.diagnosticos.notas).toContain(
      '1 video y 2 audios solo van en el EPUB de Apple Books: KDP no acepta libros con audio ni video, ' +
        'así que el de Kindle sale sin ellos.',
    )
    expect(c.diagnosticos.notas).toContain(
      'Audio y video sin descripción (la leen los lectores de pantalla): capitulos/cap02.md → cap02-a01',
    )
  })

  it('el reporte cuenta los medios de cada capitulo', () => {
    expect(c.libro.resumenCaps.map((r) => [r.archivo, r.videos, r.audios])).toEqual([
      ['cap01.md', 1, 1],
      ['cap02.md', 0, 1],
    ])
  })
})

describe('Apple Books recibe los medios como los pide Apple', () => {
  const opf = utf8(apple.get('OEBPS/content.opf'))
  const cap01 = utf8(apple.get('OEBPS/texto/cap01.xhtml'))

  it('los archivos viajan tal cual y SIN comprimir', () => {
    const bytes = c.resultados.find((r) => r.tienda === 'AppleBooks')?.bytes as Uint8Array
    const m = metodos(bytes)
    for (const [enEpub, original] of [
      ['OEBPS/medios/cap01-v01.m4v', 'cap01-v01.m4v'],
      ['OEBPS/medios/cap01-a01.m4a', 'cap01-a01.m4a'],
      ['OEBPS/medios/cap02-a01.m4a', 'cap02-a01.m4a'],
      ['OEBPS/imagenes/cap01-v01.jpg', 'cap01-v01.jpg'],
    ] as const) {
      expect(sha256(apple.get(enEpub) as Uint8Array), enEpub).toBe(sha256(readFileSync(join(FIXTURE, 'medios', original))))
    }
    expect(m.get('OEBPS/medios/cap01-v01.m4v')).toBe(0)
    expect(m.get('OEBPS/medios/cap01-a01.m4a')).toBe(0)
  })

  it('el media-type del audio es audio/mp4, no el audio/m4a del ejemplo de Apple', () => {
    // audio/m4a no es un tipo central de EPUB 3.3: EPUBCheck da RSC-032.
    expect(opf).toContain('<item id="medio-cap01-a01" href="medios/cap01-a01.m4a" media-type="audio/mp4"/>')
    expect(opf).toContain('<item id="medio-cap01-v01" href="medios/cap01-v01.m4v" media-type="video/mp4"/>')
    expect(opf).not.toMatch(/audio\/(x-)?m4a/u)
  })

  it('el video lleva su poster y controles, sin alto y sin autoplay', () => {
    expect(cap01).toContain(
      '<div class="medio" id="video-cap01-01"><video src="../medios/cap01-v01.m4v" poster="../imagenes/cap01-v01.jpg" ' +
        'controls="controls" aria-label="El faro visto desde el muelle al amanecer"></video></div>',
    )
    expect(cap01).toContain(
      '<div class="medio" id="audio-cap01-01"><audio src="../medios/cap01-a01.m4a" controls="controls" ' +
        'aria-label="Un tono largo, como una sirena lejana"></audio></div>',
    )
    expect(cap01).not.toMatch(/autoplay|height=/u)
  })

  it('el medio va dentro del texto y no reinicia el parrafo primero', () => {
    // Un solo XHTML para el capitulo 1: el video no lo parte.
    expect(apple.has('OEBPS/texto/cap01-2.xhtml')).toBe(false)
    // Tras el video, el parrafo sigue el hilo: sin clase «primero».
    expect(cap01).toMatch(/<\/video><\/div>\n<p>La película/u)
  })

  it('la hoja de estilo trae las reglas de medios, con ancho y sin alto', () => {
    const css = utf8(apple.get('OEBPS/estilos/estilo.css'))
    expect(css.endsWith(CSS_MEDIOS)).toBe(true)
    expect(CSS_MEDIOS).toMatch(/div\.medio video \{ width: 100%; \}/u)
    expect(CSS_MEDIOS).not.toMatch(/height/u)
    expect(CSS_MEDIOS).toMatch(/div\.medio \{[^}]*text-align: center/u)
  })

  it('el indice lleva los medios anidados bajo su capitulo', () => {
    const nav = utf8(apple.get('OEBPS/texto/nav.xhtml'))
    expect(nav).toContain(
      '<li><a href="cap01.xhtml">Capítulo 1: La cinta</a>\n<ol>\n' +
        '<li><a href="cap01.xhtml#video-cap01-01">Video: El faro visto desde el muelle al amanecer</a></li>\n' +
        '<li><a href="cap01.xhtml#audio-cap01-01">Audio: Un tono largo, como una sirena lejana</a></li>\n' +
        '</ol>\n</li>',
    )
    // Sin descripcion, la entrada no puede quedar vacia.
    expect(nav).toContain('<li><a href="cap02-2.xhtml#audio-cap02-01">Audio 1</a></li>')
  })

  it('los metadatos de accesibilidad dicen la verdad', () => {
    expect(opf).toContain('<meta property="schema:accessMode">auditory</meta>')
    expect(opf).toContain('<meta property="schema:accessMode">visual</meta>')
    // Sin subtitulos ni transcripcion, el texto solo no basta.
    expect(opf).toContain('<meta property="schema:accessModeSufficient">textual,visual,auditory</meta>')
    expect(opf).not.toContain('<meta property="schema:accessModeSufficient">textual</meta>')
    expect(opf).toContain('<meta property="schema:accessibilityHazard">unknown</meta>')
    expect(opf).toContain('Incluye 1 video y 2 audios, sin subtítulos ni transcripción.')
  })

  it('el indice sigue el orden de lectura (lo que EPUBCheck mira con NAV-011)', () => {
    expect(enOrdenDeLectura(apple)).toEqual([])
  })

  it('nada referencia un archivo que no este en el paquete', () => {
    expect(referenciasRotas(apple)).toEqual([])
  })
})

describe('Kindle sale sin medios', () => {
  it('ni un byte de medio ni de poster', () => {
    expect([...kindle.keys()].filter((r) => r.includes('medios/') || r.includes('cap01-v01'))).toEqual([])
    for (const [ruta, datos] of kindle) {
      if (ruta.endsWith('.xhtml') || ruta.endsWith('.opf') || ruta.endsWith('.css')) {
        expect(utf8(datos), ruta).not.toMatch(/<video|<audio|div\.medio|class="medio"|audio\/mp4|video\/mp4|auditory/u)
      }
    }
  })

  it('la pagina que solo tenia un audio no existe en Kindle', () => {
    expect(apple.has('OEBPS/texto/cap02-2.xhtml')).toBe(true)
    expect(kindle.has('OEBPS/texto/cap02-2.xhtml')).toBe(false)
    expect(utf8(kindle.get('OEBPS/content.opf'))).not.toContain('cap02-2')
  })

  it('el resto del texto es el mismo que en Apple Books, linea a linea, sin los medios', () => {
    const sinMedios = (s: string): string => s.replace(/^<div class="medio"[^\n]*\n/gmu, '')
    for (const ruta of ['OEBPS/texto/cap01.xhtml', 'OEBPS/texto/cap02.xhtml']) {
      expect(utf8(kindle.get(ruta)), ruta).toBe(sinMedios(utf8(apple.get(ruta))))
    }
  })

  it('su indice no tiene entradas de medios, y sigue en orden', () => {
    const nav = utf8(kindle.get('OEBPS/texto/nav.xhtml'))
    expect(nav).not.toMatch(/#video-|#audio-|<\/a>\n<ol>/u)
    expect(enOrdenDeLectura(kindle)).toEqual([])
    expect(referenciasRotas(kindle)).toEqual([])
  })

  it('sus metadatos de accesibilidad son los de un libro sin medios', () => {
    const opf = utf8(kindle.get('OEBPS/content.opf'))
    expect(opf).toContain('<meta property="schema:accessibilityHazard">none</meta>')
    expect(opf).not.toContain('Incluye')
  })
})

describe('un libro sin medios no cambia', () => {
  const prueba = leerProyecto(join(RAIZ, 'tests', 'fixtures', 'libro-prueba'))

  it('una carpeta medios/ vacia da los mismos bytes que no tenerla', () => {
    const sin = construir(prueba, { ahora: AHORA })
    const vacia = construir({ ...prueba, medios: [] }, { ahora: AHORA })
    for (const [i, r] of sin.resultados.entries()) {
      expect(sha256(vacia.resultados[i]?.bytes as Uint8Array), r.tienda).toBe(sha256(r.bytes as Uint8Array))
    }
  })

  it('el indice del libro de prueba tambien sigue el orden de lectura', () => {
    const sin = construir(prueba, { ahora: AHORA })
    expect(enOrdenDeLectura(epub(sin, 'AppleBooks'))).toEqual([])
    expect(enOrdenDeLectura(epub(sin, 'Kindle'))).toEqual([])
  })
})

describe('las marcas de audio y video', () => {
  const bloques = (texto: string) => parsear(`Capítulo 1: T\n\n${texto}`).bloques

  it('se reconocen con y sin tilde, con y sin descripcion', () => {
    expect(bloques('[video: cap01-v01 | El muelle]')).toEqual([{ tipo: 'medio', clase: 'video', nombre: 'cap01-v01', alt: 'El muelle' }])
    expect(bloques('[Vídeo: x]')).toEqual([{ tipo: 'medio', clase: 'video', nombre: 'x', alt: '' }])
    expect(bloques('[audio:nota.m4a|Una voz]')).toEqual([{ tipo: 'medio', clase: 'audio', nombre: 'nota.m4a', alt: 'Una voz' }])
  })

  it('escapar la marca la desactiva, igual que la de ilustracion', () => {
    expect(bloques('\\[video: x | y]')).toEqual([{ tipo: 'p', html: '[video: x | y]' }])
  })

  it('dentro de una frase no es una marca', () => {
    expect(bloques('Vio el [video: x] en la tele.')[0]?.tipo).toBe('p')
  })

  it('la secuencia no parte el tramo, no reinicia «primero» y cierra los versos', () => {
    const medio = { tipo: 'medio', clase: 'audio', nombre: 'n', alt: '' } as const
    const t = secuencia(
      [{ tipo: 'p', html: 'a' }, medio, { tipo: 'p', html: 'b' }, { tipo: 'verso', html: 'v' }, medio, { tipo: 'p', html: 'c' }],
      '* * *',
      () => ({ html: '<M/>', id: 'm', entrada: 'e' }),
    )
    const unico = t[0] as Extract<Tramo, { tipo: 'texto' }>
    expect(t).toHaveLength(1)
    // «b» sigue el hilo de «a»; «c» va tras unos versos, que si reinician.
    expect(unico.lineas).toEqual([
      '<p class="primero">a</p>',
      '<M/>',
      '<p>b</p>',
      '<div class="versos">\n<p>v</p>\n</div>',
      '<M/>',
      '<p class="primero">c</p>',
    ])
    expect(unico.medios?.map((m) => m.linea)).toEqual([1, 4])
  })

  it('sin quien los resuelva, los medios no se pintan y el tramo no lleva medios', () => {
    const t = secuencia([{ tipo: 'p', html: 'a' }, { tipo: 'medio', clase: 'video', nombre: 'n', alt: '' }], '* * *')
    expect(t).toEqual([{ tipo: 'texto', lineas: ['<p class="primero">a</p>'] }])
  })
})

describe('lo que se dice cuando algo no esta bien', () => {
  const base = leerProyecto(FIXTURE)
  const medios = base.medios ?? []
  const sinArchivo = (nombre: string) => medios.filter((a) => a.nombre !== nombre)
  const capitulo = (texto: string): Proyecto['capitulos'] => [archivo('capitulos/cap01.md', new TextEncoder().encode(`Capítulo 1: T\n\n${texto}\n`))]
  const con = (p: Partial<Proyecto>) => construir({ ...base, ...p }, { ahora: AHORA }).diagnosticos

  it('un video sin poster es un error: Apple no lo acepta', () => {
    const dg = con({ medios: sinArchivo('cap01-v01.jpg'), capitulos: capitulo('[video: cap01-v01 | x]') })
    expect(dg.errores.join('\n')).toMatch(/el video «cap01-v01» no tiene póster/u)
  })

  it('una marca que pide un archivo que no esta', () => {
    const dg = con({ capitulos: capitulo('[audio: no-existe | x]') })
    expect(dg.errores).toContain('capitulos/cap01.md: la marca pide «no-existe», pero no hay medios/no-existe.m4a.')
  })

  it('una marca de video que apunta a un audio', () => {
    const dg = con({ capitulos: capitulo('[video: cap01-a01 | x]') })
    expect(dg.errores).toContain('capitulos/cap01.md: la marca pide un video, pero medios/cap01-a01.m4a es un audio.')
  })

  it('un formato que Apple no acepta se ignora con un aviso, y lo que no se usa tambien se dice', () => {
    const dg = con({ medios: [...medios, archivo('medios/nota.mp3', new Uint8Array([1, 2, 3]))], capitulos: capitulo('Solo texto.') })
    expect(dg.avisos).toContain('medios/nota.mp3: Apple Books solo acepta video en .m4v o .mp4 y audio en .m4a; lo ignoré.')
    expect(dg.avisos).toContain('medios/cap01-v01.m4v: no está marcado en ningún capítulo, así que no entró al libro.')
  })
})
