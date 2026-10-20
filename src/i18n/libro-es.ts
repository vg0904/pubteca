// Textos que acaban DENTRO del EPUB. Siguen el idioma del LIBRO, no el de la
// interfaz. Son los que hoy estan escritos en espanol dentro de generar_epub.py.
export const libro = {
  capitulo: 'Capitulo',
  prologo: 'Prologo',
  epilogo: 'Epilogo',
  interludio: 'Interludio',
  indice: 'Indice',
  guia: 'Guia',
  portada: 'Portada',
  contraportada: 'Contraportada',
  comienzo: 'Comienzo',
  derechos: 'Derechos',
  dedicatoria: 'Dedicatoria',
  epigrafe: 'Epigrafe',
  laminaColor: 'Lamina a color',
  ilustracion: 'Ilustracion',
  edicionDigital: 'Edicion digital',
  publicadoPor: 'Publicado por',
  portadaDe: 'Portada de',
  contraportadaDe: 'Contraportada de',
  isbn: 'ISBN',
  resumenAccesibilidad: 'Novela con navegacion por capitulos.',
} as const

export type TextosLibro = typeof libro
