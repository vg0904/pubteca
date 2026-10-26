import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { construir } from '../src/core/construir'
import { reporte } from '../src/core/reporte'
import { leerProyecto } from '../scripts/leer-proyecto'
import { conDivergenciasCss } from './divergencias'

/**
 * El golden test: compara la salida del port con la del generar_epub.py de
 * referencia, sobre un libro de prueba inventado.
 *
 * EL CONTRATO NO ES UN HASH DEL .EPUB. Eso es inalcanzable: fflate y zlib
 * producen flujos deflate distintos para el mismo contenido, asi que los dos
 * archivos pesan distinto aunque el libro sea identico (185.375 contra 189.115
 * bytes en este fixture). Lo que se compara es:
 *
 *   1. la LISTA de entradas y su orden exacto,
 *   2. el mimetype como entrada 0, STORE, 20 bytes, sin campos extra,
 *   3. el contenido DESCOMPRIMIDO, byte a byte, de cada entrada de texto,
 *   4. el sha256 de cada entrada binaria: las imagenes y las fuentes tienen
 *      que viajar SIN recodificar.
 *
 * El unico dato no determinista es `dcterms:modified`; el manifiesto guarda el
 * instante con el que se genero el golden y aqui se le inyecta al reloj, asi
 * que la comparacion es exacta sin normalizar nada.
 */

const RAIZ = join(import.meta.dirname, '..')
const FIXTURE = join(RAIZ, 'tests', 'fixtures', 'libro-prueba')
const GOLDEN = join(RAIZ, 'tests', 'golden', 'libro-prueba')

interface EntradaManifiesto {
  ruta: string
  metodo: 'STORE' | 'DEFLATE'
  extra: number
  tamano: number
  sha256: string
  texto: boolean
}

interface Manifiesto {
  tiendas: Record<
    string,
    { epub: string; bytes: number; dcterms_modified: string; entradas: EntradaManifiesto[] }
  >
}

const manifiesto = JSON.parse(
  readFileSync(join(GOLDEN, 'manifiesto.json'), 'utf8'),
) as Manifiesto

/** La hoja de estilo, el unico texto del golden con divergencias anotadas. */
const CSS_DEL_LIBRO = 'OEBPS/estilos/estilo.css'

const TIENDAS = [
  { carpeta: 'kindle', tienda: 'Kindle' },
  { carpeta: 'apple', tienda: 'AppleBooks' },
] as const

/** Lee las cabeceras locales del ZIP para saber orden, metodo y campos extra. */
function entradasDelZip(b: Uint8Array): { ruta: string; metodo: string; extra: number }[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const salida: { ruta: string; metodo: string; extra: number }[] = []
  let i = 0
  while (i + 30 <= b.length && dv.getUint32(i, true) === 0x04034b50) {
    const metodo = dv.getUint16(i + 8, true)
    const comprimido = dv.getUint32(i + 18, true)
    const largoNombre = dv.getUint16(i + 26, true)
    const largoExtra = dv.getUint16(i + 28, true)
    const ruta = new TextDecoder('utf-8').decode(b.subarray(i + 30, i + 30 + largoNombre))
    salida.push({ ruta, metodo: metodo === 0 ? 'STORE' : 'DEFLATE', extra: largoExtra })
    i += 30 + largoNombre + largoExtra + comprimido
  }
  return salida
}

const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

describe('golden: el port contra generar_epub.py', () => {
  const ahora = new Date(manifiesto.tiendas['kindle']?.dcterms_modified as string)
  const proyecto = leerProyecto(FIXTURE)
  const c = construir(proyecto, { ahora })

  it('el reloj del golden es el mismo para las dos tiendas', () => {
    expect(manifiesto.tiendas['kindle']?.dcterms_modified).toBe(
      manifiesto.tiendas['apple']?.dcterms_modified,
    )
  })

  it('no hay nada que bloquee la generacion', () => {
    expect(c.bloqueado).toBeNull()
    expect(c.resultados).toHaveLength(2)
  })

  it('los diagnosticos son los mismos que los del Python', () => {
    // El reporte los lleva, pero compararlos aparte dice QUE fallo.
    expect(c.diagnosticos.errores).toEqual([])
    expect(c.diagnosticos.avisos).toEqual([
      'ilustraciones/cap02-01.png: tiene transparencia. Kindle la convierte en blanco; aplánala sobre su fondo.',
      'ilustraciones/cap09-99.png: no está marcada en ningún capítulo, así que no entró al libro.',
    ])
    expect(c.diagnosticos.notas).toEqual([
      'portada/logo-blanco.png: no tiene fondo transparente; en Apple Books con modo oscuro se verá un recuadro.',
      'Faltan capítulos en la numeración: cap03.',
    ])
  })

  it('el reporte es identico, anchos de campo incluidos', () => {
    const esperado = readFileSync(join(GOLDEN, 'reporte.txt'), 'utf8')
    expect(reporte(c, ahora)).toBe(esperado)
  })

  it('el reporte usa hora LOCAL mientras dcterms:modified usa UTC', () => {
    // La asimetria es del Python y se replica. Por eso vite.config.ts fija
    // TZ=UTC en los tests: sin el pin, el golden dependeria de la zona horaria
    // de quien lo genero, y este test pasaba en la maquina del autor (UTC-6) y
    // fallaba en CI (UTC). Lo encontro CI, no el desarrollo local.
    expect(process.env['TZ']).toBe('UTC')
    const d = new Date('2026-06-15T23:30:00Z')
    expect(reporte(c, d).split('\n')[0]).toContain('2026-06-15 23:30')
  })

  for (const { carpeta, tienda } of TIENDAS) {
    describe(carpeta, () => {
      const esperado = manifiesto.tiendas[carpeta]
      const res = c.resultados.find((r) => r.tienda === tienda)
      const entradas = entradasDelZip(res?.bytes ?? new Uint8Array())
      const descomprimido = unzipSync(res?.bytes ?? new Uint8Array())

      it('se genero el archivo con el nombre que toca', () => {
        expect(res?.nombreArchivo).toBe(esperado?.epub)
      })

      it('mismo numero de entradas', () => {
        expect(entradas).toHaveLength(esperado?.entradas.length ?? -1)
      })

      it('mismas entradas, en el mismo orden', () => {
        expect(entradas.map((e) => e.ruta)).toEqual(esperado?.entradas.map((e) => e.ruta))
      })

      it('el mimetype es la entrada 0, STORE, 20 bytes y sin campos extra', () => {
        // PKG-006 si no es el primero, PKG-005 si lleva un campo extra.
        expect(entradas[0]).toEqual({ ruta: 'mimetype', metodo: 'STORE', extra: 0 })
        expect(descomprimido['mimetype']).toHaveLength(20)
        expect(new TextDecoder().decode(descomprimido['mimetype'])).toBe('application/epub+zip')
      })

      it('ninguna entrada lleva campos extra', () => {
        expect(entradas.filter((e) => e.extra !== 0)).toEqual([])
      })

      it('solo el mimetype va sin comprimir', () => {
        // Las imagenes del libro de prueba son colores planos y se comprimen
        // bien, asi que aqui todo lo demas va comprimido, igual que en el
        // Python. Una imagen que ya viene comprimida (la de Procreate, un JPEG)
        // se guarda tal cual: lo prueban los tests de zip.ts.
        expect(entradas.filter((e) => e.metodo === 'STORE').map((e) => e.ruta)).toEqual(['mimetype'])
      })

      for (const e of esperado?.entradas ?? []) {
        if (e.texto) {
          it(`${e.ruta}: texto identico`, () => {
            const nuestro = new TextDecoder('utf-8').decode(descomprimido[e.ruta])
            // El golden es la salida REAL del Python, y se queda asi: es su
            // razon de ser. Donde nos apartamos a proposito, la divergencia se
            // aplica aqui, anotada en divergencias.ts, en vez de reescribir el
            // golden y borrar la prueba de lo que el Python hacia.
            const suyo = readFileSync(join(GOLDEN, carpeta, e.ruta), 'utf8')
            expect(nuestro).toBe(e.ruta === CSS_DEL_LIBRO ? conDivergenciasCss(suyo) : suyo)
          })
        } else {
          it(`${e.ruta}: binario sin recodificar`, () => {
            const datos = descomprimido[e.ruta]
            expect(datos).toBeDefined()
            expect(datos?.length).toBe(e.tamano)
            expect(sha256(datos as Uint8Array)).toBe(e.sha256)
          })
        }
      }
    })
  }
})

describe('las diferencias Kindle / Apple Books', () => {
  const ahora = new Date('2026-10-20T19:09:41Z')
  const c = construir(leerProyecto(FIXTURE), { ahora })
  const bytes = (t: string): Uint8Array =>
    c.resultados.find((r) => r.tienda === t)?.bytes ?? new Uint8Array()
  const kindle = unzipSync(bytes('Kindle'))
  const apple = unzipSync(bytes('AppleBooks'))
  const texto = (z: Record<string, Uint8Array>, r: string): string =>
    new TextDecoder('utf-8').decode(z[r] ?? new Uint8Array())

  it('Kindle no lleva portada interna: en KDP se sube aparte', () => {
    expect(kindle['OEBPS/texto/portada.xhtml']).toBeUndefined()
    expect(apple['OEBPS/texto/portada.xhtml']).toBeDefined()
    expect(kindle['OEBPS/imagenes/portada.png']).toBeUndefined()
  })

  it('Kindle no lleva fuentes: el lector usa la suya y el archivo pesa menos', () => {
    expect(Object.keys(kindle).filter((k) => k.includes('fuentes/'))).toEqual([])
    expect(Object.keys(apple).filter((k) => k.includes('fuentes/')).length).toBe(3)
    expect(texto(kindle, 'OEBPS/estilos/estilo.css')).not.toContain('@font-face')
    expect(texto(apple, 'OEBPS/estilos/estilo.css')).toContain('@font-face')
  })

  it('solo Apple declara specified-fonts', () => {
    expect(kindle['META-INF/com.apple.ibooks.display-options.xml']).toBeUndefined()
    expect(texto(apple, 'META-INF/com.apple.ibooks.display-options.xml')).toContain(
      'specified-fonts',
    )
  })

  it('la portadilla: logo en Apple, titulo como texto en Kindle', () => {
    // Kindle no soporta prefers-color-scheme y pinta de blanco los fondos
    // transparentes, asi que un logo en imagen no se adapta al modo oscuro.
    expect(texto(kindle, 'OEBPS/texto/portadilla.xhtml')).toContain(
      '<h1 class="titulo-libro">El faro de Ibar</h1>',
    )
    expect(texto(kindle, 'OEBPS/texto/portadilla.xhtml')).not.toContain('logo')
    expect(texto(apple, 'OEBPS/texto/portadilla.xhtml')).toContain('class="logo logo-claro"')
    expect(texto(apple, 'OEBPS/texto/portadilla.xhtml')).toContain('class="logo logo-oscuro"')
  })

  it('la portadilla a pagina completa: la imagen sola en Apple, y nada añadido', () => {
    // Un diseño de portadilla a pagina completa ya trae dibujados el titulo, el
    // autor y el sello: ponerlos otra vez los repite, y tratarlo como un logo lo
    // encoge al 88 % de ancho que le toca a un logo.
    const pr = leerProyecto(FIXTURE)
    const aPagina = construir(
      { ...pr, libroTxt: `${pr.libroTxt ?? ''}\nportadilla: pagina\n` },
      { ahora: new Date('2026-10-20T19:09:41Z') },
    )
    const zip = (tienda: string): Record<string, Uint8Array> =>
      unzipSync(aPagina.resultados.find((r) => r.tienda === tienda)?.bytes ?? new Uint8Array())
    const pa = texto(zip('AppleBooks'), 'OEBPS/texto/portadilla.xhtml')
    const pk = texto(zip('Kindle'), 'OEBPS/texto/portadilla.xhtml')

    // Apple: la imagen sola, en una pagina de imagen como la de una ilustracion.
    expect(pa).toContain('class="pagina-imagen"')
    expect(pa).toContain('<div class="ilustracion"><img src="../imagenes/logo.png"')
    // Y NADA añadido: ni subtitulo, ni autor, ni sello.
    expect(pa).not.toContain('subtitulo-libro')
    expect(pa).not.toContain('autor-libro')
    expect(pa).not.toContain('sello')
    // Sigue siendo la portadilla para las tiendas.
    expect(pa).toContain('epub:type="titlepage"')

    // Kindle no recibe la imagen, asi que se queda con su portadilla de texto
    // ENTERA, y su body sin la clase de pagina de imagen.
    expect(pk).toContain('<h1 class="titulo-libro">El faro de Ibar</h1>')
    expect(pk).toContain('autor-libro')
    expect(pk).not.toContain('pagina-imagen')
    expect(zip('Kindle')['OEBPS/imagenes/logo.png']).toBeUndefined()

    // La version blanca no se usa ni se echa de menos: a pagina completa es una
    // imagen normal y el modo oscuro no la cambia.
    expect(pa).not.toContain('logo-blanco')
    expect(aPagina.diagnosticos.notas.some((n) => n.includes('logo-blanco'))).toBe(false)
    expect(zip('AppleBooks')['OEBPS/imagenes/logo-blanco.png']).toBeUndefined()
  })

  it('sin la clave, la portadilla es la de siempre: el Python no la conoce', () => {
    // leerConfig conserva las claves que no son suyas, y `portadilla` no esta en
    // CONFIG_DEFAULT: un proyecto sin ella sale exactamente como antes.
    expect(texto(apple, 'OEBPS/texto/portadilla.xhtml')).toContain('class="logo logo-claro"')
  })

  it('los logos solo entran en Apple', () => {
    expect(kindle['OEBPS/imagenes/logo.png']).toBeUndefined()
    expect(apple['OEBPS/imagenes/logo.png']).toBeDefined()
  })

  it('la contraportada entra en las DOS, que no es obvio', () => {
    expect(kindle['OEBPS/imagenes/contraportada.png']).toBeDefined()
    expect(apple['OEBPS/imagenes/contraportada.png']).toBeDefined()
  })

  it('el landmark de portada solo existe donde hay portada', () => {
    expect(texto(kindle, 'OEBPS/texto/nav.xhtml')).not.toContain('epub:type="cover"')
    expect(texto(apple, 'OEBPS/texto/nav.xhtml')).toContain('epub:type="cover"')
  })

  it('las dos comparten identificador: es el MISMO libro', () => {
    for (const z of [kindle, apple]) {
      expect(texto(z, 'OEBPS/content.opf')).toContain(
        '<dc:identifier id="bookid">urn:uuid:513c394a-9b14-5221-9710-c373e5ce4dce</dc:identifier>',
      )
    }
  })
})
