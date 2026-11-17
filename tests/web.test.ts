import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync, unzlibSync, zlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { construir } from '../src/core/construir'
import { cuerpoDe, xhtml } from '../src/core/plantillas'
import type { Proyecto } from '../src/core/proyecto'
import { IDIOMAS_DEL_LIBRO } from '../src/core/textos-libro'
import { CONFIG_WEB_POR_DEFECTO, enlacesValidos, normalizarWeb, urlSegura, type ConfigWeb } from '../src/core/web/config'
import { construirWeb, type LibroWeb } from '../src/core/web/construir'
import { cssWeb } from '../src/core/web/css'
import { LETRAS_WEB, letraDelSistema } from '../src/core/web/letras'
import { IDIOMAS_DEL_LIBRO_WEB, textosWeb } from '../src/core/web/textos'
import { aWoff } from '../src/core/web/woff'
import { leerProyecto } from '../scripts/leer-proyecto'

// El libro para la web, en el core: sale del mismo `Libro` que los EPUB, junta
// cada capitulo en una sola parte, publica solo lo que el autor deja, y no
// toca ni un byte de los EPUB (eso lo vigilan los golden, que siguen igual).

const RAIZ = join(import.meta.dirname, '..')
const PRUEBA = leerProyecto(join(RAIZ, 'tests', 'fixtures', 'libro-prueba'))
const MEDIOS = leerProyecto(join(RAIZ, 'tests', 'fixtures', 'libro-medios'))
const AHORA = new Date('2026-11-16T12:00:00Z')
const LECTOR = readFileSync(join(RAIZ, 'src', 'lector', 'lector.js'), 'utf8')
const LEEME = readFileSync(join(RAIZ, 'src', 'lector', 'LEEME.es.md'), 'utf8')
const DIR_LETRAS = join(RAIZ, 'public', 'fuentes', 'impreso')
const LETRAS = new Map(readdirSync(DIR_LETRAS).map((n) => [n, new Uint8Array(readFileSync(join(DIR_LETRAS, n)))]))

function web(p: Proyecto = PRUEBA, config: Partial<ConfigWeb> = {}, letras?: ReadonlyMap<string, Uint8Array>): LibroWeb {
  return construirWeb(p, { ahora: AHORA, lector: LECTOR, leeme: LEEME, config: { ...CONFIG_WEB_POR_DEFECTO, ...config }, ...(letras ? { letras } : {}) })
}

const texto = (w: LibroWeb, ruta: string): string => {
  const a = w.archivos.find((x) => x.ruta === ruta)
  if (!a) throw new Error(`${ruta}: no está en el zip`)
  return new TextDecoder().decode(a.datos)
}
const rutas = (w: LibroWeb): string[] => w.archivos.map((a) => a.ruta)

describe('el libro web del libro de prueba', () => {
  const w = web()
  const m = w.manifiesto

  it('se genera, sin errores, con lo que hay que llevar', () => {
    expect(w.bloqueado).toBeNull()
    expect(w.diagnosticos.errores).toEqual([])
    expect(rutas(w).slice(0, 5)).toEqual(['index.html', 'lector.js', 'LEEME.md', 'libro/libro.json', 'libro/libro.css'])
    expect(texto(w, 'lector.js')).toBe(LECTOR)
    expect(texto(w, 'LEEME.md')).toBe(LEEME)
    expect(w.nombreArchivo).toBe('el_faro_de_ibar_web.zip')
  })

  it('las partes van en el orden de una web: laminas, extras del principio, capitulos, extras del final, derechos, contraportada', () => {
    expect(m?.partes.map((p) => [p.id, p.clase, p.indice])).toEqual([
      ['laminas', 'laminas', false],
      ['extra-dedicatoria', 'dedicatoria', false],
      ['extra-inicio-nota', 'extra', true],
      ['cap01', 'capitulo', true],
      ['cap02', 'capitulo', true],
      ['cap04', 'capitulo', true],
      ['cap05-epilogo', 'capitulo', true],
      ['extra-agradecimientos', 'extra', true],
      ['derechos', 'derechos', false],
      ['contraportada', 'contraportada', false],
    ])
    expect(m?.partes.every((p) => rutas(w).includes(`libro/${p.archivo}`))).toBe(true)
    // Sin portada ni portadilla como partes: el lector las monta del manifiesto.
    expect(rutas(w).some((r) => /^libro\/(portadilla|portada|nav)\.html$/u.test(r))).toBe(false)
  })

  it('los titulos de las partes son los del indice del EPUB', () => {
    const c = construir(PRUEBA, { ahora: AHORA })
    const delEpub = c.libro.indice.map((e) => e.texto)
    expect(m?.partes.filter((p) => p.indice).map((p) => p.titulo)).toEqual(delEpub)
  })

  it('un capitulo es UNA parte: las paginas que el EPUB partio por las ilustraciones vuelven a juntarse', () => {
    const cap02 = texto(w, 'libro/cap02.html')
    const c = construir(PRUEBA, { ahora: AHORA })
    const paginas = c.libro.paginas.filter((p) => p.href.startsWith('texto/cap02'))
    expect(paginas.length).toBeGreaterThan(1)
    // Todo el texto de esas paginas esta, en el mismo orden.
    const parrafos = (html: string): string[] => [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gu)].map((x) => x[1] as string)
    expect(parrafos(cap02)).toEqual(paginas.flatMap((p) => parrafos(cuerpoDe(p.contenidoKindle ?? p.contenido))))
    // El dibujo de apertura va antes de la cabecera, y el del medio, en medio.
    expect(cap02.indexOf('cap02-00.png')).toBeLessThan(cap02.indexOf('class="cabecera"'))
    expect(cap02.indexOf('cap02-01.png')).toBeGreaterThan(cap02.indexOf('No vuelva.'))
  })

  it('el HTML es HTML: sin epub:type, imagenes junto a la pagina, con su tamaño y diferidas', () => {
    for (const p of m?.partes ?? []) {
      const html = texto(w, `libro/${p.archivo}`)
      expect(html, p.id).not.toContain('epub:')
      expect(html, p.id).not.toContain('src="../')
      expect(html).toMatch(/^<!doctype html>\n<html lang="es">/u)
      expect(html).toContain('<link rel="stylesheet" href="libro.css">')
      expect(html).toContain(`<main id="${p.id}" class="pubteca-parte" data-clase="${p.clase}">`)
    }
    expect(texto(w, 'libro/cap01.html')).toMatch(/<img src="imagenes\/cap01-01\.png" width="\d+" height="\d+" loading="lazy" alt="/u)
  })

  it('cada parte suelta enlaza con la anterior, la siguiente y el lector', () => {
    const cap01 = texto(w, 'libro/cap01.html')
    expect(cap01).toContain('<a rel="prev" href="extra-inicio-nota.html">')
    expect(cap01).toContain('<a rel="next" href="cap02.html">')
    expect(cap01).toContain('<a href="../index.html#cap01">El faro de Ibar</a>')
    expect(texto(w, 'libro/laminas.html')).not.toContain('rel="prev"')
    expect(texto(w, 'libro/contraportada.html')).not.toContain('rel="next"')
  })

  it('solo van las imagenes que se enseñan: ni el logo de la portadilla', () => {
    const imagenes = rutas(w).filter((r) => r.startsWith('libro/imagenes/'))
    expect(imagenes).toContain('libro/imagenes/portada.png')
    expect(imagenes.some((r) => r.includes('logo'))).toBe(false)
    for (const r of imagenes) {
      const nombre = r.slice('libro/'.length)
      const enAlgunSitio = nombre === m?.portada?.src || rutas(w).some((x) => x.endsWith('.html') && texto(w, x).includes(`src="${nombre}"`))
      expect(enAlgunSitio, r).toBe(true)
    }
  })

  it('el manifiesto lleva los datos, la portada y los textos del lector en el idioma del libro', () => {
    expect(m).toMatchObject({
      formato: 'pubteca-web',
      version: 1,
      titulo: 'El faro de Ibar',
      autor: 'Ana Ruiz Mendoza',
      idioma: 'es',
      estilo: 'libro.css',
      muestra: false,
      portada: { src: 'imagenes/portada.png', ancho: 1600, alto: 2560 },
    })
    expect(m?.id).toBe(construir(PRUEBA, { ahora: AHORA }).uid)
    expect(m?.textos.empezar).toBe('Empezar a leer')
    expect(JSON.parse(texto(w, 'libro/libro.json'))).toEqual(m)
  })

  it('index.html lleva el manifiesto dentro, sin dejar que cierre su <script>, y un indice para quien no tiene JavaScript', () => {
    const index = texto(w, 'index.html')
    const json = /<script type="application\/json">([\s\S]*?)<\/script>/u.exec(index)?.[1] ?? ''
    expect(JSON.parse(json)).toEqual(m)
    expect(index).toContain('<pubteca-lector src="libro/libro.json" pagina>')
    expect(index).toContain('<li><a href="libro/cap01.html">Capítulo 1: La luz que no tocaba</a></li>')
    // Un titulo con «</script>» no puede romper la pagina: siguen siendo los
    // dos cierres de siempre, el del lector y el del manifiesto.
    const raro = web({ ...PRUEBA, libroTxt: `${PRUEBA.libroTxt}\ntitulo: Fin</script><script>alert(1)</script>\n` })
    const idx = texto(raro, 'index.html')
    expect(idx.match(/<\/script>/gu)?.length).toBe(2)
    expect(idx).toContain('\\u003c/script>')
  })

  it('con el mismo reloj, el mismo zip byte a byte; y el zip contiene lo que dice', () => {
    expect(web().bytes).toEqual(w.bytes)
    const dentro = unzipSync(w.bytes)
    expect(Object.keys(dentro)).toEqual(rutas(w))
    expect(dentro['libro/libro.css']).toEqual(w.archivos.find((a) => a.ruta === 'libro/libro.css')?.datos)
  })

  it('la hoja es la de Kindle mas lo de la web, sin colores ni fondos', () => {
    const css = cssWeb()
    // Sin letras, la del aparato: solo su font-family para las partes sueltas.
    expect(texto(w, 'libro/libro.css')).toBe(cssWeb(letraDelSistema('Del sistema')))
    expect(texto(w, 'libro/libro.css').startsWith(css)).toBe(true)
    expect(css).not.toMatch(/(^|[\s;{])(color|background(-color)?)\s*:\s*#/mu)
    expect(css).not.toContain('font-face')
  })

  it('los avisos de tienda no se cuelan: aqui no hay Kindle ni Apple Books', () => {
    const todo = [...w.diagnosticos.avisos, ...w.diagnosticos.notas].join('\n')
    expect(todo).not.toMatch(/Kindle|Apple Books/u)
  })
})

describe('una muestra', () => {
  const w = web(PRUEBA, { omitidos: ['capitulos/cap04.md', 'capitulos/cap05-epilogo.md', 'extras/agradecimientos.md'], enlaces: [{ etiqueta: 'Amazon', url: 'amazon.com/dp/B000' }] })

  it('lleva solo lo publicado, los nombres de lo que queda no cambian, y lo dice', () => {
    expect(w.manifiesto?.muestra).toBe(true)
    const ids = w.manifiesto?.partes.map((p) => p.id) ?? []
    expect(ids).toContain('cap02')
    expect(ids).not.toContain('cap04')
    expect(ids).not.toContain('extra-agradecimientos')
    expect(ids.at(-1)).toBe('sigue-leyendo')
    const fin = texto(w, 'libro/sigue-leyendo.html')
    expect(fin).toContain('Aquí termina esta muestra.')
    expect(fin).toContain('<a class="enlace-libro" href="https://amazon.com/dp/B000" target="_blank" rel="noopener">Amazon</a>')
  })

  it('«faltan capitulos en la numeracion» no se dice: es lo que el autor pidio', () => {
    expect(w.diagnosticos.notas.some((n) => n.startsWith('Faltan capítulos'))).toBe(false)
  })

  it('las ilustraciones de lo omitido no viajan', () => {
    const solo = web(PRUEBA, { omitidos: ['capitulos/cap02.md'] })
    expect(rutas(solo).some((r) => r.includes('cap02-'))).toBe(false)
    expect(rutas(solo)).toContain('libro/imagenes/cap01-01.png')
  })

  it('sin ningun capitulo, no se genera', () => {
    const nada = web(PRUEBA, { omitidos: PRUEBA.capitulos.map((a) => a.ruta) })
    expect(nada.bloqueado).toMatch(/ningún capítulo/u)
    expect(nada.bytes.length).toBe(0)
  })
})

describe('el libro entero con enlaces', () => {
  it('termina en «Consigue el libro», que sale en el indice', () => {
    const w = web(PRUEBA, { enlaces: [{ etiqueta: '', url: 'https://www.amazon.com/dp/B000' }, { etiqueta: 'Malo', url: 'javascript:alert(1)' }] })
    const ultima = w.manifiesto?.partes.at(-1)
    expect(ultima).toMatchObject({ id: 'sigue-leyendo', clase: 'enlaces', titulo: 'Consigue el libro', indice: true })
    const fin = texto(w, 'libro/sigue-leyendo.html')
    expect(fin).toContain('Este libro también está disponible en:')
    // Sin nombre, el dominio; y lo que no es una direccion web no llega.
    expect(fin).toContain('>amazon.com</a>')
    expect(fin).not.toContain('javascript')
  })

  it('sin enlaces y sin omitir nada, no hay pagina del final', () => {
    expect(web().manifiesto?.partes.some((p) => p.clase === 'enlaces')).toBe(false)
  })
})

describe('un libro con audio y video', () => {
  const w = web(MEDIOS)

  it('sale sin ellos, sin paginas vacias, y dice cuantos se quedaron fuera', () => {
    expect(w.bloqueado).toBeNull()
    expect(w.sinMedios).toEqual({ videos: 1, audios: 2 })
    expect(rutas(w).some((r) => /\.(m4v|m4a)$/u.test(r))).toBe(false)
    for (const r of rutas(w).filter((x) => x.endsWith('.html'))) {
      expect(texto(w, r), r).not.toMatch(/<(video|audio)\b/u)
    }
  })

  it('un libro sin medios no dice nada de ellos', () => {
    expect(web().sinMedios).toEqual({ videos: 0, audios: 0 })
  })
})

describe('las piezas', () => {
  it('cuerpoDe deshace xhtml', () => {
    for (const cuerpo of ['<p>hola</p>', '<section>\n<p>a</p>\n<p>b</p>\n</section>', '']) {
      expect(cuerpoDe(xhtml('T', cuerpo, 'es'))).toBe(cuerpo)
      expect(cuerpoDe(xhtml('T', cuerpo, 'es', 'pagina-imagen'))).toBe(cuerpo)
    }
  })

  it('urlSegura: solo http y https, y sin protocolo se entiende https', () => {
    expect(urlSegura('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(urlSegura('amazon.com/dp/X')).toBe('https://amazon.com/dp/X')
    expect(urlSegura('  http://x.org ')).toBe('http://x.org/')
    for (const mala of ['javascript:alert(1)', 'data:text/html,hola', 'ftp://x.org', 'mailto:a@b.c', 'hola', 'con espacio.com', '', 'localhost']) {
      expect(urlSegura(mala), mala).toBeNull()
    }
  })

  it('normalizarWeb lee lo que venga sin perder nada valido', () => {
    expect(normalizarWeb(null)).toEqual(CONFIG_WEB_POR_DEFECTO)
    expect(normalizarWeb({ omitidos: ['a', 'a', 3, 'b'], enlaces: [{ etiqueta: 'X\ny', url: 'x.com' }, 'basura'], aligerar: false, modo: 'paginas', letra: 'eb-garamond' })).toEqual({
      omitidos: ['a', 'b'],
      enlaces: [{ etiqueta: 'X y', url: 'x.com' }],
      aligerar: false,
      modo: 'paginas',
      letra: 'eb-garamond',
    })
    // Un modo o una letra que no existen vuelven a los de fabrica.
    expect(normalizarWeb({ modo: 'carrusel', letra: 'comic-sans' })).toMatchObject({ modo: 'desplazar', letra: 'literata' })
    expect(normalizarWeb({ letra: 'sistema' }).letra).toBe('sistema')
    // Los ids se traducen, y uno que ya no es de nada se suelta.
    expect(normalizarWeb({ omitidos: ['viejo', 'perdido'] }, (v) => (v === 'viejo' ? 'nuevo' : null)).omitidos).toEqual(['nuevo'])
    expect(normalizarWeb({ enlaces: Array.from({ length: 20 }, () => ({ etiqueta: 'a', url: 'a.com' })) }).enlaces).toHaveLength(6)
    expect(enlacesValidos({ ...CONFIG_WEB_POR_DEFECTO, enlaces: [{ etiqueta: ' ', url: 'www.libro.es' }] })).toEqual([{ etiqueta: 'libro.es', url: 'https://www.libro.es/' }])
  })

  it('los textos del lector: los mismos idiomas que el EPUB, y ninguno vacio', () => {
    expect([...IDIOMAS_DEL_LIBRO_WEB].sort()).toEqual([...IDIOMAS_DEL_LIBRO].sort())
    for (const idioma of IDIOMAS_DEL_LIBRO) {
      const t = textosWeb(idioma)
      const vacios = Object.entries({ ...t, ...t.lector }).filter(([, v]) => typeof v === 'string' && !v.trim())
      expect(vacios, idioma).toEqual([])
    }
    expect(textosWeb('en-GB').lector.empezar).toBe('Start reading')
    expect(textosWeb('klingon').lector.empezar).toBe('Empezar a leer')
    expect(textosWeb('de').lector.indice).toBe('Inhalt')
    expect(textosWeb('fr').lector.paginaSiguiente).toBe('Page suivante')
    expect(textosWeb('en').sistema).toBe('System')
  })
})

describe('las letras', () => {
  const w = web(PRUEBA, { modo: 'paginas', letra: 'eb-garamond' }, LETRAS)
  const m = w.manifiesto

  it('van las seis, en su orden y con su nombre de verdad, y la del aparato al final', () => {
    expect(m?.letras.map((l) => l.id)).toEqual([...LETRAS_WEB, 'sistema'])
    expect(m?.letras.map((l) => l.nombre)).toEqual(['Literata', 'Source Serif 4', 'EB Garamond', 'Libre Baskerville', 'Alegreya', 'Crimson Pro', 'Del sistema'])
    expect(m?.letras.at(-1)).toMatchObject({ familia: null, caras: [] })
    expect(m?.lectura).toEqual({ modo: 'paginas', letra: 'eb-garamond' })
  })

  it('cada una con sus cuatro caras en WOFF y su licencia, todo dentro del zip', () => {
    for (const l of m?.letras.filter((x) => x.familia) ?? []) {
      expect(l.familia).toBe(`Pubteca ${l.nombre}`)
      expect(l.caras.map((c) => `${c.peso} ${c.estilo}`)).toEqual(['400 normal', '400 italic', '700 normal', '700 italic'])
      for (const c of l.caras) {
        const datos = w.archivos.find((a) => a.ruta === `libro/${c.src}`)?.datos
        expect(datos, c.src).toBeDefined()
        expect(new TextDecoder().decode((datos as Uint8Array).subarray(0, 4))).toBe('wOFF')
      }
      expect(texto(w, `libro/${l.licencia}`)).toMatch(/SIL OPEN FONT LICENSE/iu)
    }
  })

  it('los WOFF van tal cual en el zip: ya van comprimidos', () => {
    // La cabecera local de cada entrada dice su metodo: 0 es sin comprimir.
    const zip = w.bytes
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    let p = 0
    let vistos = 0
    while (dv.getUint32(p, true) === 0x04034b50) {
      const metodo = dv.getUint16(p + 8, true)
      const comprimido = dv.getUint32(p + 18, true)
      const largoNombre = dv.getUint16(p + 26, true)
      const extra = dv.getUint16(p + 28, true)
      const nombre = new TextDecoder().decode(zip.subarray(p + 30, p + 30 + largoNombre))
      if (nombre.endsWith('.woff')) {
        expect(metodo, nombre).toBe(0)
        vistos++
      }
      p += 30 + largoNombre + extra + comprimido
    }
    expect(vistos).toBe(24)
  })

  it('la hoja lleva la letra del libro para las partes sueltas', () => {
    const css = texto(w, 'libro/libro.css')
    expect(css).toContain('font-family: "Pubteca EB Garamond";')
    expect(css).toContain('src: url("letras/EBGaramond-BoldItalic.woff") format("woff");')
    expect(css).toContain('body.pubteca-pagina { font-family: "Pubteca EB Garamond", Georgia')
  })

  it('una familia incompleta no se ofrece, y si era la elegida se dice y se abre con otra', () => {
    const sinGaramond = new Map([...LETRAS].filter(([n]) => n !== 'EBGaramond-Italic.ttf'))
    const r = web(PRUEBA, { letra: 'eb-garamond' }, sinGaramond)
    expect(r.manifiesto?.letras.some((l) => l.id === 'eb-garamond')).toBe(false)
    expect(r.manifiesto?.lectura.letra).toBe('literata')
    expect(r.diagnosticos.avisos.some((a) => a.includes('letra elegida'))).toBe(true)
    expect(r.archivos.some((a) => a.ruta.includes('EBGaramond'))).toBe(false)
  })

  it('sin licencia, tampoco: la OFL obliga a que viaje con la letra', () => {
    const sinLicencia = new Map([...LETRAS].filter(([n]) => n !== 'OFL-Literata.txt'))
    expect(web(PRUEBA, {}, sinLicencia).manifiesto?.letras.some((l) => l.id === 'literata')).toBe(false)
  })

  it('la del aparato, elegida a proposito, no avisa de nada', () => {
    const r = web(PRUEBA, { letra: 'sistema' }, LETRAS)
    expect(r.manifiesto?.lectura.letra).toBe('sistema')
    expect(r.diagnosticos.avisos.some((a) => a.includes('letra'))).toBe(false)
  })
})

describe('TrueType a WOFF', () => {
  type Tablas = Map<string, { datos: Uint8Array; suma: number }>

  /** Deshace un WOFF: sus tablas, por etiqueta. */
  function tablasDeWoff(woff: Uint8Array): Tablas {
    const dv = new DataView(woff.buffer, woff.byteOffset, woff.byteLength)
    const r: Tablas = new Map()
    for (let i = 0; i < dv.getUint16(12); i++) {
      const p = 44 + 20 * i
      const desde = dv.getUint32(p + 4)
      const comp = dv.getUint32(p + 8)
      const trozo = woff.subarray(desde, desde + comp)
      r.set(new TextDecoder().decode(woff.subarray(p, p + 4)), { datos: comp < dv.getUint32(p + 12) ? unzlibSync(trozo) : trozo, suma: dv.getUint32(p + 16) })
    }
    return r
  }

  function tablasDeTtf(ttf: Uint8Array): Tablas {
    const dv = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength)
    const r: Tablas = new Map()
    for (let i = 0; i < dv.getUint16(4); i++) {
      const p = 12 + 16 * i
      const desde = dv.getUint32(p + 8)
      r.set(new TextDecoder().decode(ttf.subarray(p, p + 4)), { datos: ttf.subarray(desde, desde + dv.getUint32(p + 12)), suma: dv.getUint32(p + 4) })
    }
    return r
  }

  it('cada tabla vuelve igual byte a byte, con su suma, y la cabecera cuadra', () => {
    for (const nombre of ['Literata-Regular.ttf', 'EBGaramond-BoldItalic.ttf', 'SourceSerif4-Italic.ttf']) {
      const ttf = LETRAS.get(nombre) as Uint8Array
      const woff = aWoff(ttf)
      const dv = new DataView(woff.buffer, woff.byteOffset, woff.byteLength)
      expect(dv.getUint32(0), nombre).toBe(0x774f4646)
      expect(dv.getUint32(8), nombre).toBe(woff.length)
      const originales = tablasDeTtf(ttf)
      const vuelta = tablasDeWoff(woff)
      expect([...vuelta.keys()], nombre).toEqual([...originales.keys()].sort())
      for (const [etiqueta, t] of originales) {
        expect(vuelta.get(etiqueta)?.datos, `${nombre} ${etiqueta}`).toEqual(t.datos)
        expect(vuelta.get(etiqueta)?.suma).toBe(t.suma)
      }
      // Lo que mediria la fuente deshecha: cabecera, directorio y tablas alineadas.
      const esperado = 12 + 16 * originales.size + [...originales.values()].reduce((s, t) => s + ((t.datos.length + 3) & ~3), 0)
      expect(dv.getUint32(16), nombre).toBe(esperado)
      expect(woff.length).toBeLessThan(ttf.length * 0.7)
    }
  })

  it('mide un multiplo de 4: sin el relleno de la ultima tabla, Chrome rechaza la fuente', () => {
    // Paso de verdad: tres de las cuatro caras de Literata no cargaban.
    for (const [nombre, ttf] of LETRAS) if (nombre.endsWith('.ttf')) expect(aWoff(ttf).length % 4, nombre).toBe(0)
  })

  it('cada tabla empieza alineada, y la que no gana nada comprimida va tal cual', () => {
    const woff = aWoff(LETRAS.get('Literata-Regular.ttf') as Uint8Array)
    const dv = new DataView(woff.buffer, woff.byteOffset, woff.byteLength)
    for (let i = 0; i < dv.getUint16(12); i++) {
      const p = 44 + 20 * i
      expect(dv.getUint32(p + 8)).toBeLessThanOrEqual(dv.getUint32(p + 12))
      expect(dv.getUint32(p + 4) % 4).toBe(0)
    }
  })

  it('lo que no es una fuente no pasa', () => {
    expect(() => aWoff(new Uint8Array(4))).toThrow()
    expect(() => aWoff(zlibSync(new TextEncoder().encode('hola, no soy una letra')))).toThrow()
  })
})
