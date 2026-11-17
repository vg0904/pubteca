/**
 * El libro web desde Node, sin navegador: la CARPETA que iria dentro del .zip,
 * ya abierta, para servirla y mirarla.
 *
 * Uso:
 *   npm run web -- tests/fixtures/libro-prueba [carpeta-de-salida]
 *   npx serve tmp/web/libro-prueba
 *
 * Variables: PUBTECA_FECHA (reloj fijo), PUBTECA_OMITIR (rutas separadas por
 * comas: `capitulos/cap02.md`), PUBTECA_ENLACES (`Nombre=https://…` separados
 * por comas), PUBTECA_MODO (`desplazar` o `paginas`), PUBTECA_LETRA (`literata`,
 * `eb-garamond`, `sistema`…) y PUBTECA_LEEME (`es` o `en`).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { CONFIG_WEB_POR_DEFECTO } from '../src/core/web/config.ts'
import { construirWeb } from '../src/core/web/construir.ts'
import { leerProyecto } from './leer-proyecto.ts'

const LECTOR = join(import.meta.dirname, '..', 'src', 'lector')
const LETRAS = join(import.meta.dirname, '..', 'public', 'fuentes', 'impreso')

function main(): number {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Uso: npm run web -- <carpeta-del-libro> [carpeta-de-salida]')
    return 2
  }
  const raiz = resolve(args[0] as string)
  const salida = resolve(args[1] ?? join('tmp', 'web', basename(raiz)))
  const ahora = process.env['PUBTECA_FECHA'] ? new Date(process.env['PUBTECA_FECHA']) : new Date()
  const lista = (v: string | undefined): string[] => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

  const letras = new Map(readdirSync(LETRAS).map((n) => [n, new Uint8Array(readFileSync(join(LETRAS, n)))]))
  const w = construirWeb(leerProyecto(raiz), {
    ahora,
    letras,
    lector: readFileSync(join(LECTOR, 'lector.js'), 'utf8'),
    leeme: readFileSync(join(LECTOR, process.env['PUBTECA_LEEME'] === 'en' ? 'LEEME.en.md' : 'LEEME.es.md'), 'utf8'),
    config: {
      ...CONFIG_WEB_POR_DEFECTO,
      aligerar: false,
      modo: process.env['PUBTECA_MODO'] === 'paginas' ? 'paginas' : 'desplazar',
      letra: process.env['PUBTECA_LETRA'] ?? CONFIG_WEB_POR_DEFECTO.letra,
      omitidos: lista(process.env['PUBTECA_OMITIR']),
      enlaces: lista(process.env['PUBTECA_ENLACES']).map((e) => {
        const corte = e.indexOf('=')
        return { etiqueta: corte < 0 ? '' : e.slice(0, corte), url: e.slice(corte + 1) }
      }),
    },
  })

  for (const e of w.diagnosticos.errores) console.error(`  ✗ ${e}`)
  for (const a of w.diagnosticos.avisos) console.error(`  ! ${a}`)
  for (const n of w.diagnosticos.notas) console.error(`  · ${n}`)
  const { videos, audios } = w.sinMedios
  if (videos + audios > 0) console.error(`  · ${videos} video(s) y ${audios} audio(s) no van en el libro web: lleva solo texto e ilustraciones.`)
  if (w.bloqueado) {
    console.error(`✗ ${w.bloqueado}`)
    return 1
  }

  rmSync(salida, { recursive: true, force: true })
  for (const a of w.archivos) {
    const ruta = join(salida, a.ruta)
    mkdirSync(dirname(ruta), { recursive: true })
    writeFileSync(ruta, a.datos)
  }
  writeFileSync(join(dirname(salida), w.nombreArchivo), w.bytes)
  console.log(`${w.archivos.length} archivos en ${relative(process.cwd(), salida) || salida} (y ${w.nombreArchivo}, ${w.bytes.length} bytes)`)
  return w.diagnosticos.hayErrores ? 1 : 0
}

process.exit(main())
