/**
 * Lo que el libro web dice por su cuenta, en el idioma del LIBRO: los botones
 * del lector («Empezar a leer», «Tipo de letra») y la pagina del final.
 *
 * Viajan dentro de `libro.json`, no dentro del lector: asi `lector.js` es el
 * mismo archivo para un libro en euskera y para uno en aleman, y quien integra
 * el libro puede cambiar un texto sin tocar codigo.
 *
 * Los idiomas son los de `textos-libro.ts`; un test comprueba que no falte
 * ninguno ni se quede una clave vacia.
 */
import { IDIOMAS_DEL_LIBRO, textosLibro } from '../textos-libro'

/** Lo propio del libro web. `portada` e `indice` salen de `textos-libro.ts`. */
interface Propios {
  readonly empezar: string
  readonly continuar: string
  readonly anterior: string
  readonly siguiente: string
  readonly ajustes: string
  readonly tema: string
  readonly temaAuto: string
  readonly temaClaro: string
  readonly temaSepia: string
  readonly temaOscuro: string
  readonly tamano: string
  readonly menor: string
  readonly mayor: string
  readonly letra: string
  readonly cerrar: string
  readonly cargando: string
  readonly error: string
  readonly reintentar: string
  /** La insignia de un libro del que solo se publica una parte. */
  readonly muestra: string
  /** Se ve al abrir `index.html` con doble clic, sin servidor. */
  readonly sinServidor: string
  /** El titulo de la parte que reune las laminas a color. */
  readonly laminas: string
  /** La pagina del final de una muestra. */
  readonly sigueLeyendo: string
  readonly finMuestra: string
  readonly completoEn: string
  /** La pagina del final de un libro entero con enlaces. */
  readonly consigue: string
  readonly tambienEn: string
  readonly modo: string
  readonly desplazar: string
  readonly paginas: string
  readonly interlineado: string
  readonly compacto: string
  readonly normal: string
  readonly amplio: string
  readonly alineacion: string
  readonly izquierda: string
  readonly justificado: string
  readonly paginaAnterior: string
  readonly paginaSiguiente: string
  /** El nombre de la letra del aparato: la unica que no va en el libro. */
  readonly sistema: string
}

/** Lo que lee el lector, tal como va en `libro.json`. */
export interface TextosLector {
  readonly portada: string
  readonly indice: string
  readonly empezar: string
  readonly continuar: string
  readonly anterior: string
  readonly siguiente: string
  readonly ajustes: string
  readonly tema: string
  readonly temaAuto: string
  readonly temaClaro: string
  readonly temaSepia: string
  readonly temaOscuro: string
  readonly tamano: string
  readonly menor: string
  readonly mayor: string
  readonly letra: string
  readonly cerrar: string
  readonly cargando: string
  readonly error: string
  readonly reintentar: string
  readonly muestra: string
  readonly sinServidor: string
  readonly modo: string
  readonly desplazar: string
  readonly paginas: string
  readonly interlineado: string
  readonly compacto: string
  readonly normal: string
  readonly amplio: string
  readonly alineacion: string
  readonly izquierda: string
  readonly justificado: string
  readonly paginaAnterior: string
  readonly paginaSiguiente: string
}

const ES: Propios = {
  empezar: 'Empezar a leer',
  continuar: 'Seguir leyendo',
  anterior: 'Anterior',
  siguiente: 'Siguiente',
  ajustes: 'Ajustes de lectura',
  tema: 'Tema',
  temaAuto: 'Automático',
  temaClaro: 'Claro',
  temaSepia: 'Sepia',
  temaOscuro: 'Oscuro',
  tamano: 'Tamaño de letra',
  menor: 'Letra más pequeña',
  mayor: 'Letra más grande',
  letra: 'Tipo de letra',
  cerrar: 'Cerrar',
  cargando: 'Cargando…',
  error: 'No se pudo cargar esta parte del libro.',
  reintentar: 'Reintentar',
  muestra: 'Muestra',
  sinServidor: 'Estás viendo el libro desde tu equipo. Los temas y el tamaño de letra funcionan cuando está publicado en un sitio web.',
  laminas: 'Láminas',
  sigueLeyendo: 'Sigue leyendo',
  finMuestra: 'Aquí termina esta muestra.',
  completoEn: 'El libro completo está disponible en:',
  consigue: 'Consigue el libro',
  tambienEn: 'Este libro también está disponible en:',
  modo: 'Lectura',
  desplazar: 'Desplazar',
  paginas: 'Páginas',
  interlineado: 'Interlineado',
  compacto: 'Compacto',
  normal: 'Normal',
  amplio: 'Amplio',
  alineacion: 'Alineación',
  izquierda: 'Izquierda',
  justificado: 'Justificado',
  paginaAnterior: 'Página anterior',
  paginaSiguiente: 'Página siguiente',
  sistema: 'Del sistema',
}

const EN: Propios = {
  empezar: 'Start reading',
  continuar: 'Continue reading',
  anterior: 'Previous',
  siguiente: 'Next',
  ajustes: 'Reading settings',
  tema: 'Theme',
  temaAuto: 'Automatic',
  temaClaro: 'Light',
  temaSepia: 'Sepia',
  temaOscuro: 'Dark',
  tamano: 'Text size',
  menor: 'Smaller text',
  mayor: 'Larger text',
  letra: 'Typeface',
  cerrar: 'Close',
  cargando: 'Loading…',
  error: 'This part of the book could not be loaded.',
  reintentar: 'Try again',
  muestra: 'Sample',
  sinServidor: 'You are viewing the book from your computer. Themes and text size work once it is published on a website.',
  laminas: 'Plates',
  sigueLeyendo: 'Keep reading',
  finMuestra: 'This sample ends here.',
  completoEn: 'The complete book is available at:',
  consigue: 'Get the book',
  tambienEn: 'This book is also available at:',
  modo: 'Reading',
  desplazar: 'Scroll',
  paginas: 'Pages',
  interlineado: 'Line spacing',
  compacto: 'Compact',
  normal: 'Normal',
  amplio: 'Wide',
  alineacion: 'Alignment',
  izquierda: 'Left',
  justificado: 'Justified',
  paginaAnterior: 'Previous page',
  paginaSiguiente: 'Next page',
  sistema: 'System',
}

const PT: Propios = {
  empezar: 'Começar a ler',
  continuar: 'Continuar a leitura',
  anterior: 'Anterior',
  siguiente: 'Próximo',
  ajustes: 'Ajustes de leitura',
  tema: 'Tema',
  temaAuto: 'Automático',
  temaClaro: 'Claro',
  temaSepia: 'Sépia',
  temaOscuro: 'Escuro',
  tamano: 'Tamanho da letra',
  menor: 'Letra menor',
  mayor: 'Letra maior',
  letra: 'Tipo de letra',
  cerrar: 'Fechar',
  cargando: 'Carregando…',
  error: 'Não foi possível carregar esta parte do livro.',
  reintentar: 'Tentar novamente',
  muestra: 'Amostra',
  sinServidor: 'Você está vendo o livro a partir do seu computador. Os temas e o tamanho da letra funcionam quando ele está publicado em um site.',
  laminas: 'Lâminas',
  sigueLeyendo: 'Continue a leitura',
  finMuestra: 'Esta amostra termina aqui.',
  completoEn: 'O livro completo está disponível em:',
  consigue: 'Obtenha o livro',
  tambienEn: 'Este livro também está disponível em:',
  modo: 'Leitura',
  desplazar: 'Rolar',
  paginas: 'Páginas',
  interlineado: 'Entrelinha',
  compacto: 'Compacto',
  normal: 'Normal',
  amplio: 'Amplo',
  alineacion: 'Alinhamento',
  izquierda: 'À esquerda',
  justificado: 'Justificado',
  paginaAnterior: 'Página anterior',
  paginaSiguiente: 'Próxima página',
  sistema: 'Do sistema',
}

const CA: Propios = {
  empezar: 'Comença a llegir',
  continuar: 'Continua llegint',
  anterior: 'Anterior',
  siguiente: 'Següent',
  ajustes: 'Ajustos de lectura',
  tema: 'Tema',
  temaAuto: 'Automàtic',
  temaClaro: 'Clar',
  temaSepia: 'Sèpia',
  temaOscuro: 'Fosc',
  tamano: 'Mida de la lletra',
  menor: 'Lletra més petita',
  mayor: 'Lletra més gran',
  letra: 'Tipus de lletra',
  cerrar: 'Tanca',
  cargando: 'S’està carregant…',
  error: 'No s’ha pogut carregar aquesta part del llibre.',
  reintentar: 'Torna-ho a provar',
  muestra: 'Mostra',
  sinServidor: 'Estàs veient el llibre des del teu ordinador. Els temes i la mida de la lletra funcionen quan està publicat en un lloc web.',
  laminas: 'Làmines',
  sigueLeyendo: 'Continua llegint',
  finMuestra: 'Aquesta mostra acaba aquí.',
  completoEn: 'El llibre complet està disponible a:',
  consigue: 'Aconsegueix el llibre',
  tambienEn: 'Aquest llibre també està disponible a:',
  modo: 'Lectura',
  desplazar: 'Desplaçar',
  paginas: 'Pàgines',
  interlineado: 'Interlineat',
  compacto: 'Compacte',
  normal: 'Normal',
  amplio: 'Ampli',
  alineacion: 'Alineació',
  izquierda: 'Esquerra',
  justificado: 'Justificat',
  paginaAnterior: 'Pàgina anterior',
  paginaSiguiente: 'Pàgina següent',
  sistema: 'Del sistema',
}

const GL: Propios = {
  empezar: 'Comezar a ler',
  continuar: 'Seguir lendo',
  anterior: 'Anterior',
  siguiente: 'Seguinte',
  ajustes: 'Axustes de lectura',
  tema: 'Tema',
  temaAuto: 'Automático',
  temaClaro: 'Claro',
  temaSepia: 'Sepia',
  temaOscuro: 'Escuro',
  tamano: 'Tamaño da letra',
  menor: 'Letra máis pequena',
  mayor: 'Letra máis grande',
  letra: 'Tipo de letra',
  cerrar: 'Pechar',
  cargando: 'Cargando…',
  error: 'Non se puido cargar esta parte do libro.',
  reintentar: 'Tentar de novo',
  muestra: 'Mostra',
  sinServidor: 'Estás a ver o libro desde o teu equipo. Os temas e o tamaño da letra funcionan cando está publicado nun sitio web.',
  laminas: 'Láminas',
  sigueLeyendo: 'Segue lendo',
  finMuestra: 'Aquí remata esta mostra.',
  completoEn: 'O libro completo está dispoñible en:',
  consigue: 'Consegue o libro',
  tambienEn: 'Este libro tamén está dispoñible en:',
  modo: 'Lectura',
  desplazar: 'Desprazar',
  paginas: 'Páxinas',
  interlineado: 'Entreliñado',
  compacto: 'Compacto',
  normal: 'Normal',
  amplio: 'Amplo',
  alineacion: 'Aliñamento',
  izquierda: 'Esquerda',
  justificado: 'Xustificado',
  paginaAnterior: 'Páxina anterior',
  paginaSiguiente: 'Páxina seguinte',
  sistema: 'Do sistema',
}

const EU: Propios = {
  empezar: 'Hasi irakurtzen',
  continuar: 'Jarraitu irakurtzen',
  anterior: 'Aurrekoa',
  siguiente: 'Hurrengoa',
  ajustes: 'Irakurketa-ezarpenak',
  tema: 'Gaia',
  temaAuto: 'Automatikoa',
  temaClaro: 'Argia',
  temaSepia: 'Sepia',
  temaOscuro: 'Iluna',
  tamano: 'Letra-tamaina',
  menor: 'Letra txikiagoa',
  mayor: 'Letra handiagoa',
  letra: 'Letra-mota',
  cerrar: 'Itxi',
  cargando: 'Kargatzen…',
  error: 'Ezin izan da liburuaren zati hau kargatu.',
  reintentar: 'Saiatu berriro',
  muestra: 'Lagina',
  sinServidor: 'Liburua zure ordenagailutik ikusten ari zara. Gaiak eta letra-tamaina webgune batean argitaratuta dagoenean dabiltza.',
  laminas: 'Laminak',
  sigueLeyendo: 'Jarraitu irakurtzen',
  finMuestra: 'Lagin hau hemen amaitzen da.',
  completoEn: 'Liburu osoa hemen dago eskuragarri:',
  consigue: 'Eskuratu liburua',
  tambienEn: 'Liburu hau hemen ere badago eskuragarri:',
  modo: 'Irakurketa',
  desplazar: 'Korritu',
  paginas: 'Orriak',
  interlineado: 'Lerroartea',
  compacto: 'Trinkoa',
  normal: 'Normala',
  amplio: 'Zabala',
  alineacion: 'Lerrokatzea',
  izquierda: 'Ezkerrean',
  justificado: 'Justifikatua',
  paginaAnterior: 'Aurreko orria',
  paginaSiguiente: 'Hurrengo orria',
  sistema: 'Sistemarena',
}

const FR: Propios = {
  empezar: 'Commencer la lecture',
  continuar: 'Reprendre la lecture',
  anterior: 'Précédent',
  siguiente: 'Suivant',
  ajustes: 'Réglages de lecture',
  tema: 'Thème',
  temaAuto: 'Automatique',
  temaClaro: 'Clair',
  temaSepia: 'Sépia',
  temaOscuro: 'Sombre',
  tamano: 'Taille du texte',
  menor: 'Texte plus petit',
  mayor: 'Texte plus grand',
  letra: 'Police',
  cerrar: 'Fermer',
  cargando: 'Chargement…',
  error: 'Impossible de charger cette partie du livre.',
  reintentar: 'Réessayer',
  muestra: 'Extrait',
  sinServidor: 'Vous consultez le livre depuis votre ordinateur. Les thèmes et la taille du texte fonctionnent une fois le livre publié sur un site web.',
  laminas: 'Planches',
  sigueLeyendo: 'Poursuivre la lecture',
  finMuestra: 'Cet extrait se termine ici.',
  completoEn: 'Le livre complet est disponible sur :',
  consigue: 'Se procurer le livre',
  tambienEn: 'Ce livre est aussi disponible sur :',
  modo: 'Lecture',
  desplazar: 'Défilement',
  paginas: 'Pages',
  interlineado: 'Interligne',
  compacto: 'Serré',
  normal: 'Normal',
  amplio: 'Large',
  alineacion: 'Alignement',
  izquierda: 'À gauche',
  justificado: 'Justifié',
  paginaAnterior: 'Page précédente',
  paginaSiguiente: 'Page suivante',
  sistema: 'Du système',
}

const IT: Propios = {
  empezar: 'Inizia a leggere',
  continuar: 'Continua a leggere',
  anterior: 'Precedente',
  siguiente: 'Successivo',
  ajustes: 'Impostazioni di lettura',
  tema: 'Tema',
  temaAuto: 'Automatico',
  temaClaro: 'Chiaro',
  temaSepia: 'Seppia',
  temaOscuro: 'Scuro',
  tamano: 'Dimensione del testo',
  menor: 'Testo più piccolo',
  mayor: 'Testo più grande',
  letra: 'Carattere',
  cerrar: 'Chiudi',
  cargando: 'Caricamento…',
  error: 'Impossibile caricare questa parte del libro.',
  reintentar: 'Riprova',
  muestra: 'Estratto',
  sinServidor: 'Stai guardando il libro dal tuo computer. I temi e la dimensione del testo funzionano quando è pubblicato su un sito web.',
  laminas: 'Tavole',
  sigueLeyendo: 'Continua a leggere',
  finMuestra: 'Questo estratto finisce qui.',
  completoEn: 'Il libro completo è disponibile su:',
  consigue: 'Trova il libro',
  tambienEn: 'Questo libro è disponibile anche su:',
  modo: 'Lettura',
  desplazar: 'Scorrimento',
  paginas: 'Pagine',
  interlineado: 'Interlinea',
  compacto: 'Compatta',
  normal: 'Normale',
  amplio: 'Ampia',
  alineacion: 'Allineamento',
  izquierda: 'A sinistra',
  justificado: 'Giustificato',
  paginaAnterior: 'Pagina precedente',
  paginaSiguiente: 'Pagina successiva',
  sistema: 'Di sistema',
}

const DE: Propios = {
  empezar: 'Lesen beginnen',
  continuar: 'Weiterlesen',
  anterior: 'Zurück',
  siguiente: 'Weiter',
  ajustes: 'Leseeinstellungen',
  tema: 'Design',
  temaAuto: 'Automatisch',
  temaClaro: 'Hell',
  temaSepia: 'Sepia',
  temaOscuro: 'Dunkel',
  tamano: 'Schriftgröße',
  menor: 'Schrift verkleinern',
  mayor: 'Schrift vergrößern',
  letra: 'Schriftart',
  cerrar: 'Schließen',
  cargando: 'Wird geladen …',
  error: 'Dieser Teil des Buches konnte nicht geladen werden.',
  reintentar: 'Erneut versuchen',
  muestra: 'Leseprobe',
  sinServidor: 'Du siehst das Buch von deinem Computer aus. Designs und Schriftgröße funktionieren, sobald es auf einer Website veröffentlicht ist.',
  laminas: 'Tafeln',
  sigueLeyendo: 'Weiterlesen',
  finMuestra: 'Diese Leseprobe endet hier.',
  completoEn: 'Das vollständige Buch ist erhältlich bei:',
  consigue: 'Zum Buch',
  tambienEn: 'Dieses Buch ist auch erhältlich bei:',
  modo: 'Lesen',
  desplazar: 'Scrollen',
  paginas: 'Seiten',
  interlineado: 'Zeilenabstand',
  compacto: 'Eng',
  normal: 'Normal',
  amplio: 'Weit',
  alineacion: 'Ausrichtung',
  izquierda: 'Linksbündig',
  justificado: 'Blocksatz',
  paginaAnterior: 'Vorherige Seite',
  paginaSiguiente: 'Nächste Seite',
  sistema: 'System',
}

const POR_IDIOMA: Readonly<Record<string, Propios>> = { es: ES, en: EN, pt: PT, ca: CA, gl: GL, eu: EU, fr: FR, it: IT, de: DE }

/** Los idiomas con textos propios: tienen que ser los de `textos-libro.ts`. */
export const IDIOMAS_DEL_LIBRO_WEB = Object.keys(POR_IDIOMA)

/** Lo que el libro web escribe en sus paginas (no lo lee el lector). */
export interface TextosWeb {
  readonly laminas: string
  readonly sigueLeyendo: string
  readonly finMuestra: string
  readonly completoEn: string
  readonly consigue: string
  readonly tambienEn: string
  readonly anterior: string
  readonly siguiente: string
  readonly sistema: string
  readonly lector: TextosLector
}

/** Los textos del libro web para un codigo de idioma. Uno desconocido sale en español, como el EPUB. */
export function textosWeb(idioma: string): TextosWeb {
  const principal = idioma.trim().toLowerCase().split(/[-_]/u)[0] ?? ''
  const p = (IDIOMAS_DEL_LIBRO.includes(principal) ? POR_IDIOMA[principal] : undefined) ?? ES
  const { laminas, sigueLeyendo, finMuestra, completoEn, consigue, tambienEn, sistema, ...delLector } = p
  const t = textosLibro(idioma)
  return {
    laminas,
    sigueLeyendo,
    finMuestra,
    completoEn,
    consigue,
    tambienEn,
    anterior: p.anterior,
    siguiente: p.siguiente,
    sistema,
    lector: { portada: t.portada, indice: t.indice, ...delLector },
  }
}
