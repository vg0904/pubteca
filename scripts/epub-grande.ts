/**
 * El libro de prueba con medios, pero con un video de 300 MB.
 *
 * Es la prueba del hito M2 (plan.md): un EPUB con 300 MB de video se arma sin
 * que el motor reciba esos bytes. El video se GENERA aqui, en un archivo
 * temporal que se borra al terminar: nunca entra al repo. Es el video del
 * fixture seguido de una caja `free` de MPEG-4 rellena de ceros, que es un
 * archivo MPEG-4 valido (los reproductores se saltan esa caja).
 *
 * Lo que comprueba, y por eso falla si algo no se cumple:
 *   - el motor recibe el video como FICHA (tamaño y CRC), sin sus bytes;
 *   - el EPUB se escribe a disco por trozos, y la memoria del proceso no pasa
 *     de 250 MB: si el video hubiera pasado por el motor, pasaria de 300;
 *   - `unzip -t` lee el archivo entero y comprueba cada CRC.
 * CI lo pasa ademas por EPUBCheck 5.3.0 y 5.4.0, con los demas.
 *
 * Uso: npx tsx scripts/epub-grande.ts [carpeta-de-salida]
 */
import { execFileSync } from 'node:child_process'
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { construir } from '../src/core/construir.ts'
import { crc32 } from '../src/core/crc32.ts'
import { esFicha, ficha } from '../src/core/proyecto.ts'
import { esHueco } from '../src/core/zip.ts'
import { leerProyecto } from './leer-proyecto.ts'

const TAMANO = 300_000_000
const TROZO = 8 * 1024 * 1024
const LIMITE_MEMORIA = 250_000_000
const FIXTURE = resolve(import.meta.dirname, '..', 'tests', 'fixtures', 'libro-medios')

let pico = 0
const medir = (): void => {
  pico = Math.max(pico, process.memoryUsage().rss)
}

function main(): number {
  const salida = resolve(process.argv[2] ?? 'tmp/epubs')
  const temporal = mkdtempSync(join(tmpdir(), 'pubteca-grande-'))
  try {
    // 1. El video de 300 MB, a disco y con su CRC, sin tenerlo nunca entero.
    const base = new Uint8Array(readFileSync(join(FIXTURE, 'medios', 'cap01-v01.m4v')))
    const rutaVideo = join(temporal, 'cap01-v01.m4v')
    const fd = openSync(rutaVideo, 'w')
    const caja = new Uint8Array(8)
    new DataView(caja.buffer).setUint32(0, TAMANO - base.length)
    caja.set(new TextEncoder().encode('free'), 4)
    writeSync(fd, base)
    writeSync(fd, caja)
    let crc = crc32(caja, crc32(base))
    const ceros = new Uint8Array(TROZO)
    for (let quedan = TAMANO - base.length - caja.length; quedan > 0; quedan -= TROZO) {
      const t = ceros.subarray(0, Math.min(TROZO, quedan))
      writeSync(fd, t)
      crc = crc32(t, crc)
      medir()
    }
    closeSync(fd)

    // 2. El proyecto: TODOS los medios como ficha, el grande incluido.
    const p = leerProyecto(FIXTURE)
    const enDisco = new Map<string, string>()
    const medios = (p.medios ?? []).map((a) => {
      if (esFicha(a) || !/\.(m4v|m4a)$/u.test(a.nombre)) return a
      if (a.nombre === 'cap01-v01.m4v') {
        enDisco.set(a.ruta, rutaVideo)
        return ficha(a.ruta, TAMANO, crc)
      }
      enDisco.set(a.ruta, join(FIXTURE, a.ruta))
      return ficha(a.ruta, a.bytes.length, crc32(a.bytes))
    })
    if (medios.some((a) => !esFicha(a) && /\.(m4v|m4a)$/u.test(a.nombre))) throw new Error('un medio llego con sus bytes')

    const c = construir({ ...p, medios }, { ahora: new Date(process.env['PUBTECA_FECHA'] ?? '2026-11-11T12:00:00Z') })
    medir()
    if (c.diagnosticos.errores.length > 0) throw new Error(c.diagnosticos.errores.join('\n'))
    const apple = c.resultados.find((r) => r.tienda === 'AppleBooks')
    if (!apple || apple.bytes !== null) throw new Error('el motor no deberia tener el EPUB entero')

    // 3. A disco, trozo a trozo: lo que en el navegador hace el Blob de Blobs.
    mkdirSync(salida, { recursive: true })
    const destino = join(salida, 'la_voz_del_faro_grande_AppleBooks.epub')
    const out = openSync(destino, 'w')
    const buffer = new Uint8Array(TROZO)
    for (const s of apple.segmentos) {
      if (!esHueco(s)) {
        writeSync(out, s)
        continue
      }
      const origen = enDisco.get(s.medio)
      if (!origen) throw new Error(`${s.medio}: no se de donde sacarlo`)
      const fin = openSync(origen, 'r')
      let copiados = 0
      for (let leidos = readSync(fin, buffer); leidos > 0; leidos = readSync(fin, buffer)) {
        writeSync(out, buffer.subarray(0, leidos))
        copiados += leidos
        medir()
      }
      closeSync(fin)
      if (copiados !== s.tamano) throw new Error(`${s.medio}: ${copiados} bytes, el EPUB espera ${s.tamano}`)
    }
    closeSync(out)

    // 4. unzip -t lee cada entrada y comprueba su CRC.
    const t = execFileSync('unzip', ['-t', destino], { encoding: 'utf8', maxBuffer: 1 << 20 })
    if (!/No errors detected/u.test(t)) throw new Error(`unzip -t no lo da por bueno:\n${t}`)

    const mb = (n: number): string => `${(n / 1e6).toFixed(0)} MB`
    console.log(`${destino}: ${mb(apple.tamano)} (video de ${mb(TAMANO)} como ficha)`)
    console.log(`unzip -t: sin errores · memoria del proceso, pico: ${mb(pico)}`)
    if (pico > LIMITE_MEMORIA) throw new Error(`la memoria llego a ${mb(pico)}: el video paso por memoria`)
    return 0
  } finally {
    rmSync(temporal, { recursive: true, force: true })
  }
}

process.exit(main())
