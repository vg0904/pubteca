/**
 * Edicion de un bloque de versos, pura.
 *
 * En la interfaz un verso es UNA linea con su formato (ver `unirTramos` en
 * importar/dialecto.ts): la cursiva o la negrita van en el verso entero, igual
 * que las guarda el modelo. Asi el editor no puede ensenar una cursiva a medio
 * verso que al guardar se perderia.
 *
 * Las teclas, como en una lista de un procesador de texto:
 *   - Intro parte el verso;
 *   - Intro en un verso vacio abre estrofa nueva;
 *   - Intro en el verso vacio de una estrofa que acaba de empezar sale del
 *     bloque y sigue en un parrafo;
 *   - Borrar al principio de un verso lo une con el anterior.
 */
import type { Marca, Tramo } from './modelo'
import { limpiarTexto } from './tramos'

export type Estrofas = readonly (readonly Tramo[])[]

/** Donde queda el cursor: estrofa, verso y desplazamiento. */
export interface PosVerso {
  readonly estrofa: number
  readonly verso: number
  readonly offset: number
}

export interface Cambio {
  readonly estrofas: Tramo[][]
  readonly foco: PosVerso
}

const copia = (e: Estrofas): Tramo[][] => e.map((x) => x.map((v) => ({ texto: v.texto, marcas: [...v.marcas] })))

/** Un verso nuevo, vacio, con las marcas del que se parte. */
const vacio = (marcas: readonly Marca[] = []): Tramo => ({ texto: '', marcas: [...marcas] })

/** Cambia el texto de un verso. */
export function escribirVerso(estrofas: Estrofas, estrofa: number, verso: number, texto: string): Tramo[][] {
  const r = copia(estrofas)
  const v = r[estrofa]?.[verso]
  if (v) r[estrofa]![verso] = { texto: limpiarTexto(texto), marcas: v.marcas }
  return r
}

/** Pone o quita una marca en el verso ENTERO. */
export function alternarMarcaVerso(estrofas: Estrofas, estrofa: number, verso: number, marca: Marca): Tramo[][] {
  const r = copia(estrofas)
  const v = r[estrofa]?.[verso]
  if (!v) return r
  const marcas = v.marcas.includes(marca) ? v.marcas.filter((m) => m !== marca) : [...v.marcas, marca]
  // El orden canonico: cursiva antes que negrita, como en normalizarTramos.
  r[estrofa]![verso] = { texto: v.texto, marcas: (['cursiva', 'negrita'] as const).filter((m) => marcas.includes(m)) }
  return r
}

/**
 * Intro dentro de un verso.
 *
 * Devuelve `salir` cuando el autor pulsa Intro en el verso vacio de una
 * estrofa que acaba de abrir: quiere seguir escribiendo prosa. La estrofa vacia
 * se quita y la interfaz abre un parrafo detras del bloque.
 */
export function intro(estrofas: Estrofas, pos: PosVerso): Cambio | { readonly salir: Tramo[][] } {
  const r = copia(estrofas)
  const e = r[pos.estrofa]
  const v = e?.[pos.verso]
  if (!e || !v) return { estrofas: r, foco: pos }

  if (v.texto === '') {
    // Verso vacio y unico de una estrofa que no es la primera: salir.
    if (e.length === 1 && pos.estrofa > 0) {
      r.splice(pos.estrofa, 1)
      return { salir: r }
    }
    // Verso vacio al final de la estrofa: lo que sigue es otra estrofa.
    if (pos.verso === e.length - 1 && e.length > 1) {
      e.splice(pos.verso, 1)
      r.splice(pos.estrofa + 1, 0, [vacio(v.marcas)])
      return { estrofas: r, foco: { estrofa: pos.estrofa + 1, verso: 0, offset: 0 } }
    }
  }

  const antes = v.texto.slice(0, pos.offset)
  const despues = v.texto.slice(pos.offset)
  e[pos.verso] = { texto: antes, marcas: v.marcas }
  e.splice(pos.verso + 1, 0, { texto: despues, marcas: [...v.marcas] })
  return { estrofas: r, foco: { estrofa: pos.estrofa, verso: pos.verso + 1, offset: 0 } }
}

/**
 * Borrar al principio de un verso.
 *
 * Devuelve null en el primer verso de la primera estrofa: ahi no hay nada a
 * lo que unirse, y es la interfaz la que decide (borrar el bloque si esta
 * vacio, o ir al bloque anterior).
 */
export function borrarAlInicio(estrofas: Estrofas, pos: PosVerso): Cambio | null {
  const r = copia(estrofas)
  const e = r[pos.estrofa]
  const v = e?.[pos.verso]
  if (!e || !v) return null

  if (pos.verso > 0) {
    const previo = e[pos.verso - 1] as Tramo
    e[pos.verso - 1] = { texto: previo.texto + v.texto, marcas: previo.marcas }
    e.splice(pos.verso, 1)
    return { estrofas: r, foco: { estrofa: pos.estrofa, verso: pos.verso - 1, offset: previo.texto.length } }
  }
  if (pos.estrofa > 0) {
    // Al principio de una estrofa: se une con la anterior (se quita el hueco).
    const anterior = r[pos.estrofa - 1] as Tramo[]
    const ultimo = anterior.length - 1
    r.splice(pos.estrofa, 1)
    anterior.push(...e)
    return {
      estrofas: r,
      foco: { estrofa: pos.estrofa - 1, verso: ultimo + 1, offset: 0 },
    }
  }
  return null
}

/** Si el bloque ya no tiene nada escrito. */
export function versosVacios(estrofas: Estrofas): boolean {
  return estrofas.every((e) => e.every((v) => v.texto.trim() === ''))
}

/** Pega varias lineas en un verso: cada linea es un verso; una vacia, estrofa nueva. */
export function pegarLineas(estrofas: Estrofas, pos: PosVerso, fin: number, lineas: readonly string[]): Cambio {
  const r = copia(estrofas)
  const e = r[pos.estrofa]
  const v = e?.[pos.verso]
  if (!e || !v || lineas.length === 0) return { estrofas: r, foco: pos }
  const antes = v.texto.slice(0, pos.offset)
  const despues = v.texto.slice(Math.max(fin, pos.offset))

  // Se construye la secuencia de versos y cortes de estrofa a insertar.
  const grupos: string[][] = [[]]
  for (const l of lineas.map(limpiarTexto)) {
    if (l.trim() === '') {
      if ((grupos[grupos.length - 1] as string[]).length > 0) grupos.push([])
    } else {
      ;(grupos[grupos.length - 1] as string[]).push(l.trim())
    }
  }
  if ((grupos[grupos.length - 1] as string[]).length === 0 && grupos.length > 1) grupos.pop()
  const primero = grupos[0] as string[]
  if (primero.length === 0) return { estrofas: r, foco: pos }

  const ultimoGrupo = grupos[grupos.length - 1] as string[]
  const ultimaLinea = ultimoGrupo[ultimoGrupo.length - 1] as string
  const m = v.marcas
  const nuevos: Tramo[][] = grupos.map((g) => g.map((t) => ({ texto: t, marcas: [...m] })))
  // El primer verso pegado se une con lo que habia antes del cursor, y el
  // ultimo con lo que habia despues.
  const g0 = nuevos[0] as Tramo[]
  g0[0] = { texto: antes + (g0[0] as Tramo).texto, marcas: [...m] }
  const gu = nuevos[nuevos.length - 1] as Tramo[]
  const offset = (gu.length === 1 && nuevos.length === 1 ? antes.length : 0) + ultimaLinea.length
  gu[gu.length - 1] = { texto: (gu[gu.length - 1] as Tramo).texto + despues, marcas: [...m] }

  const resto = e.slice(pos.verso + 1)
  const cabeza = e.slice(0, pos.verso)
  const salida: Tramo[][] = [
    ...r.slice(0, pos.estrofa),
    [...cabeza, ...(nuevos[0] as Tramo[])],
    ...nuevos.slice(1),
  ]
  ;(salida[salida.length - 1] as Tramo[]).push(...resto)
  salida.push(...r.slice(pos.estrofa + 1))

  const estrofaFoco = pos.estrofa + nuevos.length - 1
  const versoFoco = (nuevos.length === 1 ? cabeza.length : 0) + gu.length - 1
  return { estrofas: salida, foco: { estrofa: estrofaFoco, verso: versoFoco, offset } }
}
