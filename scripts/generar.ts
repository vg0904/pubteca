/**
 * Invoca el core desde Node, sin navegador.
 *
 * Es lo que permite que CI genere los libros de prueba y los pase por
 * EPUBCheck: el core es TypeScript puro y sincrono, asi que no necesita
 * ni DOM ni canvas.
 *
 * Uso:
 *   npm run generar -- tests/fixtures/libro-prueba [carpeta-de-salida]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { construir } from '../src/core/construir.ts'
import { reporte } from '../src/core/reporte.ts'
import { leerProyecto } from './leer-proyecto.ts'

function main(): number {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Uso: npm run generar -- <carpeta-del-libro> [carpeta-de-salida]')
    return 2
  }
  const raiz = resolve(args[0] as string)
  const salida = resolve(args[1] ?? join(raiz, 'salida'))

  // Reloj fijo si se pide, para que dos ejecuciones den archivos identicos.
  const ahora = process.env['PUBTECA_FECHA']
    ? new Date(process.env['PUBTECA_FECHA'])
    : new Date()

  const c = construir(leerProyecto(raiz), { ahora })

  if (c.bloqueado) {
    console.error(`✗ ${c.bloqueado}`)
    for (const e of c.diagnosticos.errores) console.error(`  ✗ ${e}`)
    return 1
  }

  mkdirSync(salida, { recursive: true })
  for (const res of c.resultados) {
    writeFileSync(join(salida, res.nombreArchivo), res.bytes)
  }
  const texto = reporte(c, ahora)
  writeFileSync(join(salida, 'reporte.txt'), texto, 'utf8')
  console.log(texto)
  console.log(`En ${relative(process.cwd(), salida) || salida}`)
  return c.diagnosticos.hayErrores ? 1 : 0
}

process.exit(main())
