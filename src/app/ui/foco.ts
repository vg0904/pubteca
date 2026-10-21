/**
 * Un foco del reductor se aplica UNA sola vez. Si no, cada vez que se monta un
 * bloque (al volver a un capitulo) se repetiria el ultimo foco y el cursor
 * saltaria al titulo.
 */
import type { Foco } from '../estado'

let ultimoFoco = 0

export function focoPendiente(f: Foco): boolean {
  if (f.seq <= ultimoFoco) return false
  ultimoFoco = f.seq
  return true
}
