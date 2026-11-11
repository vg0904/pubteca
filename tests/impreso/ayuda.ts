/**
 * Lo comun a los tests del impreso: las fuentes del repo, un texto inventado
 * y reproducible, y unas opciones de 6 × 9 in.
 *
 * El texto sale de un generador con semilla y un vocabulario inventado para
 * esto: nada de un libro real.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Bloque } from '../../src/core/parser'
import { enLinea } from '../../src/core/texto'
import type { OpcionesImpreso, SeccionDeTexto } from '../../src/core/impreso/paginar'
import { Fuente } from '../../src/core/impreso/sfnt'
import type { Fuentes } from '../../src/core/impreso/tipos'

const DIR = join(import.meta.dirname, '..', '..', 'public', 'fuentes', 'impreso')

let cache: Fuentes | null = null
export function fuentes(): Fuentes {
  if (!cache) {
    const f = (n: string): Fuente => new Fuente(new Uint8Array(readFileSync(join(DIR, `SourceSerif4-${n}.ttf`))))
    cache = { regular: f('Regular'), cursiva: f('Italic'), negrita: f('Bold'), negritaCursiva: f('BoldItalic') }
  }
  return cache
}

export const PT = 72
export const MM = 72 / 25.4

export const OPCIONES: OpcionesImpreso = {
  formato: { ancho: 6 * PT, alto: 9 * PT, interior: 22 * MM, exterior: 16 * MM, superior: 20 * MM, inferior: 22 * MM },
  cuerpo: 10.5,
  interlinea: 14.5,
  sangria: 1.4,
  partir: true,
  idioma: 'es',
  escena: 'adorno',
  adorno: '* * *',
  capituloEnImpar: true,
  cabeceras: true,
  tituloLibro: 'El faro de las mareas quietas',
}

/** Un generador de numeros con semilla (mulberry32): el mismo texto en cada vuelta. */
export function azar(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CORTAS = 'el la de que y en un una los las por con su al lo como mas pero sus le ya o fue este ha si porque esta son entre cuando muy sin sobre ser tiene tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros'.split(' ')
const LARGAS =
  'camino ventana mareas silencio farero escalera madrugada horizonte cuaderno lampara gaviotas tormenta recuerdo naufragio campanario acantilado relampago marinero espuma travesia bruma arrecife oleaje linterna faroles cristales barandilla hojarasca caracola amanecer atardecer extraordinariamente inconfundible desembarcadero transatlantico inmediatamente sobrecogedora resplandeciente imperceptiblemente desapareciendo contemplaban murmuraciones'.split(' ')

/** Un parrafo inventado de `n` palabras, con alguna larga para que haya que partir. */
export function parrafo(r: () => number, n: number): string {
  const p: string[] = []
  for (let i = 0; i < n; i++) {
    const larga = r() < 0.35
    const lista = larga ? LARGAS : CORTAS
    p.push(lista[Math.floor(r() * lista.length)] as string)
  }
  p[0] = (p[0] as string).charAt(0).toUpperCase() + (p[0] as string).slice(1)
  return p.join(' ') + '.'
}

/** Un capitulo inventado: parrafos de largos variados, y lo que se pida en medio. */
export function capitulo(semilla: number, parrafos: number, extra: (i: number) => Bloque[] = () => []): Bloque[] {
  const r = azar(semilla)
  const b: Bloque[] = []
  for (let i = 0; i < parrafos; i++) {
    b.push(...extra(i))
    b.push({ tipo: 'p', html: enLinea(parrafo(r, 8 + Math.floor(r() * 90))) })
  }
  return b
}

export function seccion(n: number, bloques: Bloque[], titulo = `El capitulo ${n}`): SeccionDeTexto {
  return { numero: `Capitulo ${n}`, titulo: enLinea(titulo), bloques }
}
