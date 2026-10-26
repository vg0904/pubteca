// INTERFACE text, in English. Mirrors `es.ts`, which is the original.
//
// Nothing here ever reaches the EPUB: the text inside the book lives in
// src/core/textos-libro.ts and follows the BOOK's language, not the app's.
// Mixing the two is what produced English books with a Spanish «Índice».
//
// The `Ui` type comes from the Spanish file, so a missing key, a renamed one
// or a function with a different signature fails `npm run typecheck`.
import type { Ui } from './es'
import { dolares, numero, tamano, type Separadores } from '../app/formato'

const SEPARADORES: Separadores = { miles: ',', decimal: '.' }

export const ui: Ui = {
  nombre: 'Pubteca',
  lema: 'Your book, ready for the stores.',
  descripcion:
    'Turn your manuscript into two publish-ready EPUBs: one for Kindle (KDP) and one for Apple Books. Free, nothing to install.',
  privacidad: 'Your book stays in this browser. It is never uploaded to any server.',

  idiomaUi: 'Pubteca language',


  formato: {
    numero: (n: number) => numero(n, SEPARADORES),
    tamano: (bytes: number) => tamano(bytes, SEPARADORES),
    dolares: (x: number) => dolares(x, SEPARADORES),
    haceDias: (dias: number) => (dias === 0 ? 'today' : dias === 1 ? 'yesterday' : `${dias} days ago`),
  },

  inicio: {
    nuevo: 'New book',
    nuevoDetalle: 'Start with one blank chapter.',
    importar: 'Import a manuscript',
    importarDetalle: 'A Word .docx, or your chapters as .md or .txt. Nothing is applied until you confirm it.',
    continuar: 'Continue',
    tusLibros: 'Your books in this browser',
    sinTitulo: 'Untitled book',
    modificado: (cuando: string) => `Edited ${cuando}`,
    capitulos: (n: number) => (n === 1 ? '1 chapter' : `${n} chapters`),
    borrar: 'Delete',
    confirmarBorrar: (titulo: string) =>
      `Delete “${titulo}” from this browser? Its images go too. Without a backup (.zip) there is no way to get it back.`,
    honestidad:
      'Heads up: Safari and other browsers can clear what a page stores if you go weeks without opening it. The real backup is the .zip you keep yourself: “Save backup” is always at the top, and “Open backup” brings it back.',
    privado:
      'I cannot store anything in this browser (private window?). You can work, but closing the tab loses everything: save a backup first.',
    cargando: 'Opening…',
  },

  vistaPrevia: {
    titulo: 'Preview',
    ayuda:
      'This is the real EPUB, the same one you download, page by page. Every reading app paints it its own way: the reader chooses the type size and the margins.',
    tienda: 'Store',
    tema: 'Background',
    temas: { claro: 'Light', sepia: 'Sepia', oscuro: 'Dark' },
    pagina: (i: number, n: number) => `Page ${i} of ${n}`,
    anterior: '← Previous',
    siguiente: 'Next →',
    marco: (titulo: string) => `Preview: ${titulo}`,
  },

  copia: {
    abrir: 'Open backup (.zip)',
    abrirDetalle:
      'A backup you saved with Pubteca, or a book folder from the generator zipped up. It opens as a new book: nothing gets overwritten.',
    leyendo: 'Reading the backup…',
    titulo: 'What the backup holds',
    hecha: (fecha: string) => `Backup made on ${fecha}.`,
    deCarpetas: 'Read from its folders (libro.txt, capitulos/, ilustraciones/…), the way the generator reads them.',
    resumen: (capitulos: number, extras: number, imagenes: number) =>
      [
        capitulos === 1 ? '1 chapter' : `${capitulos} chapters`,
        extras === 0 ? '' : extras === 1 ? '1 extra page' : `${extras} extra pages`,
        imagenes === 0 ? '' : imagenes === 1 ? '1 image' : `${imagenes} images`,
      ]
        .filter(Boolean)
        .join(' · '),
    hayAvisos: 'What could not be recovered as it was:',
    abrirLibro: 'Open as a new book',
    cancelar: 'Cancel',
    soloCopia: 'A backup (.zip) opens on its own: the other files were not imported.',
    errores: {
      noEsZip: 'That file is not a .zip, or it is damaged.',
      noEsCopia:
        'There is no book in that .zip: it is not a Pubteca backup and it has no capitulos/ folder with your chapters as .md or .txt.',
      danada: 'The backup is damaged: its proyecto.json cannot be read.',
      versionFutura: 'This backup was made with a newer version of Pubteca. Reload the page and try again.',
    },
    avisos: {
      faltaImagen: (d: string) => `An image is missing (${d}). The book will mark where it went so you can put it back.`,
      imagenIlegible: (d: string) => `${d} is not a PNG or a JPG, or it is damaged: it would not open.`,
      imagenSinUsar: (d: string) => `${d} is not used by any chapter, so it was left out (the generator did not use it either).`,
      capituloVacio: (d: string) => `${d} is empty: it was not opened.`,
      idioma: (d: string) => `The book cannot write in “${d}”: it was set to Spanish. Change it in “Download EPUB”.`,
      fecha: (d: string) => `“${d}” is not a date (year-month-day): the publication date was dropped.`,
      sinLibroTxt: () => 'No libro.txt inside: the title, the author and the rest are asked for when you download.',
      descartados: (d: string) => `${d} ${d === '1' ? 'part' : 'parts'} of the backup could not be understood and were left out.`,
      dedicatoriaDeMas: (d: string) =>
        `${d}: a book has a single dedication. This one became a front-matter page, with all of its text.`,
      epigrafeDeMas: (d: string) =>
        `${d}: a book has a single epigraph. This one became a front-matter page, with all of its text.`,
      copiaAntigua: () =>
        'This backup is from an older version of Pubteca: all the text and the images come back, but not which illustrations were decorative, nor the name you uploaded each image under.',
      editadaFuera: () =>
        'The backup’s text files were changed outside Pubteca after it was made: what they say is what opened, since that is the last thing you wrote.',
      fuentesPropias: () => 'It carried its own fonts: Pubteca uses its own, Libre Baskerville.',
    },
  },

  barra: {
    inicio: 'Back to your books',
    guardado: 'Saved in this browser',
    guardando: 'Saving…',
    errorGuardar: 'Could not save',
    noSeGuarda: 'Not saving: open in another tab',
    conflicto: 'This book was changed in another tab or window.',
    conflictoDetalle:
      'To avoid wiping those changes, saving stopped here. If what you have in this tab matters to you, save a backup (.zip) before reloading.',
    recargar: 'Reload the saved book',
    copia: 'Save backup (.zip)',
    copiaNunca: 'No backup yet',
    copiaHace: (cuando: string) => `Backup: ${cuando}`,
    copiaVieja: 'Your last backup is over a week old. Save one now.',
    copiaLista: 'Your backup is ready',
    descargarCopia: 'Download the backup',
    preparandoCopia: 'Preparing the backup…',
    deshacer: 'Undo',
    rehacer: 'Redo',
  },

  secciones: {
    capitulos: 'Chapters',
    portada: 'Cover and plates',
    extras: 'Extra pages',
    descargar: 'Download EPUB',
    indice: 'Book contents',
  },

  capitulos: {
    nuevo: 'New chapter',
    importarMas: 'Import more chapters…',
    vacio: 'This book has no chapters yet.',
    menu: (nombre: string) => `Options for “${nombre}”`,
    subir: 'Move up',
    bajar: 'Move down',
    alPrincipio: 'Move to the start',
    alFinal: 'Move to the end',
    borrar: 'Delete the chapter',
    borrado: (nombre: string) => `You deleted “${nombre}”.`,
    arrastrar: 'Drag to reorder, or use the ⋯ menu',
    desordenada: 'After reordering, the “Chapter N” numbers are out of order.',
    renumerar: 'Number them in order',
  },

  editor: {
    etiqueta: 'Label',
    etiquetaAyuda: 'Capítulo 3, Prólogo, Epílogo, Interludio… or nothing.',
    etiquetaNoReconocida: (etiqueta: string) =>
      `The book only splits off “Capítulo N”, “Prólogo”, “Epílogo” or “Interludio”. “${etiqueta}” will run into the title.`,
    titulo: 'Chapter title',
    tituloPagina: 'Page title',
    parrafo: 'Write here, or paste your text…',
    sinTitulo: 'With no title and no label, the book would take the first paragraph as the title. Give it one.',
    aperturas: 'The chapter opens with',
    soltarApertura: 'Drop the illustration here to open the chapter with it',
    atajos: (mod: string) => `${mod}+I italic · ${mod}+B bold · Enter: new paragraph`,
    // formatting bar
    tipo: 'Block type',
    tipos: { parrafo: 'Paragraph', subtitulo: 'Subheading', versos: 'Verse' },
    cursiva: 'Italic',
    negrita: 'Bold',
    subirBloque: 'Move the block up',
    bajarBloque: 'Move the block down',
    borrarBloque: 'Delete the block',
    // insert
    insertar: 'Insert here',
    insertarAlFinal: 'Add:',
    soltarImagen: 'Drop the image here',
    insertables: {
      parrafo: 'Paragraph',
      subtitulo: 'Subheading',
      escena: 'Scene break',
      versos: 'Verse',
      ilustracion: 'Illustration…',
    },
    escena: 'Scene break',
    escenaAyuda: 'Backspace or Delete to remove it',
    versosAyuda: 'Enter: new line · Enter on an empty line: new stanza (again: leave)',
    verso: (estrofa: number, verso: number) => `Stanza ${estrofa}, line ${verso}`,
  },

  ilustracion: {
    alt: 'What is in the picture?',
    altAyuda: 'Screen readers read this out loud.',
    decorativa: 'Purely decorative: no description needed',
    paginaPropia: 'The illustration takes a page of its own',
    falta: (nombre: string) => `Image “${nombre}” is missing`,
    elegir: 'Choose the image…',
    cambiar: 'Change the image…',
    menu: 'Illustration options',
    abrirCapitulo: 'Open the chapter with this picture',
    devolver: 'Move it into the chapter text',
    quitar: 'Remove the illustration',
    subir: 'Move up',
    bajar: 'Move down',
    arrastrar: 'Drag it onto the title to open the chapter with it',
  },

  imagen: {
    rechazada: {
      heic: 'This is a HEIC photo (the iPhone format). An EPUB only takes PNG or JPG: open it and export it as JPG.',
      webp: 'This is a WebP image. An EPUB only takes PNG or JPG: convert it before uploading.',
      tiff: 'This is a TIFF. KDP accepts it for the cover you upload separately, but inside the EPUB only PNG or JPG work.',
      gif: 'This is a GIF. A book’s EPUB only takes PNG or JPG.',
      bmp: 'This is a BMP. An EPUB only takes PNG or JPG.',
      desconocido: 'This is not really a PNG or a JPG (a renamed file?).',
      truncada: 'The image is incomplete: it looks half-copied. Export it again.',
      ilegible: 'The browser cannot open this image: it may be damaged.',
    },
    subiendo: 'Uploading…',
  },

  ajustar: {
    abrir: 'Adjust the image…',
    arreglar: 'Fix it',
    pestanas: 'Which store',
    resolucion: 'Resolution',
    listo: 'Done',
    // La pestaña de Kindle no ajusta OTRA imagen: dice que hacerle a esta al
    // entregarla. Ver la cabecera de ui/AjustarImagen.tsx.
    kindle: {
      marca: 'custom',
      titulo: 'For this image only',
      ayuda:
        'The framing is the same in both stores: it is your drawing. What changes is how much it may weigh, because Amazon charges delivery per MB and Apple Books does not charge for file size.',
      propio: 'Give this image its own Kindle setting',
      general: (calidad: number, grises: boolean) =>
        `Follows what you set in “Download EPUB”: JPEG at quality ${calidad}${grises ? ', in black and white' : ''}.`,
      sinComprimir: 'Right now Kindle gets this image untouched, like Apple Books. You can change it for all of them in “Download EPUB”.',
      resolucionAyuda: (ancho: number, alto: number) => `Kindle will get it at ${ancho} × ${alto} px.`,
      volverAlGeneral: 'Back to the setting for all',
      cuando: 'This is saved as you set it. The Kindle version is prepared when you download the EPUBs.',
    },
    titulo: 'Adjust the image',
    ayuda: 'It is saved as a new image; the one you uploaded is untouched, and “Undo” brings it back.',
    original: (ancho: number, alto: number, peso: string) => `Now: ${ancho} × ${alto} px · ${peso}`,
    proporcion: 'Shape',
    proporcionAyuda: 'Reading screens are tall and narrow: 2:3 is the one that fits them best.',
    aspectos: {
      '2:3': '2:3 · recommended',
      '3:4': '3:4 · a bit squarer',
      '1:1': 'Square',
      '3:2': '3:2 · landscape',
      '4:3': '4:3 · landscape',
      original: 'This image’s own',
    },
    zoom: 'Zoom',
    zoomAyuda: 'Zoom in to leave out whatever you do not want.',
    encuadre: 'What stays in frame',
    encuadreAyuda: 'Drag the picture to frame it. Anything outside the frame will not reach the book.',
    centrar: 'Centre',
    todo: 'The whole image',
    tamano: 'Final size',
    ancho: 'Width',
    alto: 'Height',
    px: 'px',
    sugerido: (ancho: number, alto: number) => `Recommended: ${ancho} × ${alto} px`,
    usarSugerido: 'Use the recommended size',
    resultado: (ancho: number, alto: number, peso: string) => `It will come out ${ancho} × ${alto} px · ${peso}`,
    midiendo: (ancho: number, alto: number) => `It will come out ${ancho} × ${alto} px · working out the weight…`,
    formato: 'Format',
    formatos: { png: 'PNG · lossless', jpeg: 'JPEG · lighter' },
    formatoAyuda:
      'PNG keeps the drawing exactly and is the best choice for Apple Books. JPEG weighs far less; if the book is going to Kindle, you can compress everything at once in “Download EPUB”.',
    calidad: 'JPEG quality',
    grises: 'Turn it black and white',
    aplicar: 'Save the adjusted image',
    aplicando: 'Adjusting…',
    cancelar: 'Cancel',
    hecho: 'Image adjusted.',
    error: 'I could not adjust this image in this browser.',
    sinCambios: 'As it stands, nothing changes.',
    subira: 'The size you asked for is larger than the piece you framed: the drawing will look worse, not better.',
    tope: 'Over 5.6 million pixels: Apple Books will not take that. Bring the size down.',
  },

  portada: {
    titulo: 'Cover and plates',
    portada: 'Cover',
    portadaAyuda:
      'This cover goes inside the Apple Books EPUB. On KDP the cover is uploaded separately, and that field only accepts JPG or TIFF.',
    contraportada: 'Back cover',
    contraportadaAyuda: 'It goes at the end of the book, as the last page.',
    incluirContraportada: 'Include the back cover in the book',
    logo: 'The half-title page',
    logoAyuda:
      'The half-title is the title page, before the first chapter. Kindle uses no image here: there the title goes as text, which adapts on its own.',
    diseno: {
      pregunta: 'What are you uploading?',
      opciones: {
        logo: 'Just the title logo',
        pagina: 'The whole half-title, already designed',
      },
      ayuda: {
        logo: 'Upload it monochrome (in black) and with a transparent background (PNG): that is what lets Pubteca make the white version for dark mode on its own. Below it, Pubteca adds the subtitle, your name and the imprint.',
        pagina: 'It is treated as a normal image and fills the whole page, so Pubteca adds nothing to it: the subtitle, your name and the imprint have to be in your design already. It also makes no white version for dark mode, because the image is kept exactly as it is.',
      },
    },
    logoBlanco: 'This is how it will look in dark mode',
    logoOpaco:
      'This logo has no transparent background, so I cannot make the white version: in dark mode it will show as a box. Export it as a PNG with transparency.',
    sinLogoBlanco:
      'This logo has no dark-mode version: in Apple Books on a dark background it will barely show. If its background is painted in, export it as a PNG with a transparent background and upload it again; or upload a white version yourself.',
    otroLogoBlanco: 'Use a different white version…',
    laminas: 'Colour plates',
    laminasAyuda: 'They go on their own at the start of the book, before the title page, each on its own page.',
    anadirLamina: 'Add a plate…',
    elegir: 'Choose an image…',
    cambiar: 'Change…',
    quitar: 'Remove',
    soltar: 'or drop it here',
    medidas: (ancho: number, alto: number, peso: string) => `${ancho} × ${alto} px · ${peso}`,
  },

  extras: {
    titulo: 'Extra pages',
    ayuda: 'The pages that are not chapters: the dedication, an opening quote, the acknowledgements…',
    dedicatoria: 'Dedication',
    epigrafe: 'Epigraph',
    inicio: 'Front-matter page',
    final: 'End-matter page',
    anadirDedicatoria: '+ Dedication',
    anadirEpigrafe: '+ Epigraph (a quote)',
    anadirInicio: '+ Front-matter page',
    anadirFinal: '+ End-matter page',
    yaHay: 'There is already one',
    vacio: 'No extra pages yet. None of them is required.',
    alPrincipio: 'At the start, before the first chapter',
    alFinal: 'At the end, after the last chapter',
    moverAlFinal: 'Move it to the end',
    moverAlPrincipio: 'Move it to the start',
    borrar: 'Delete the page',
    subir: 'Move up',
    bajar: 'Move down',
    dedicatoriaAyuda: 'It goes alone on its page, centred and in italics.',
    epigrafeAyuda: 'A quote that opens the book. It goes alone on its page.',
  },

  descargar: {
    titulo: 'Download the EPUBs',
    datos: 'Book details',
    datosAyuda: 'What the stores and the readers see about the book. Only the title is required.',
    idiomas: {
      es: 'Spanish',
      en: 'English',
      ca: 'Catalan',
      gl: 'Galician',
      eu: 'Basque',
      pt: 'Portuguese',
      fr: 'French',
      it: 'Italian',
      de: 'German',
    },
    campos: {
      titulo: 'Title',
      subtitulo: 'Subtitle',
      autor: 'Author',
      sello: 'Imprint',
      isbn: 'ISBN',
      isbnAyuda: 'Optional. If you set it, it is the book’s identity for the stores.',
      fechaPublicacion: 'Publication date',
      descripcion: 'Description',
      derechos: 'Copyright line',
      derechosAyuda: '{año} and {autor} fill themselves in.',
      idioma: 'Book language',
    },
    identidad: (titulo: string, autor: string) =>
      `You already downloaded this book as “${titulo}”${autor ? ` by ${autor}` : ''}. If you have published it, changing the title or the author makes it ANOTHER book for the stores (without an ISBN, its identifier comes from those two fields). If you have not published it yet, nothing happens.`,
    revision: 'Before generating',
    todoBien: 'Nothing to look at before generating.',
    ir: 'Go',
    generar: 'Prepare both EPUBs',
    regenerar: 'Prepare them again',
    generando: 'Preparing the EPUBs…',
    bloqueado: 'Fix whatever is marked “Blocks generating” and try again.',
    kindle: 'EPUB for Kindle (KDP)',
    apple: 'EPUB for Apple Books',
    tarifa: (dolares: string) => `delivery fee ≈ ${dolares} per sale`,
    tarifaAyuda: 'Amazon charges delivery per MB on the 70 % royalty (US).',
    listos: 'Ready. Download each one for its store:',
    desactualizado: 'You changed the book after preparing them. Prepare them again to download the latest.',
    sinFuentes:
      'I could not load the book’s typeface (offline?). The Apple Books EPUB will use the system Baskerville.',
    resultado: 'What the check says',
    resultadoResumen: (mensajes: number, grupos: number) =>
      mensajes === grupos ? '' : `${mensajes} notices, grouped into ${grupos}.`,
    verDetalle: 'See the original messages',
    afectadas: (n: number) => (n === 1 ? '1 affected' : `${n} affected`),
    reporte: 'Download the report (.txt)',

    // Lo que les queda a las imagenes, antes de preparar los EPUB. RECUERDA,
    // NO BLOQUEA: el libro se descarga igual. Ver ui/Descargar.tsx.
    antes: {
      titulo: 'Before you download',
      ayuda:
        'This is what your images still need. The warnings are on each image\u2019s card too, but there you have to go chapter by chapter, and once the book is up on KDP there is no going back.',
      cuales: (n: number, lista: string) => (n === 1 ? lista : `${n}: ${lista}`),
      conComprimir: 'Fixed by \u201cCompress them as JPEG for Kindle\u201d, just above.',
      arreglar: (n: number) => (n === 1 ? 'Fix it (1 image)' : `Fix all of them (${n})`),
      soloComprimir: 'Compress them as JPEG for Kindle',
      comprimirPuesto: 'Done: the Kindle images will be compressed when the EPUBs are prepared.',
      arreglando: 'Fixing\u2026',
      hecho: (n: number) => (n === 1 ? '1 image fixed.' : `${n} images fixed.`),
      nadaQueHacer: 'There was nothing to fix without cropping the drawing.',
      noBloquea:
        'You can download anyway: none of this stops you publishing. Large images only make delivery dearer on Amazon and look worse on big screens. What has to be fixed by cropping is left alone here: that is decided on each drawing.',
    },
    imagenes: {
      titulo: 'Images in each store',
      ayuda:
        'Apple Books does not charge for file size (it takes up to 2 GB), so your images go there exactly as you uploaded them. Amazon charges delivery per MB, so you can send Kindle a lighter version. Your originals are untouched.',
      apple: 'Apple Books: your images, untouched',
      appleDetalle: (n: number, peso: string) => (n === 1 ? `1 image · ${peso}` : `${n} images · ${peso}`),
      kindle: 'Kindle (KDP)',
      kindleDetalle: (n: number, peso: string) => (n === 1 ? `1 image · ${peso}` : `${n} images · ${peso}`),
      comprimir: 'Compress them as JPEG for Kindle',
      calidad: 'Quality',
      calidadAyuda: 'Between 70 and 85 you can barely tell while reading, and the file drops a lot.',
      grises: 'Turn them black and white',
      grisesAyuda:
        'Nearly every Kindle is grey e-ink: this way they weigh considerably less and look the same on those devices.',
      estimado: (peso: string) => `The images will come to ≈ ${peso}`,
      ahorro: (antes: string, ahora: string) => `${antes} → ${ahora}`,
      comprimidas: (antes: string, ahora: string) =>
        `Kindle’s images were compressed: ${antes} → ${ahora}. Apple Books’ go untouched.`,
      sinAhorro:
        'With these images, compressing saves nothing: PNG already stores them better than JPEG. The ones that do not improve are sent as they are.',
      calculando: 'Working it out…',
      noSePudo: 'I could not work out the size here. Prepare the EPUBs and you will see the real one.',
      sinImagenes: 'This book has no images, so there is nothing to compress.',
      transparencia:
        'JPEG does not keep transparency: anything transparent will come out white. Kindle does that anyway.',
      soloKindle: 'The cover and the logo do not go into the Kindle EPUB, so they are not compressed.',
    },
  },

  // Las dos tiendas, como las nombra la interfaz cuando hay que separar lo
  // que le toca a cada una (los avisos de una imagen, el recordatorio antes de
  // descargar). El reparto esta en app/avisos.ts.
  tiendas: {
    apple: 'Apple Books',
    kindle: 'Kindle',
    lista: 'Ready',
  },

  niveles: {
    bloquea: { icono: '⛔', palabra: 'Blocks generating' },
    error: { icono: '✗', palabra: 'Error' },
    aviso: { icono: '!', palabra: 'Notice' },
    nota: { icono: 'i', palabra: 'Note' },
  },

  problemas: {
    sinTitulo: 'The book has no title. Write it in above.',
    sinTexto: 'The book has no chapter with any text in it.',
    capituloSinTitulo: 'A chapter has no title and no label: the book would take its first paragraph as the title.',
    paginaSinTitulo: 'An extra page has no title: the book would take its first paragraph as the title.',
    faltaImagen: 'An illustration has no image: it will not reach the book.',
    capituloVacio: 'A chapter is empty: it will not appear in the book.',
  },

  // Every group states the CONSEQUENCE for the reader, not the jargon.
  grupos: {
    noEsImagen: { titulo: 'Images that cannot be opened', consejo: 'They do not reach the book. Export them as PNG or JPG.' },
    faltaImagen: { titulo: 'Illustrations with no image', consejo: 'They do not reach the book. Choose the image on its card.' },
    recursoAusente: {
      titulo: 'One image used twice in different roles',
      consejo: 'Use a different image for the logo and for the illustrations.',
    },
    transparencia: {
      titulo: 'With transparent areas: Kindle paints them white',
      consejo: 'Flatten them onto their background when you export.',
    },
    cmyk: { titulo: 'In CMYK: on screen the colours come out dull or wrong', consejo: 'Convert them to sRGB.' },
    p3: {
      titulo: 'In Display P3: the colours change from one reading app to another',
      consejo: 'Export them in sRGB (Procreate and the iPad use P3 by default).',
    },
    pixeles: { titulo: 'Too large for Apple Books (over 5.6 million pixels)', consejo: 'Scale them down.' },
    portadaLadoCorto: { titulo: 'Cover small for Apple Books', consejo: 'Apple asks for at least 1400 px on the short side.' },
    portadaBaja: { titulo: 'Cover a little short for high-resolution screens', consejo: 'KDP recommends 2500 px tall or more.' },
    resolucion: { titulo: 'They will look blurry on large screens', consejo: 'Ideally 1600 × 2400 px (landscape, 2400 × 1600).' },
    horizontal: { titulo: 'Landscape: on upright screens they will show smaller', consejo: '' },
    proporcion: { titulo: 'With empty bands on some screens', consejo: 'The ideal shape is 2:3 (1600 × 2400, for instance).' },
    peso: {
      titulo: 'Heavy: they push up Kindle’s delivery fee',
      consejo: 'Compress them: Amazon charges delivery per MB.',
    },
    logoOpaco: { titulo: 'Logo with no transparent background: in dark mode it shows as a box', consejo: 'Upload it as a transparent PNG.' },
    sinLogoBlanco: { titulo: 'No white logo: in dark mode the logo will barely show', consejo: 'Upload the logo in black on transparent and it is generated for you.' },
    sinPortada: { titulo: 'No cover: the Apple Books EPUB comes out with no inside cover', consejo: 'Upload it in “Cover and plates”.' },
    capituloVacio: { titulo: 'Empty chapters that do not appear in the book', consejo: '' },
    sinDescripcion: {
      titulo: 'Illustrations with no description: screen readers will only say “Illustration”',
      consejo: 'Write what is in each one, or mark them as decorative.',
    },
    otro: { titulo: '', consejo: '' },
  },

  importar: {
    titulo: 'Import',
    elegir: 'Choose files…',
    soltar: 'Drop your manuscript here',
    soltarDetalle:
      'A Word .docx with the whole book, or your chapters as .md or .txt (with their images, if they have any). You can paste the text instead.',
    pegar: 'Paste text…',
    pegarAyuda: 'Paste the text here (Cmd+V or Ctrl+V). Italics survive if it comes from Word, Pages or Google Docs.',
    pegarListo: 'Use this text',
    leyendo: 'Reading the document…',
    noEntiendo: (nombre: string) => `I cannot read “${nombre}”. Pubteca understands .docx, .md, .txt and, for illustrations, PNG and JPG.`,
    docxYOtros: 'Import the .docx on its own: a Word document already carries its chapters and images.',
    variosDocx: 'Import .docx files one at a time.',
    error: (nombre: string, mensaje: string) => `I could not read “${nombre}”: ${mensaje}`,
    cancelar: 'Cancel',
    // chapter-break screen
    revisa: 'Check where each chapter starts',
    revisaAyuda:
      'Pubteca proposes the breaks; you decide. “Break here” on any line starts a chapter; “Do not break here” joins it to the one before.',
    cortarAqui: 'Break here',
    noCortar: 'Do not break here',
    motivos: {
      estiloTitulo: 'It has Word’s “Heading 1” style',
      lineaCapitulo: 'It looks like a chapter heading',
      saltoDePagina: 'There is a page break',
      manual: 'You broke it here',
      archivo: 'A file starts here',
    },
    sugerido: 'Does a chapter start here? There is a page break.',
    lineaSiguiente: 'The title is the next line',
    usarLineaSiguiente: 'Use the next line as the title',
    esTexto: 'It is text, not a title',
    antes: 'Before the first chapter',
    huerfanos: {
      dedicatoria: 'It is the dedication: move it to “Extra pages”',
      fuera: 'Do not import it (the title page, for instance: Pubteca makes that itself from the book details)',
      yaHay: 'The book already has a dedication',
      imagenes: 'The images in this part are not imported.',
      primerCapitulo: 'Is this the first chapter? Press “Break here” on its first line.',
    },
    asiQueda: 'How it ends up',
    resumen: {
      capitulos: (n: string) => `${n} chapters`,
      capitulo: '1 chapter',
      parrafos: (n: string) => `${n} paragraphs`,
      enfasis: (n: string) => `${n} italics and bolds`,
      escenas: (n: string) => `${n} scene breaks`,
      versos: (n: string) => `${n} verse lines`,
      ilustraciones: (n: string) => `${n} illustrations`,
      descartados: (n: string) => `${n} items dropped`,
    },
    vacios: (n: number) =>
      n === 1
        ? 'One chapter has no text. Was it a hand-written table of contents?'
        : `${n} chapters have no text. Was it a hand-written table of contents?`,
    quitarVacios: 'Remove those breaks',
    descartado: 'What an EPUB cannot carry',
    descartadoQue: {
      table: 'tables',
      ul: 'lists',
      ol: 'numbered lists',
      s: 'strikethroughs',
      u: 'underlines',
      a: 'links',
      sup: 'superscripts',
      sub: 'subscripts',
      br: 'stray line breaks',
      nota: 'footnotes',
    },
    faltan: (n: number) =>
      n === 1
        ? 'One illustration asks for an image that did not come with the files:'
        : `${n} illustrations ask for images that did not come with the files:`,
    faltanAyuda: 'You can import anyway and choose each image later on its card.',
    sobrantes: (n: number) =>
      n === 1
        ? 'One image is not asked for by any mark in the text, so it is not imported:'
        : `${n} images are not asked for by any mark in the text, so they are not imported:`,
    sobrantesAyuda: 'You can add them later in their place with the “+” between paragraphs.',
    inservibles: (n: number) =>
      n === 1
        ? 'One image in the document is not a PNG or a JPG and cannot go in the EPUB:'
        : `${n} images in the document are not PNG or JPG and cannot go in the EPUB:`,
    inserviblesAyuda: 'Its place is marked in the chapter so you can swap it.',
    sinCortes: 'No chapters yet. Press “Break here” on the line where the first one starts.',
    vistaPrevia: 'Preview',
    verCapitulo: 'View',
    confirmar: (n: number) => (n === 1 ? 'Import 1 chapter' : `Import ${n} chapters`),
    descartar: 'This is not it, discard',
    importando: 'Importing…',
    lineas: (n: string) => `${n} lines`,
    ilustracion: 'Illustration',
    escena: 'Scene break',
    versos: 'Verse',
  },

  menu: 'More options',
  cerrar: 'Close',
  deshacer: 'Undo',
}
