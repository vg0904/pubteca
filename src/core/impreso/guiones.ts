/**
 * Partir palabras a final de linea: el algoritmo de Liang (el de TeX) con los
 * patrones de hyph-utf8, y encima las reglas de la RAE que los patrones no
 * garantizan.
 *
 * Los patrones dicen donde PUEDE ir un guion silabicamente. La Ortografia de
 * 2010 (4.1.1) restringe mas, y esto lo aplica:
 *   - nunca se separan dos vocales seguidas, aunque formen hiato: «tea-tro»,
 *     no «te-atro»; «aé-reo», no «a-é-re-o»;
 *   - nunca queda una letra sola a un lado del guion: «amis-tad», no «a-mistad»
 *     (eso lo dan los minimos de los propios patrones, 2 y 2);
 * y estas son de oficio, no de la RAE:
 *   - una palabra de menos de cinco letras no se parte: «ca-sa» es correcto,
 *     pero en un libro no se hace;
 *   - nunca un trozo de una letra entre dos cortes («de-mo-c-rat» en ingles):
 *     se queda el primero de los dos cortes;
 *   - una sigla en mayusculas no se parte (UNESCO).
 *
 * Solo hay patrones de español e ingles: en los demas idiomas no se parte, y
 * el parrafo se justifica con espacios mas holgados.
 */
import * as en from './patrones/en'
import * as es from './patrones/es'

export type IdiomaParticion = 'es' | 'en'

const PATRONES: Record<IdiomaParticion, { MINIMOS: { izquierda: number; derecha: number }; PATRONES: string; EXCEPCIONES: string }> = { es, en }

/** Vocales del español, con tilde y dieresis. La «y» final no cuenta: «rey» no tiene dos vocales. */
const VOCAL = /[aeiouáéíóúü]/u

export const LETRAS_MINIMAS = 5

export class Particion {
  readonly idioma: IdiomaParticion
  private readonly patrones = new Map<string, number[]>()
  private readonly excepciones = new Map<string, number[]>()
  private readonly izquierda: number
  private readonly derecha: number
  private readonly largoMaximo: number

  constructor(idioma: IdiomaParticion) {
    this.idioma = idioma
    const datos = PATRONES[idioma]
    this.izquierda = datos.MINIMOS.izquierda
    this.derecha = datos.MINIMOS.derecha
    let largo = 0
    for (const p of datos.PATRONES.split(' ')) {
      if (!p) continue
      const letras = p.replace(/\d/gu, '')
      const valores: number[] = []
      let i = 0
      for (const c of p) {
        if (c >= '0' && c <= '9') valores[i] = Number(c)
        else i++
      }
      this.patrones.set(letras, valores)
      largo = Math.max(largo, [...letras].length)
    }
    this.largoMaximo = largo
    for (const e of datos.EXCEPCIONES.split(' ')) {
      if (!e) continue
      const cortes: number[] = []
      let n = 0
      for (const c of e) {
        if (c === '-') cortes.push(n)
        else n++
      }
      this.excepciones.set(e.replace(/-/gu, ''), cortes)
    }
  }

  /** Lo que dicen los patrones (o la lista de excepciones), sin las reglas de encima. */
  silabas(palabra: string): number[] {
    const minus = palabra.toLowerCase()
    const exc = this.excepciones.get(minus)
    if (exc) return exc.filter((i) => i >= this.izquierda && i <= [...palabra].length - this.derecha)
    const w = ['.', ...minus, '.']
    const v = new Array<number>(w.length + 1).fill(0)
    for (let i = 0; i < w.length; i++) {
      let s = ''
      for (let j = i; j < w.length && j - i < this.largoMaximo; j++) {
        s += w[j]
        const n = this.patrones.get(s)
        if (!n) continue
        for (let k = 0; k < n.length; k++) {
          const x = n[k]
          if (x !== undefined && x > (v[i + k] as number)) v[i + k] = x
        }
      }
    }
    const r: number[] = []
    const largo = w.length - 2
    // v[i + 1] es el valor entre la letra i-1 y la i de la palabra (el «.» va delante).
    for (let i = this.izquierda; i <= largo - this.derecha; i++) if ((v[i + 1] as number) % 2 === 1) r.push(i)
    return r
  }

  /**
   * Donde se puede poner un guion en esta palabra: los indices (en puntos de
   * codigo) DESPUES de los cuales se corta. Vacio si no se debe partir.
   * La palabra son solo letras: la puntuacion la separa quien llama.
   */
  cortes(palabra: string): number[] {
    const letras = [...palabra]
    if (letras.length < LETRAS_MINIMAS) return []
    if (palabra === palabra.toUpperCase() && palabra !== palabra.toLowerCase()) return []
    let r = this.silabas(palabra)
    if (this.idioma === 'es') {
      const minus = [...palabra.toLowerCase()]
      r = r.filter((i) => !(VOCAL.test(minus[i - 1] as string) && VOCAL.test(minus[i] as string)))
    }
    // Ningun trozo de una sola letra entre dos cortes.
    const limpios: number[] = []
    for (const i of r) {
      const anterior = limpios[limpios.length - 1]
      if (anterior === undefined || i - anterior >= 2) limpios.push(i)
    }
    return limpios
  }

  /** La palabra con sus guiones, para leerla: «ca-ba-llo». */
  partida(palabra: string): string {
    const letras = [...palabra]
    const cortes = new Set(this.cortes(palabra))
    return letras.map((c, i) => (cortes.has(i) ? '-' : '') + c).join('')
  }
}

const cache = new Map<IdiomaParticion, Particion>()

/** La particion de un idioma, o null si no hay patrones para el. Se construye una vez. */
export function particionDe(idioma: string): Particion | null {
  const base = idioma.toLowerCase().split(/[-_]/u)[0]
  if (base !== 'es' && base !== 'en') return null
  let p = cache.get(base)
  if (!p) {
    p = new Particion(base)
    cache.set(base, p)
  }
  return p
}
