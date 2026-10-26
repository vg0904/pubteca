import { describe, expect, it } from 'vitest'
import { CSS, cssLibro } from '../src/core/css'
import { buscarFuentes } from '../src/core/fuentes'
import { Diagnosticos } from '../src/core/mensajes'
import { paginaImagen, xhtml } from '../src/core/plantillas'
import { archivo } from '../src/core/proyecto'
import { conDivergenciasCss } from './divergencias'
import { oraculo } from './oraculo'

describe(`xhtml (${oraculo.xhtml.length} casos del Python)`, () => {
  for (const caso of oraculo.xhtml) {
    it(`${JSON.stringify(caso.titulo)} / clase ${JSON.stringify(caso.clase_body)}`, () => {
      expect(xhtml(caso.titulo, caso.cuerpo, caso.idioma, caso.clase_body)).toBe(caso.salida)
    })
  }

  it('acaba en un solo salto de linea', () => {
    expect(xhtml('T', '<p>a</p>', 'es')).toMatch(/<\/html>\n$/)
  })

  it('sin clase, el body no lleva atributo', () => {
    expect(xhtml('T', '', 'es', '')).toContain('<body>\n')
  })

  it('el titulo se escapa pero el idioma no, igual que en el Python', () => {
    const r = xhtml('a & b', '', 'es')
    expect(r).toContain('<title>a &amp; b</title>')
    expect(r).toContain('lang="es" xml:lang="es"')
  })
})

describe(`paginaImagen (${oraculo.pagina_imagen.length} casos del Python)`, () => {
  for (const caso of oraculo.pagina_imagen) {
    it(`${caso.href} / ${JSON.stringify(caso.alt)}`, () => {
      expect(paginaImagen(caso.href, caso.alt, caso.clase)).toBe(caso.salida)
    })
  }

  it('va en una sola linea', () => {
    expect(paginaImagen('imagenes/x.png', 'y')).not.toContain('\n')
  })

  it('la ruta sube un nivel, porque el XHTML vive en texto/', () => {
    expect(paginaImagen('imagenes/x.png', 'y')).toContain('src="../imagenes/x.png"')
  })
})

describe('CSS', () => {
  it('es el del Python, caracter a caracter, salvo las divergencias anotadas', () => {
    // conDivergenciasCss revienta si una divergencia deja de encajar, asi que
    // esto sigue demostrando que no nos apartamos en ningun otro sitio.
    expect(CSS).toBe(conDivergenciasCss(oraculo.CSS))
  })

  // Reglas del brief que un refactor "limpio" rompe sin que se note en Chrome.
  it('no fija ningun color ni fondo', () => {
    // KDP advierte que un fondo forzado vuelve el texto invisible al invertir
    // colores. Los temas de la vista previa van en otra hoja.
    const sinComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(sinComentarios).not.toMatch(/(^|[;{\s])color\s*:/)
    expect(sinComentarios).not.toMatch(/background/)
  })

  it('no fija font-size ni line-height en el texto corrido', () => {
    // Solo los elementos de cabecera y mobiliario los fijan, nunca p ni body.
    expect(CSS).toMatch(/body \{[^}]*\}/)
    const body = /body \{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    expect(body).not.toContain('font-size')
    expect(body).not.toContain('line-height')
    const parrafo = /\np \{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    expect(parrafo).not.toContain('font-size')
    expect(parrafo).not.toContain('line-height')
  })

  it('cada elemento centrado lleva text-align explicito', () => {
    // Apple Books NO heredo el centrado del div al h1 y la portadilla salio
    // descentrada. Chrome SI hereda, asi que la vista previa no lo delataria.
    for (const sel of [
      'p.num-capitulo',
      'h1.titulo-capitulo',
      'h2.subtitulo',
      'p.escena',
      'h1.titulo-libro',
      'div.portadilla p',
      'nav#toc h1',
    ]) {
      const bloque = new RegExp(`${sel.replace(/[.#]/g, '\\$&')} \\{([^}]*)\\}`).exec(CSS)?.[1]
      expect(bloque, `${sel} deberia existir en el CSS`).toBeDefined()
      expect(bloque, `${sel} necesita text-align explicito`).toContain('text-align')
    }
  })

  it('la ilustracion nunca se recorta y cabe en cualquier pantalla', () => {
    const img = /div\.ilustracion img, div\.portada img \{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    expect(img).toContain('max-width: 100%')
    expect(img).toContain('max-height: 100%')
  })

  it('la pagina de ilustracion no deja una pagina en blanco detras', () => {
    // El bug: la imagen se media contra la VENTANA (max-height: 95vh), no
    // contra la pagina. El lector pone sus margenes en «em», asi que con la
    // letra grande imagen + margenes pasaba del alto de la pagina y el motor
    // de paginado abria una columna mas: la pagina en blanco. Medido en un
    // paginador por columnas, 22 combinaciones de pantalla, tamaño de letra y
    // proporcion fallaban; con esto, ninguna.
    const bloque = (sel: string): string =>
      new RegExp(`${sel.replace(/[.#,]/g, '\\$&')} \\{([^}]*)\\}`).exec(CSS)?.[1] ?? ''

    const SELECTORES = ['body.pagina-imagen', 'div.ilustracion, div.portada', 'div.ilustracion img, div.portada img']

    // 1. La pagina y su contenedor valen justo la caja de la pagina...
    for (const sel of SELECTORES.slice(0, 2)) {
      expect(bloque(sel), `${sel} necesita height: 100%`).toContain('height: 100%')
      // 2. ...y border-box es lo que hace que el margen del lector reste en
      //    vez de sumar. Sin esto, height: 100% + su relleno vuelve a desbordar.
      expect(bloque(sel), `${sel} necesita box-sizing: border-box`).toContain('box-sizing: border-box')
    }

    // 3. La imagen se mide contra ese contenedor, no contra nada mas.
    expect(bloque(SELECTORES[2] as string)).toContain('max-height: 100%')

    // 4. Y ninguna de las tres reglas vuelve a medir contra la ventana: `vh`
    //    es el alto de la VENTANA, y la pagina es mas baja que la ventana.
    for (const sel of SELECTORES) {
      expect(bloque(sel), `${sel} no puede medir en vh`).not.toContain('vh')
    }
  })

  it('el logo cambia con el modo oscuro, incluidos los temas viejos de Apple', () => {
    expect(CSS).toContain('@media (prefers-color-scheme: dark)')
    expect(CSS).toContain('__ibooks_internal_theme')
  })
})

describe(`cssLibro (${oraculo.css_libro.length} configuraciones del Python)`, () => {
  for (const caso of oraculo.css_libro) {
    it(caso.nombre, () => {
      // Las caras salen de buscarFuentes con los mismos nombres de archivo.
      const dg = new Diagnosticos()
      const archivos = caso.familias.length
        ? [
            archivo('fuentes/Fam-Bold.ttf', new Uint8Array()),
            archivo('fuentes/Fam-BoldItalic.otf', new Uint8Array()),
            archivo('fuentes/Fam-Italic.ttf', new Uint8Array()),
            archivo('fuentes/Fam-Regular.ttf', new Uint8Array()),
          ].slice(0, caso.familias.length)
        : []
      const fuentes = buscarFuentes(archivos, dg)
      expect(cssLibro(fuentes, caso.preferida)).toBe(conDivergenciasCss(caso.salida))
    })
  }

  it('sin fuentes, la declaracion font-family desaparece entera', () => {
    const r = cssLibro([], '')
    expect(r).not.toContain('font-family: __FAMILIA__')
    expect(r).not.toContain('@font-face')
    expect(/body \{([^}]*)\}/.exec(r)?.[1]).not.toContain('font-family')
  })

  it('la preferida va primera y serif ultima', () => {
    const r = cssLibro([{ familia: 'Fam', style: 'normal', weight: 'normal', href: 'f/a.ttf' }], 'Baskerville')
    expect(r).toContain('font-family: "Baskerville", "Fam", serif;')
  })

  it('las familias se deduplican conservando el orden', () => {
    const cara = (familia: string, href: string) => ({ familia, style: 'normal', weight: 'normal', href })
    const r = cssLibro([cara('B', '1.ttf'), cara('A', '2.ttf'), cara('B', '3.ttf')], '')
    expect(r).toContain('font-family: "B", "A", serif;')
  })

  it('no deja ningun marcador sin sustituir', () => {
    for (const r of [cssLibro([], ''), cssLibro([], 'X')]) {
      expect(r).not.toContain('/*FUENTES*/')
      expect(r).not.toContain('__FAMILIA__')
    }
  })
})

describe(`buscarFuentes (${oraculo.fuentes.length} carpetas del Python)`, () => {
  for (const caso of oraculo.fuentes) {
    it(`${caso.nombre}: mismas caras`, () => {
      const dg = new Diagnosticos()
      const archivos = caso.archivos.map((n: string) =>
        archivo(`fuentes/${n}`, new Uint8Array([0, 1, 0, 0])),
      )
      const fuentes = buscarFuentes(archivos, dg).map((f) => ({
        familia: f.familia,
        style: f.style,
        weight: f.weight,
        href: f.href,
        id: f.id,
        media: f.media,
      }))
      expect(fuentes).toEqual(caso.salida)
    })

    it(`${caso.nombre}: mismos avisos`, () => {
      const dg = new Diagnosticos()
      const archivos = caso.archivos.map((n: string) =>
        archivo(`fuentes/${n}`, new Uint8Array([0, 1, 0, 0])),
      )
      buscarFuentes(archivos, dg)
      expect(dg.avisos).toEqual(caso.avisos)
    })
  }

  it('el OFL.txt que acompana a la fuente se ignora sin avisar', () => {
    const dg = new Diagnosticos()
    const r = buscarFuentes([archivo('fuentes/OFL.txt', new Uint8Array())], dg)
    expect(r).toEqual([])
    expect(dg.avisos).toEqual([])
  })

  it('el orden es alfabetico por nombre: Bold antes de Italic antes de Regular', () => {
    const dg = new Diagnosticos()
    const r = buscarFuentes(
      ['Fam-Regular.ttf', 'Fam-Italic.ttf', 'Fam-Bold.ttf'].map((n) =>
        archivo(`fuentes/${n}`, new Uint8Array()),
      ),
      dg,
    )
    expect(r.map((f) => f.weight + '/' + f.style)).toEqual([
      'bold/normal',
      'normal/italic',
      'normal/normal',
    ])
  })
})
