/**
 * La copia de seguridad: un .zip con la estructura de carpetas del generador,
 * MAS un `proyecto.json`.
 *
 * Las carpetas son el mismo `exportar()` que alimenta al motor, empaquetado tal
 * cual: libro.txt, capitulos/, ilustraciones/, portada/, extras/ y fuentes/.
 * Asi la copia es formato abierto: se lee con cualquier editor de texto, y el
 * generar_epub.py de referencia la convierte en los mismos dos EPUB.
 *
 * `proyecto.json` es el modelo de la app entero, y es lo que hace la copia SIN
 * PERDIDAS: el dialecto de las carpetas no puede guardar que una ilustracion es
 * decorativa, el nombre con que el autor subio cada imagen, ni con que titulo y
 * autor se descargo el libro por ultima vez (que es lo que avisa de un cambio
 * de identidad ante las tiendas). Al abrir la copia se usa el json, salvo que
 * los archivos de texto se hayan cambiado fuera de Pubteca: ver abrir-copia.ts.
 */
import { zipSync, type Zippable } from 'fflate'
import { nombreSeguro } from '../core/texto'
import type { Exportado } from './exportar'
import { VERSION_PROYECTO, type Imagen, type Proyecto } from './modelo'

/** Lo que va en proyecto.json. */
export interface ProyectoJson {
  readonly formato: 'pubteca'
  /** La version del MODELO (VERSION_PROYECTO): la misma regla que en IndexedDB. */
  readonly version: number
  /** Cuando se hizo la copia, en ISO 8601. */
  readonly creada: string
  readonly proyecto: Proyecto
  /** id de imagen -> donde estan sus bytes en el .zip y como la llamo el autor. */
  readonly imagenes: Readonly<Record<string, { readonly ruta: string; readonly nombreOriginal: string }>>
}

export const NOMBRE_JSON = 'proyecto.json'

const LEEME = `Copia de seguridad de Pubteca

Esta carpeta es tu libro entero, en archivos de texto y tus imagenes:

  libro.txt        los datos del libro (titulo, autor...)
  capitulos/       un archivo por capitulo, en el orden del libro
  extras/          dedicatoria, epigrafe y paginas del principio y del final
  ilustraciones/   los dibujos de cada capitulo
  portada/         portada, contraportada y logo
  fuentes/         la letra del EPUB de Apple Books (licencia OFL)

  proyecto.json    todo lo anterior tal como lo guarda Pubteca

Guarda este .zip fuera del navegador (en tu disco, en la nube o en un correo a
ti mismo): el navegador puede borrar lo que guarda si pasas tiempo sin abrir
Pubteca.

Para volver a abrirlo: en Pubteca, «Abrir copia (.zip)», en la pantalla de
inicio. Se abre como un libro nuevo, asi que no pisa nada.
`

export function zipDeCopia(e: Exportado, proyecto: Proyecto, imagenes: ReadonlyMap<string, Imagen>, ahora: Date): Uint8Array {
  const p = e.proyecto
  const json: ProyectoJson = {
    formato: 'pubteca',
    version: VERSION_PROYECTO,
    creada: ahora.toISOString(),
    proyecto,
    imagenes: Object.fromEntries(
      [...e.rutas].map(([id, ruta]) => [id, { ruta, nombreOriginal: imagenes.get(id)?.nombreOriginal ?? ruta }]),
    ),
  }
  const entradas: Zippable = {
    'LEEME.txt': [new TextEncoder().encode(LEEME), { level: 6 }],
    [NOMBRE_JSON]: [new TextEncoder().encode(JSON.stringify(json, null, 1)), { level: 6 }],
  }
  if (p.libroTxt !== undefined) entradas['libro.txt'] = [new TextEncoder().encode(p.libroTxt), { level: 6 }]
  for (const a of [...p.capitulos, ...p.extras]) entradas[a.ruta] = [a.bytes, { level: 6 }]
  // Las imagenes y las fuentes ya vienen comprimidas: guardarlas tal cual es
  // mas rapido y no cambia nada.
  for (const a of [...p.ilustraciones, ...p.portada, ...p.fuentes]) entradas[a.ruta] = [a.bytes, { level: 0 }]
  return zipSync(entradas)
}

export function nombreDeCopia(titulo: string, ahora: Date): string {
  const base = titulo.trim() ? nombreSeguro(titulo) : 'libro'
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${base}-copia-${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}.zip`
}

/**
 * Descarga unos bytes con un <a download>. Safari descarta las descargas que
 * perdieron la activacion del usuario, asi que hay que llamarla dentro del clic
 * (o muy poco despues): los EPUB se generan antes y se descargan en otro clic.
 */
export function descargar(bytes: Uint8Array, nombre: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
