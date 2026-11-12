/**
 * Los avisos del impreso, agrupados: uno por clase, con todos sus casos
 * dentro (tres imagenes bajas de resolucion son UN aviso con tres nombres, no
 * tres renglones). Cada clase con su nivel: aviso (algo que el autor deberia
 * mirar antes de subirlo) o nota (algo que se hizo solo y conviene saber).
 * Nada bloquea: el PDF se prepara igual.
 */
import type { AvisoImpreso } from '../../core/impreso/tipos'

export type CodigoImpreso = AvisoImpreso['codigo']

const NIVEL: Readonly<Record<CodigoImpreso, 'aviso' | 'nota'>> = {
  faltanGlifos: 'aviso',
  lineaDesbordada: 'aviso',
  ilustracionPerdida: 'aviso',
  resolucionBaja: 'aviso',
  paginasFueraDeRango: 'aviso',
  medidaFuera: 'aviso',
  isbnNoValido: 'aviso',
  blancasSeguidas: 'aviso',
  adornoSinGlifo: 'nota',
  guionEnImpar: 'nota',
  sinParticion: 'nota',
  margenSubido: 'nota',
  mediosFuera: 'nota',
  laminasOmitidas: 'nota',
  sinIsbn: 'nota',
  sinTitulo: 'aviso',
  sinAutor: 'aviso',
}

export interface GrupoImpreso<C extends CodigoImpreso = CodigoImpreso> {
  readonly codigo: C
  readonly nivel: 'aviso' | 'nota'
  readonly casos: readonly Extract<AvisoImpreso, { codigo: C }>[]
}

/** Agrupa por clase: primero los avisos y luego las notas, cada uno en el orden en que salio. */
export function agruparAvisos(avisos: readonly AvisoImpreso[]): GrupoImpreso[] {
  const grupos = new Map<CodigoImpreso, AvisoImpreso[]>()
  for (const a of avisos) {
    const g = grupos.get(a.codigo)
    if (g) {
      // El mismo caso dos veces (dos vueltas del medianil, una imagen en dos sitios) es uno.
      if (!g.some((x) => JSON.stringify(x) === JSON.stringify(a))) g.push(a)
    } else grupos.set(a.codigo, [a])
  }
  const lista = [...grupos].map(([codigo, casos]) => ({ codigo, nivel: NIVEL[codigo], casos }) as GrupoImpreso)
  return [...lista.filter((g) => g.nivel === 'aviso'), ...lista.filter((g) => g.nivel === 'nota')]
}
