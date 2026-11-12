/**
 * La cubierta del libro de prueba, del lado de Node (como impreso-prueba.ts
 * para el interior). La usan los tests, el script de los PDF y CI.
 *
 * El dibujo no es un archivo: es un atardecer inventado (bandas claras arriba,
 * un sol, mar oscuro abajo), como el de los bocetos, en RGB. Lo claro arriba y
 * lo oscuro abajo es a proposito: cada pieza tiene que elegir su tinta.
 *
 * La app pinta las capas del fondo con el lienzo del navegador. Aqui hace
 * falta lo mismo sin navegador: `pintarFondo` las pinta en pixeles RGB, por el
 * vecino mas cercano. Es un pintor de pruebas, no el de la app.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARCHIVOS_CUBIERTA, CAJA_CODIGO, componerCubierta, CONFIG_CUBIERTA_POR_DEFECTO, type Caja, type ConfigCubierta, type CubiertaCompuesta, type DatosCubierta, type FuentesCubierta, type Luminancias } from '../src/core/impreso/cubierta.ts'
import { componerCodigo, svgDelCodigo } from '../src/core/impreso/codigo.ts'
import { cifrasDeIsbn, isbnLegible } from '../src/core/impreso/ean13.ts'
import { escribirCubierta } from '../src/core/impreso/pdf-cubierta.ts'
import { Fuente } from '../src/core/impreso/sfnt.ts'
import { FECHA, fuentesDelRepo } from './impreso-prueba.ts'

const RAIZ = join(import.meta.dirname, '..')

export function fuentesCubiertaDelRepo(): FuentesCubierta {
  const f = (n: string): Fuente => new Fuente(new Uint8Array(readFileSync(join(RAIZ, 'public', 'fuentes', 'cubierta', n))))
  return {
    jost: f(ARCHIVOS_CUBIERTA.jost),
    playfair: f(ARCHIVOS_CUBIERTA.playfair),
    cormorant: f(ARCHIVOS_CUBIERTA.cormorant),
    bebas: f(ARCHIVOS_CUBIERTA.bebas),
    oswald: f(ARCHIVOS_CUBIERTA.oswald),
    libro: fuentesDelRepo(),
  }
}

export interface Rgb {
  readonly ancho: number
  readonly alto: number
  readonly rgb: Uint8Array
}

/** El atardecer de prueba: bandas de cielo claras, un sol, una costa y mar oscuro. */
export function arteDePrueba(ancho = 1838, alto = 2775): Rgb {
  const bandas = [
    [246, 224, 186], [240, 210, 168], [234, 190, 146], [222, 160, 128], [190, 128, 124], [134, 104, 128],
  ]
  const rgb = new Uint8Array(ancho * alto * 3)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const v = y / alto
      let c: readonly number[]
      const dx = x - ancho * 0.35
      const dy = y - alto * 0.5
      if (v < 0.6) c = bandas[Math.min(5, Math.floor(v / 0.1))] as number[]
      else c = [27, 41, 68]
      if (dx * dx + dy * dy < (ancho * 0.12) ** 2) c = [252, 236, 200]
      if (v > 0.58 && v < 0.64 && x > ancho * (0.5 - (v - 0.58) * 4)) c = [20, 24, 40]
      const i = (y * ancho + x) * 3
      rgb[i] = c[0] as number
      rgb[i + 1] = c[1] as number
      rgb[i + 2] = c[2] as number
    }
  }
  return { ancho, alto, rgb }
}

/** La luminancia relativa (WCAG) de un RGB, en una rejilla pequeña. Lo mismo que hace la app con el lienzo. */
export function luminancias(img: Rgb, ancho = 48, alto = 72): Luminancias {
  const lin = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const valores = new Float32Array(ancho * alto)
  for (let gy = 0; gy < alto; gy++) {
    for (let gx = 0; gx < ancho; gx++) {
      const x = Math.floor(((gx + 0.5) / ancho) * img.ancho)
      const y = Math.floor(((gy + 0.5) / alto) * img.alto)
      const i = (y * img.ancho + x) * 3
      valores[gy * ancho + gx] = 0.2126 * lin(img.rgb[i] as number) + 0.7152 * lin(img.rgb[i + 1] as number) + 0.0722 * lin(img.rgb[i + 2] as number)
    }
  }
  return { ancho, alto, valores }
}

export const ARTE = arteDePrueba()

export function datosDePrueba(cambios: Partial<DatosCubierta> = {}): DatosCubierta {
  return {
    titulo: 'El faro de las mareas quietas',
    autor: 'Lucía Ferrer Ondarra',
    sello: 'Ediciones Pubteca',
    descripcion:
      'Elena sube cada noche a la linterna de un faro que ya nadie necesita. Cuando un transatlántico pasa demasiado cerca del arrecife, encuentra en el registro una pregunta que su tío dejó sin contestar: para quién se enciende una luz que no alumbra el mar.',
    idioma: 'es',
    isbn: '978-84-09-12345-2',
    destino: 'kdp',
    papel: 'crema',
    corte: { ancho: 6 * 72, alto: 9 * 72 },
    paginas: 212,
    imagenes: { portada: { ancho: ARTE.ancho, alto: ARTE.alto, luz: luminancias(ARTE) } },
    ...cambios,
  }
}

export function cubiertaDePrueba(c: Partial<ConfigCubierta> = {}, d: Partial<DatosCubierta> = {}): CubiertaCompuesta {
  return componerCubierta(datosDePrueba(d), { ...CONFIG_CUBIERTA_POR_DEFECTO, ...c }, fuentesCubiertaDelRepo())
}

/** Pinta las capas del fondo en RGB a `ppi`, como hara el lienzo de la app (los logos, cajas grises). */
export function pintarFondo(c: CubiertaCompuesta, ppi: number, artes: Readonly<Record<string, Rgb>> = { portada: ARTE }): Rgb {
  const k = ppi / 72
  const ancho = Math.round(c.medidas.ancho * k)
  const alto = Math.round(c.medidas.alto * k)
  const rgb = new Uint8Array(ancho * alto * 3)
  const recorrer = (caja: Caja, f: (x: number, y: number, i: number) => void): void => {
    const x0 = Math.max(0, Math.floor(caja.x * k))
    const y0 = Math.max(0, Math.floor(caja.y * k))
    const x1 = Math.min(ancho, Math.ceil((caja.x + caja.ancho) * k))
    const y1 = Math.min(alto, Math.ceil((caja.y + caja.alto) * k))
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f(x, y, (y * ancho + x) * 3)
  }
  for (const capa of c.capas) {
    if (capa.que === 'color') {
      const h = capa.color
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
      recorrer(capa.caja, (_x, _y, i) => {
        rgb[i] = r as number
        rgb[i + 1] = g as number
        rgb[i + 2] = b as number
      })
    } else if (capa.que === 'arte') {
      const a = artes[capa.rol]
      if (!a) continue
      recorrer(capa.caja, (x, y, i) => {
        const sx = Math.min(a.ancho - 1, Math.floor(capa.recorte.x + ((x / k - capa.caja.x) / capa.caja.ancho) * capa.recorte.ancho))
        const sy = Math.min(a.alto - 1, Math.floor(capa.recorte.y + ((y / k - capa.caja.y) / capa.caja.alto) * capa.recorte.alto))
        const j = (sy * a.ancho + sx) * 3
        rgb[i] = a.rgb[j] as number
        rgb[i + 1] = a.rgb[j + 1] as number
        rgb[i + 2] = a.rgb[j + 2] as number
      })
    } else if (capa.que === 'velo') {
      const v = capa.color === 'negro' ? 0 : 255
      recorrer(capa.caja, (_x, _y, i) => {
        for (let q = 0; q < 3; q++) rgb[i + q] = Math.round((rgb[i + q] as number) * (1 - capa.alfa) + v * capa.alfa)
      })
    } else {
      recorrer(capa.caja, (_x, _y, i) => {
        rgb[i] = rgb[i + 1] = rgb[i + 2] = capa.rol.endsWith('Blanco') ? 240 : 30
      })
    }
  }
  return { ancho, alto, rgb }
}

export function pdfDeCubierta(c: CubiertaCompuesta, ppi = 100): Uint8Array {
  const fondo = pintarFondo(c, ppi)
  return escribirCubierta(c, { fuentes: fuentesCubiertaDelRepo(), fondo, titulo: 'El faro de las mareas quietas', autor: 'Lucía Ferrer Ondarra', fecha: FECHA })
}

/**
 *   tsx scripts/cubierta-prueba.ts tmp/pdfs     escribe la cubierta de prueba en dos estilos,
 *                                               y el codigo suelto en SVG
 *
 * CI las pasa por qpdf y pdffonts con las del interior, y ademas las pinta a
 * 300 ppi y le pide a zbarimg que lea el codigo de barras; el SVG lo pinta
 * rsvg-convert a 300 ppi y zbarimg lo lee tambien.
 */
function main(argv: readonly string[]): number {
  const salida = argv[0] ?? join(RAIZ, 'tmp', 'pdfs')
  mkdirSync(salida, { recursive: true })
  for (const estilo of ['papiro', 'vertical'] as const) {
    const c = cubiertaDePrueba({ estilo, titulo: true })
    const pdf = pdfDeCubierta(c, 150)
    const ruta = join(salida, `cubierta-${estilo}.pdf`)
    writeFileSync(ruta, pdf)
    console.log(`${ruta}: ${(c.medidas.ancho / 72).toFixed(3)} × ${(c.medidas.alto / 72).toFixed(3)} in, lomo ${((c.medidas.lomo / 72) * 25.4).toFixed(2)} mm, ${pdf.length} bytes`)
  }
  const caja = { x: 0, y: 0, ancho: CAJA_CODIGO.ancho, alto: CAJA_CODIGO.alto }
  const isbn = datosDePrueba().isbn
  const cifras = cifrasDeIsbn(isbn) as string
  const f = fuentesCubiertaDelRepo()
  const svg = svgDelCodigo(componerCodigo(caja, { cifras, arriba: isbnLegible(isbn, cifras), conCifras: true, gris: 0 }, f), caja, f, isbnLegible(isbn, cifras))
  const ruta = join(salida, `codigo-${cifras}.svg`)
  writeFileSync(ruta, svg)
  console.log(`${ruta}: ${svg.length} bytes`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
