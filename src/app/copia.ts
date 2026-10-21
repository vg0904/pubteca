/**
 * La copia de seguridad: un .zip con la estructura de carpetas del generador.
 *
 * Es el mismo `exportar()` que alimenta al motor, empaquetado tal cual:
 * libro.txt, capitulos/, ilustraciones/, portada/, extras/ y fuentes/. Asi la
 * copia es tambien formato abierto: se lee con cualquier editor de texto, y el
 * generar_epub.py de referencia la convierte en los mismos dos EPUB.
 *
 * NOTA: el proyecto.json canonico y volver a abrir la copia en la app son del
 * hito H7. Lo que hay aqui ya protege el texto, que es lo que el navegador
 * puede borrar.
 */
import { zipSync, type Zippable } from 'fflate'
import { nombreSeguro } from '../core/texto'
import type { Exportado } from './exportar'

const LEEME = `Copia de seguridad de Pubteca

Esta carpeta es tu libro entero, en archivos de texto y tus imagenes:

  libro.txt        los datos del libro (titulo, autor...)
  capitulos/       un archivo por capitulo, en el orden del libro
  extras/          dedicatoria, epigrafe y paginas del principio y del final
  ilustraciones/   los dibujos de cada capitulo
  portada/         portada, contraportada y logo
  fuentes/         la letra del EPUB de Apple Books (licencia OFL)

Guarda este .zip fuera del navegador (en tu disco, en la nube o en un correo a
ti mismo): el navegador puede borrar lo que guarda si pasas tiempo sin abrir
Pubteca.
`

export function zipDeCopia(e: Exportado): Uint8Array {
  const p = e.proyecto
  const entradas: Zippable = { 'LEEME.txt': [new TextEncoder().encode(LEEME), { level: 6 }] }
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
