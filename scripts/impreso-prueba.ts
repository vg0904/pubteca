/**
 * El PDF interior del libro de prueba (tests/fixtures/libro-impreso).
 *
 *   tsx scripts/impreso-prueba.ts tmp/pdfs           escribe los PDF y pasa la lista de PDF/X-1a
 *   tsx scripts/impreso-prueba.ts --golden           reescribe el golden del PDF
 *
 * Lo usan el test del PDF, el golden y CI (que ademas los pasa por qpdf y
 * pdffonts). Como `leer-proyecto.ts`, es el lado de Node: lee del disco lo que
 * en el navegador leera la app, y se lo da al core ya cargado.
 *
 * La ilustracion del libro no es un archivo: es un degradado con un circulo
 * que se genera aqui, en gris, que es lo que la app le dara al core.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leerConfig } from '../src/core/config.ts'
import { componerLibro, type LibroCompuesto, type OpcionesImpreso, type SeccionImpresa } from '../src/core/impreso/paginar.ts'
import { escribirPdf, type ImagenGris } from '../src/core/impreso/pdf.ts'
import { Fuente } from '../src/core/impreso/sfnt.ts'
import type { Fuentes } from '../src/core/impreso/tipos.ts'
import { Diagnosticos } from '../src/core/mensajes.ts'
import { parsear, RE_TITULO } from '../src/core/parser.ts'
import { enLinea } from '../src/core/texto.ts'
import { comprobarPdfx, leerPdf, volcar } from './leer-pdf.ts'

const RAIZ = join(import.meta.dirname, '..')
export const FIXTURE = join(RAIZ, 'tests', 'fixtures', 'libro-impreso')
export const GOLDEN = join(RAIZ, 'tests', 'golden', 'libro-impreso', 'interior.pdf.txt')
/** El reloj del golden: con el mismo, el mismo PDF byte a byte. */
export const FECHA = new Date(Date.UTC(2026, 10, 11, 12, 0, 0))

const PT = 72
const MM = 72 / 25.4

export const OPCIONES_PRUEBA: Omit<OpcionesImpreso, 'tituloLibro' | 'idioma' | 'adorno'> = {
  formato: { ancho: 6 * PT, alto: 9 * PT, interior: 22 * MM, exterior: 16 * MM, superior: 20 * MM, inferior: 22 * MM },
  cuerpo: 10.5,
  interlinea: 14.5,
  sangria: 1.4,
  partir: true,
  escena: 'adorno',
  capituloEnImpar: true,
  cabeceras: true,
}

export function fuentesDelRepo(): Fuentes {
  const f = (n: string): Fuente => new Fuente(new Uint8Array(readFileSync(join(RAIZ, 'public', 'fuentes', 'impreso', `SourceSerif4-${n}.ttf`))))
  return { regular: f('Regular'), cursiva: f('Italic'), negrita: f('Bold'), negritaCursiva: f('BoldItalic') }
}

/** Una imagen de prueba en gris: un degradado y un circulo. Determinista. */
export function imagenDePrueba(ancho = 600, alto = 400): ImagenGris {
  const pixeles = new Uint8Array(ancho * alto)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const dx = x - ancho * 0.62
      const dy = y - alto * 0.45
      const circulo = dx * dx + dy * dy < (alto * 0.22) ** 2
      pixeles[y * ancho + x] = circulo ? 40 : Math.round(235 - (150 * y) / alto)
    }
  }
  return { ancho, alto, pixeles }
}

export interface LibroDePrueba {
  readonly compuesto: LibroCompuesto
  readonly pdf: Uint8Array
}

export function libroImpresoDePrueba(cambios: Partial<OpcionesImpreso> = {}, fecha = FECHA): LibroDePrueba {
  const cfg = leerConfig(readFileSync(join(FIXTURE, 'libro.txt'), 'utf8'), new Diagnosticos())
  const secciones: SeccionImpresa[] = readdirSync(join(FIXTURE, 'capitulos'))
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((n) => {
      const p = parsear(readFileSync(join(FIXTURE, 'capitulos', n), 'utf8'))
      const m = RE_TITULO.exec(p.titulo ?? '')
      return {
        numero: m ? (m[1] as string) : null,
        titulo: enLinea(m ? (m[2] ?? '') : (p.titulo ?? '')),
        bloques: p.bloques,
        antes: p.antes,
      }
    })
  const imagen = imagenDePrueba()
  const fuentes = fuentesDelRepo()
  const o: OpcionesImpreso = {
    ...OPCIONES_PRUEBA,
    tituloLibro: cfg.titulo,
    idioma: cfg.idioma,
    adorno: cfg.separador_de_escena,
    ...cambios,
  }
  const compuesto = componerLibro(secciones, fuentes, o, (nombre) => (nombre === 'cap02-01' ? { id: nombre, ancho: imagen.ancho, alto: imagen.alto } : null))
  const pdf = escribirPdf(compuesto.paginas, {
    ancho: o.formato.ancho,
    alto: o.formato.alto,
    fuentes,
    imagenes: (id) => (id === 'cap02-01' ? imagen : null),
    titulo: cfg.titulo,
    autor: cfg.autor,
    fecha,
  })
  return { compuesto, pdf }
}

function main(argv: readonly string[]): number {
  if (argv[0] === '--golden') {
    const { pdf } = libroImpresoDePrueba()
    mkdirSync(join(GOLDEN, '..'), { recursive: true })
    writeFileSync(GOLDEN, volcar(leerPdf(pdf)))
    console.log(`golden reescrito: ${GOLDEN}`)
    return 0
  }
  const salida = argv[0] ?? join(RAIZ, 'tmp', 'pdfs')
  mkdirSync(salida, { recursive: true })
  const casos: [string, Partial<OpcionesImpreso>][] = [
    ['libro-impreso-6x9', {}],
    ['libro-impreso-5,5x8,5', { formato: { ancho: 5.5 * PT, alto: 8.5 * PT, interior: 20 * MM, exterior: 15 * MM, superior: 18 * MM, inferior: 20 * MM }, escena: 'blanco' }],
  ]
  let fallos = 0
  for (const [nombre, cambios] of casos) {
    const { compuesto, pdf } = libroImpresoDePrueba(cambios)
    const ruta = join(salida, `${nombre}.pdf`)
    writeFileSync(ruta, pdf)
    const problemas = comprobarPdfx(leerPdf(pdf))
    console.log(`${ruta}: ${compuesto.paginas.length} paginas, ${pdf.length} bytes, PDF/X-1a: ${problemas.length ? problemas.join('; ') : 'pasa la lista'}`)
    if (compuesto.avisos.length) console.log(`  avisos: ${JSON.stringify(compuesto.avisos)}`)
    fallos += problemas.length
  }
  return fallos ? 1 : 0
}

// Solo al ejecutarlo (el test lo importa). Con la ruta, no con la URL: la carpeta puede llevar espacios.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
