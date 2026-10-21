/**
 * Los textos que el motor escribe DENTRO del EPUB, en el idioma del LIBRO.
 *
 * Antes estaban en español dentro del codigo, igual que en el Python, y la
 * interfaz ofrecia elegir el idioma del libro: un libro en ingles salia con
 * `lang="en"` y un «Indice», un «Edicion digital» y un «Publicado por» en
 * español. El idioma solo cambiaba el diccionario de guiones del lector.
 *
 * La tabla del español reproduce EXACTAMENTE los textos del Python: los golden
 * tests lo vigilan. DIVERGENCIA solo cuando el idioma no es el español, y ahi
 * la salida del Python mezclaba dos idiomas.
 *
 * Los textos no se escapan aqui: quien los inserta en el XHTML los pasa por
 * esc(), como cualquier otro texto.
 */

export interface TextosLibro {
  readonly portada: string
  readonly portadaDe: (titulo: string) => string
  readonly contraportada: string
  readonly contraportadaDe: (titulo: string) => string
  readonly laminaColor: (n: number) => string
  readonly derechos: string
  readonly publicadoPor: (sello: string) => string
  readonly edicionDigital: (anio: string) => string
  readonly dedicatoria: string
  readonly epigrafe: string
  /** El alt de una ilustracion sin descripcion. */
  readonly ilustracion: string
  /** El titulo de la pagina de una ilustracion. */
  readonly ilustracionDe: (titulo: string) => string
  readonly indice: string
  readonly comienzo: string
  readonly guia: string
  readonly resumenAccesibilidad: string
  readonly conDescripciones: string
  readonly sinDescripciones: string
  /**
   * La linea de derechos que se propone. Lleva las MISMAS marcas en todos los
   * idiomas ({año}, {autor}), que son las que el motor sustituye.
   */
  readonly derechosPorDefecto: string
}

const ES: TextosLibro = {
  portada: 'Portada',
  portadaDe: (t) => `Portada de ${t}`,
  contraportada: 'Contraportada',
  contraportadaDe: (t) => `Contraportada de ${t}`,
  laminaColor: (n) => `Lámina a color ${n}`,
  derechos: 'Derechos',
  publicadoPor: (s) => `Publicado por ${s}`,
  edicionDigital: (a) => `Edición digital, ${a}`,
  dedicatoria: 'Dedicatoria',
  epigrafe: 'Epígrafe',
  ilustracion: 'Ilustración',
  ilustracionDe: (t) => `Ilustración · ${t}`,
  indice: 'Índice',
  comienzo: 'Comienzo',
  guia: 'Guía',
  resumenAccesibilidad: 'Novela con navegación por capítulos.',
  conDescripciones: ' Las ilustraciones incluyen descripción alternativa.',
  sinDescripciones: ' Algunas ilustraciones no tienen descripción alternativa.',
  derechosPorDefecto: '© {año} {autor}. Todos los derechos reservados.',
}

const EN: TextosLibro = {
  portada: 'Cover',
  portadaDe: (t) => `Cover of ${t}`,
  contraportada: 'Back cover',
  contraportadaDe: (t) => `Back cover of ${t}`,
  laminaColor: (n) => `Color plate ${n}`,
  derechos: 'Copyright',
  publicadoPor: (s) => `Published by ${s}`,
  edicionDigital: (a) => `Digital edition, ${a}`,
  dedicatoria: 'Dedication',
  epigrafe: 'Epigraph',
  ilustracion: 'Illustration',
  ilustracionDe: (t) => `Illustration · ${t}`,
  indice: 'Contents',
  comienzo: 'Start',
  guia: 'Guide',
  resumenAccesibilidad: 'Novel with chapter navigation.',
  conDescripciones: ' The illustrations include alternative text.',
  sinDescripciones: ' Some illustrations have no alternative text.',
  derechosPorDefecto: '© {año} {autor}. All rights reserved.',
}

const PT: TextosLibro = {
  portada: 'Capa',
  portadaDe: (t) => `Capa de ${t}`,
  contraportada: 'Contracapa',
  contraportadaDe: (t) => `Contracapa de ${t}`,
  laminaColor: (n) => `Lâmina colorida ${n}`,
  derechos: 'Direitos',
  publicadoPor: (s) => `Publicado por ${s}`,
  edicionDigital: (a) => `Edição digital, ${a}`,
  dedicatoria: 'Dedicatória',
  epigrafe: 'Epígrafe',
  ilustracion: 'Ilustração',
  ilustracionDe: (t) => `Ilustração · ${t}`,
  indice: 'Índice',
  comienzo: 'Início',
  guia: 'Guia',
  resumenAccesibilidad: 'Romance com navegação por capítulos.',
  conDescripciones: ' As ilustrações incluem descrição alternativa.',
  sinDescripciones: ' Algumas ilustrações não têm descrição alternativa.',
  derechosPorDefecto: '© {año} {autor}. Todos os direitos reservados.',
}

const CA: TextosLibro = {
  portada: 'Coberta',
  portadaDe: (t) => `Coberta de ${t}`,
  contraportada: 'Contracoberta',
  contraportadaDe: (t) => `Contracoberta de ${t}`,
  laminaColor: (n) => `Làmina en color ${n}`,
  derechos: 'Drets',
  publicadoPor: (s) => `Publicat per ${s}`,
  edicionDigital: (a) => `Edició digital, ${a}`,
  dedicatoria: 'Dedicatòria',
  epigrafe: 'Epígraf',
  ilustracion: 'Il·lustració',
  ilustracionDe: (t) => `Il·lustració · ${t}`,
  indice: 'Índex',
  comienzo: 'Inici',
  guia: 'Guia',
  resumenAccesibilidad: 'Novel·la amb navegació per capítols.',
  conDescripciones: ' Les il·lustracions inclouen descripció alternativa.',
  sinDescripciones: ' Algunes il·lustracions no tenen descripció alternativa.',
  derechosPorDefecto: '© {año} {autor}. Tots els drets reservats.',
}

const GL: TextosLibro = {
  portada: 'Portada',
  portadaDe: (t) => `Portada de ${t}`,
  contraportada: 'Contraportada',
  contraportadaDe: (t) => `Contraportada de ${t}`,
  laminaColor: (n) => `Lámina en cor ${n}`,
  derechos: 'Dereitos',
  publicadoPor: (s) => `Publicado por ${s}`,
  edicionDigital: (a) => `Edición dixital, ${a}`,
  dedicatoria: 'Dedicatoria',
  epigrafe: 'Epígrafe',
  ilustracion: 'Ilustración',
  ilustracionDe: (t) => `Ilustración · ${t}`,
  indice: 'Índice',
  comienzo: 'Comezo',
  guia: 'Guía',
  resumenAccesibilidad: 'Novela con navegación por capítulos.',
  conDescripciones: ' As ilustracións inclúen descrición alternativa.',
  sinDescripciones: ' Algunhas ilustracións non teñen descrición alternativa.',
  derechosPorDefecto: '© {año} {autor}. Todos os dereitos reservados.',
}

const EU: TextosLibro = {
  portada: 'Azala',
  portadaDe: (t) => `Azala: ${t}`,
  contraportada: 'Atzeko azala',
  contraportadaDe: (t) => `Atzeko azala: ${t}`,
  laminaColor: (n) => `Koloretako irudia ${n}`,
  derechos: 'Eskubideak',
  publicadoPor: (s) => `Argitaratzailea: ${s}`,
  edicionDigital: (a) => `Edizio digitala, ${a}`,
  dedicatoria: 'Eskaintza',
  epigrafe: 'Epigrafea',
  ilustracion: 'Ilustrazioa',
  ilustracionDe: (t) => `Ilustrazioa · ${t}`,
  indice: 'Aurkibidea',
  comienzo: 'Hasiera',
  guia: 'Gida',
  resumenAccesibilidad: 'Kapituluka nabigatzeko eleberria.',
  conDescripciones: ' Ilustrazioek testu alternatiboa dute.',
  sinDescripciones: ' Ilustrazio batzuek ez dute testu alternatiborik.',
  derechosPorDefecto: '© {año} {autor}. Eskubide guztiak erreserbatuta.',
}

const FR: TextosLibro = {
  portada: 'Couverture',
  portadaDe: (t) => `Couverture de ${t}`,
  contraportada: 'Quatrième de couverture',
  contraportadaDe: (t) => `Quatrième de couverture de ${t}`,
  laminaColor: (n) => `Planche en couleur ${n}`,
  derechos: 'Droits',
  publicadoPor: (s) => `Publié par ${s}`,
  edicionDigital: (a) => `Édition numérique, ${a}`,
  dedicatoria: 'Dédicace',
  epigrafe: 'Épigraphe',
  ilustracion: 'Illustration',
  ilustracionDe: (t) => `Illustration · ${t}`,
  indice: 'Table des matières',
  comienzo: 'Début',
  guia: 'Guide',
  resumenAccesibilidad: 'Roman avec navigation par chapitres.',
  conDescripciones: ' Les illustrations comportent une description alternative.',
  sinDescripciones: ' Certaines illustrations n’ont pas de description alternative.',
  derechosPorDefecto: '© {año} {autor}. Tous droits réservés.',
}

const IT: TextosLibro = {
  portada: 'Copertina',
  portadaDe: (t) => `Copertina di ${t}`,
  contraportada: 'Quarta di copertina',
  contraportadaDe: (t) => `Quarta di copertina di ${t}`,
  laminaColor: (n) => `Tavola a colori ${n}`,
  derechos: 'Diritti',
  publicadoPor: (s) => `Pubblicato da ${s}`,
  edicionDigital: (a) => `Edizione digitale, ${a}`,
  dedicatoria: 'Dedica',
  epigrafe: 'Epigrafe',
  ilustracion: 'Illustrazione',
  ilustracionDe: (t) => `Illustrazione · ${t}`,
  indice: 'Indice',
  comienzo: 'Inizio',
  guia: 'Guida',
  resumenAccesibilidad: 'Romanzo con navigazione per capitoli.',
  conDescripciones: ' Le illustrazioni includono una descrizione alternativa.',
  sinDescripciones: ' Alcune illustrazioni non hanno una descrizione alternativa.',
  derechosPorDefecto: '© {año} {autor}. Tutti i diritti riservati.',
}

const DE: TextosLibro = {
  portada: 'Cover',
  portadaDe: (t) => `Cover von ${t}`,
  contraportada: 'Rückseite',
  contraportadaDe: (t) => `Rückseite von ${t}`,
  laminaColor: (n) => `Farbtafel ${n}`,
  derechos: 'Impressum',
  publicadoPor: (s) => `Verlag: ${s}`,
  edicionDigital: (a) => `Digitale Ausgabe, ${a}`,
  dedicatoria: 'Widmung',
  epigrafe: 'Motto',
  ilustracion: 'Illustration',
  ilustracionDe: (t) => `Illustration · ${t}`,
  indice: 'Inhalt',
  comienzo: 'Beginn',
  guia: 'Navigation',
  resumenAccesibilidad: 'Roman mit Kapitelnavigation.',
  conDescripciones: ' Die Illustrationen haben einen Alternativtext.',
  sinDescripciones: ' Einige Illustrationen haben keinen Alternativtext.',
  derechosPorDefecto: '© {año} {autor}. Alle Rechte vorbehalten.',
}

const POR_IDIOMA: Readonly<Record<string, TextosLibro>> = { es: ES, en: EN, pt: PT, ca: CA, gl: GL, eu: EU, fr: FR, it: IT, de: DE }

/** Los idiomas que tienen textos propios. Cualquier otro sale en español. */
export const IDIOMAS_DEL_LIBRO = Object.keys(POR_IDIOMA)

/** Los textos del libro para un codigo de idioma («es», «en-GB», «pt_BR»...). */
export function textosLibro(idioma: string): TextosLibro {
  const principal = idioma.trim().toLowerCase().split(/[-_]/u)[0] ?? ''
  return POR_IDIOMA[principal] ?? ES
}
