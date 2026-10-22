import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { construir } from '../src/core/construir'
import { leerCopia } from '../src/app/abrir-copia'
import { exportar } from '../src/app/exportar'
import type { Imagen } from '../src/app/modelo'
import { correrMotor } from '../src/app/motor'
import { abrirEpub, resolver } from '../src/app/vista-previa'
import { leerProyecto } from '../scripts/leer-proyecto'

/**
 * H6, «terminado cuando»: el EPUB que se descarga desde el navegador es
 * EQUIVALENTE al del generador para el mismo libro de prueba.
 *
 * El camino es el de verdad: la carpeta del libro del generador, abierta en la
 * app (H7), convertida al modelo, exportada y empaquetada por el motor tal como
 * corre en su hilo. Se compara con el motor sobre la carpeta, que los golden
 * tests ya prueban identico al Python archivo a archivo.
 *
 * No puede ser identico byte a byte, y no es un fallo: la app nombra los
 * archivos por posicion (el cuarto archivo de capitulos/ es su capitulo 4,
 * aunque se llame cap05-epilogo.md) y las imagenes por su sitio (capNN-KK). Se
 * compara lo que ve quien lee: el orden de lectura, el texto de cada pagina,
 * cada imagen por su CONTENIDO, la hoja de estilos y los metadatos.
 */

const LIBRO = join(import.meta.dirname, 'fixtures', 'libro-prueba')
const AHORA = Date.parse('2026-03-01T09:30:00Z')

function carpeta(raiz: string): Map<string, Uint8Array> {
  const salida = new Map<string, Uint8Array>()
  const recorrer = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const ruta = join(dir, e)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else salida.set(relative(raiz, ruta).split('\\').join('/'), new Uint8Array(readFileSync(ruta)))
    }
  }
  recorrer(raiz)
  return salida
}

/** El libro, por el camino de la app: abrir la carpeta, el modelo, exportar, el motor del hilo. */
function porLaApp() {
  let n = 0
  const r = leerCopia(carpeta(LIBRO), (p) => `${p}-${++n}`)
  if (!r.ok) throw new Error(r.error)
  const { proyecto, imagenes } = r.copia
  const meta = new Map<string, Imagen>(
    imagenes.map((i) => [i.id, { id: i.id, nombreOriginal: i.nombreOriginal, tipo: i.info.tipo === 'jpeg' ? 'jpeg' : 'png', bytes: i.bytes.length, ancho: i.info.ancho, alto: i.info.alto }]),
  )
  const fuentes = leerProyecto(LIBRO).fuentes
  const ex = exportar(proyecto, meta, new Map(imagenes.map((i) => [i.id, i.bytes])), fuentes)
  return { motor: correrMotor({ proyecto: ex.proyecto, ahora: AHORA }), ilustraciones: ex.proyecto.ilustraciones }
}

/** El mismo libro, por el motor sobre la carpeta (= el Python, por los golden tests). */
function porElGenerador() {
  const carpetaDelLibro = leerProyecto(LIBRO)
  return { motor: construir(carpetaDelLibro, { ahora: new Date(AHORA) }), ilustraciones: carpetaDelLibro.ilustraciones }
}

const sha = (b: Uint8Array | undefined): string => (b ? createHash('sha256').update(b).digest('hex').slice(0, 16) : 'FALTA')
const texto = (b: Uint8Array | undefined): string => (b ? new TextDecoder().decode(b) : '')

/**
 * Lo que ve quien lee, sin los nombres de archivo: cada pagina en orden de
 * lectura, con sus enlaces a otras paginas cambiados por su posicion en la
 * espina, sus imagenes por el sha256 de sus bytes, y los ids fuera.
 */
function loQueSeLee(epub: Uint8Array) {
  const e = abrirEpub(epub)
  const posicion = new Map(e.paginas.map((p, i) => [p.ruta, i]))
  const paginas = e.paginas.map((p) => {
    const html = texto(e.archivos.get(p.ruta))
    const cuerpo = (/<body[\s\S]*<\/body>/u.exec(html)?.[0] ?? '')
      .replace(/\b(src)="([^"]+)"/gu, (_m, a: string, v: string) => `${a}="img:${sha(e.archivos.get(resolver(p.ruta, v)))}"`)
      .replace(/\bhref="([^"#]*)(#[^"]*)?"/gu, (_m, v: string) => (v ? `href="pagina:${posicion.get(resolver(p.ruta, v)) ?? v}"` : 'href=""'))
      .replace(/\b(id|aria-labelledby)="[^"]*"/gu, '$1=""')
    return { titulo: p.titulo, cuerpo }
  })
  const opf = texto(e.archivos.get('OEBPS/content.opf'))
  const metadatos = [...opf.matchAll(/<(dc:[a-z]+|meta property="[^"]+")[^>]*>([^<]*)</gu)].map((m) => `${m[1]}=${m[2]}`)
  const imagenes = [...e.archivos.entries()].filter(([r]) => /\.(png|jpe?g)$/u.test(r)).map(([, b]) => sha(b)).sort()
  return { paginas, metadatos, imagenes, css: texto(e.archivos.get('OEBPS/estilos/estilo.css')) }
}

describe('EL EPUB DE LA APP ES EQUIVALENTE AL DEL GENERADOR, para el libro de prueba', () => {
  const { motor: app, ilustraciones: deLaApp } = porLaApp()
  const { motor: gen, ilustraciones: delGenerador } = porElGenerador()

  for (const tienda of ['Kindle', 'AppleBooks'] as const) {
    describe(tienda, () => {
      const a = loQueSeLee(app.resultados.find((r) => r.tienda === tienda)?.bytes as Uint8Array)
      const g = loQueSeLee(gen.resultados.find((r) => r.tienda === tienda)?.bytes as Uint8Array)

      it('las mismas paginas, en el mismo orden de lectura', () => {
        expect(a.paginas.map((p) => p.titulo)).toEqual(g.paginas.map((p) => p.titulo))
      })

      it('cada pagina dice lo mismo, con las mismas imagenes y los mismos enlaces', () => {
        for (const [i, p] of g.paginas.entries()) expect(a.paginas[i]?.cuerpo, `pagina ${i}: ${p.titulo}`).toBe(p.cuerpo)
      })

      it('las mismas imagenes, byte a byte: ninguna se recodifica', () => {
        expect(a.imagenes).toEqual(g.imagenes)
      })

      it('la misma hoja de estilos', () => {
        expect(a.css).toBe(g.css)
      })

      it('los mismos metadatos, identificador del libro incluido', () => {
        expect(a.metadatos).toEqual(g.metadatos)
      })
    })
  }

  it('y el motor avisa de lo mismo, sobre las mismas imagenes', () => {
    // Los avisos nombran la imagen por su archivo, y la app las renombra: la
    // misma ilustracion es cap02-01.png en la carpeta y cap02-02.png en la app
    // (la app numera primero la lamina de apertura). Se compara por contenido.
    const porContenido = (ilustraciones: readonly { ruta: string; bytes: Uint8Array }[]) => (m: string): string =>
      m.replace(/ilustraciones\/[^\s:]+/gu, (ruta) => `img:${sha(ilustraciones.find((x) => x.ruta === ruta)?.bytes)}`)
    // La imagen que no usa nadie la deja fuera la app al abrir la carpeta (y
    // lo dice alli): es el UNICO aviso del generador que la app no repite.
    const sinUsar = (m: string): boolean => m.includes('no está marcada en ningún capítulo')
    expect(app.diagnosticos.errores.map(porContenido(deLaApp))).toEqual(gen.diagnosticos.errores.map(porContenido(delGenerador)))
    expect(app.diagnosticos.avisos.filter((m) => !sinUsar(m)).map(porContenido(deLaApp))).toEqual(
      gen.diagnosticos.avisos.filter((m) => !sinUsar(m)).map(porContenido(delGenerador)),
    )
  })
})
