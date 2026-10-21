/**
 * Ids nuevos. Viven fuera del reductor: el reductor es puro y los recibe en la
 * accion, asi que un test le puede dar ids previsibles.
 */
export function crearId(prefijo: string): string {
  return `${prefijo}-${crypto.randomUUID()}`
}
