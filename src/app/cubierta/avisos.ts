/**
 * Los avisos de la cubierta, agrupados por clase y con su nivel: aviso (algo
 * que mirar antes de subirla) o nota (algo que se hizo solo). Nada bloquea.
 * El de color (sRGB) no va aqui: la pantalla lo dice siempre, arriba.
 */
import type { AvisoCubierta } from '../../core/impreso/cubierta'

const NIVEL: Readonly<Record<AvisoCubierta['codigo'], 'aviso' | 'nota'>> = {
  resolucionArte: 'aviso',
  sinPortada: 'aviso',
  lomoEstrecho: 'aviso',
  codigoSinIsbn: 'aviso',
  contrasteBajo: 'aviso',
  sinopsisCortada: 'aviso',
  lomoSinTexto: 'nota',
  isotipoOmitido: 'nota',
  sinIsotipo: 'nota',
  codigoKdp: 'nota',
  velo: 'nota',
  colorRgb: 'nota',
  lomoDeIngram: 'nota',
}

export function avisosDeCubierta(avisos: readonly AvisoCubierta[]): { readonly aviso: AvisoCubierta; readonly nivel: 'aviso' | 'nota' }[] {
  const vistos = new Set<string>()
  const r = avisos.filter((a) => a.codigo !== 'colorRgb').filter((a) => {
    const k = JSON.stringify(a)
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  const conNivel = r.map((aviso) => ({ aviso, nivel: NIVEL[aviso.codigo] }))
  return [...conNivel.filter((x) => x.nivel === 'aviso'), ...conNivel.filter((x) => x.nivel === 'nota')]
}
