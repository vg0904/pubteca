// Textos de la INTERFAZ. Siguen el idioma de la app.
// No poner aqui ningun texto que acabe dentro del EPUB: eso va en libro-es.ts
// y sigue el idioma del LIBRO. Mezclarlos produce libros en ingles que dicen
// «CAPITULO».
import type { ClaveGrupo } from '../app/avisos'
import type { ClaveProblema } from '../app/revision'

export const ui = {
  nombre: 'Pubteca',
  lema: 'Tu libro, listo para las tiendas.',
  descripcion:
    'Convierte tu manuscrito en dos EPUB listos para publicar: uno para Kindle (KDP) y otro para Apple Books. Gratis y sin instalar nada.',
  privacidad: 'Tu libro se queda en este navegador. Nunca se sube a ningún servidor.',

  inicio: {
    nuevo: 'Libro nuevo',
    nuevoDetalle: 'Empieza con un capítulo en blanco.',
    importar: 'Importar un manuscrito',
    importarDetalle: 'Un .docx de Word, o tus capítulos en .md o .txt. Nada se aplica sin que lo confirmes.',
    continuar: 'Continuar',
    tusLibros: 'Tus libros en este navegador',
    sinTitulo: 'Libro sin título',
    modificado: (cuando: string) => `Modificado ${cuando}`,
    capitulos: (n: number) => (n === 1 ? '1 capítulo' : `${n} capítulos`),
    borrar: 'Borrar',
    confirmarBorrar: (titulo: string) =>
      `¿Borrar «${titulo}» de este navegador? Se borran también sus imágenes. Si no tienes una copia (.zip), no se puede recuperar.`,
    honestidad:
      'Ojo: Safari y otros navegadores pueden borrar lo que guarda una página si pasas semanas sin abrirla. La copia de verdad es el .zip que guardas tú: el botón «Guardar copia» está siempre arriba.',
    privado:
      'No puedo guardar nada en este navegador (¿ventana privada?). Puedes trabajar, pero al cerrar la pestaña se pierde todo: guarda una copia antes.',
    cargando: 'Abriendo…',
  },

  barra: {
    inicio: 'Volver a tus libros',
    guardado: 'Guardado en este navegador',
    guardando: 'Guardando…',
    errorGuardar: 'No se pudo guardar',
    noSeGuarda: 'Sin guardar: abierto en otra pestaña',
    conflicto: 'Este libro se cambió en otra pestaña o ventana.',
    conflictoDetalle:
      'Para no borrar esos cambios, aquí se dejó de guardar. Si lo que tienes en esta pestaña te importa, guarda una copia (.zip) antes de recargar.',
    recargar: 'Recargar el libro guardado',
    copia: 'Guardar copia (.zip)',
    copiaNunca: 'Sin copia todavía',
    copiaHace: (cuando: string) => `Copia: ${cuando}`,
    copiaVieja: 'Hace más de una semana de tu última copia. Guarda una ahora.',
    copiaLista: 'Tu copia está lista',
    descargarCopia: 'Descargar la copia',
    preparandoCopia: 'Preparando la copia…',
    deshacer: 'Deshacer',
    rehacer: 'Rehacer',
  },

  secciones: {
    capitulos: 'Capítulos',
    portada: 'Portada y láminas',
    extras: 'Páginas extra',
    descargar: 'Descargar EPUB',
    indice: 'Índice del libro',
  },

  capitulos: {
    nuevo: 'Capítulo nuevo',
    importarMas: 'Importar más capítulos…',
    vacio: 'Este libro todavía no tiene capítulos.',
    menu: (nombre: string) => `Opciones de «${nombre}»`,
    subir: 'Subir',
    bajar: 'Bajar',
    alPrincipio: 'Mover al principio',
    alFinal: 'Mover al final',
    borrar: 'Borrar el capítulo',
    borrado: (nombre: string) => `Borraste «${nombre}».`,
    arrastrar: 'Arrastra para reordenar, o usa el menú ⋯',
    desordenada: 'Al reordenar, los números de «Capítulo N» quedaron fuera de orden.',
    renumerar: 'Numerar en orden',
  },

  editor: {
    etiqueta: 'Etiqueta',
    etiquetaAyuda: 'Capítulo 3, Prólogo, Epílogo, Interludio… o nada.',
    etiquetaNoReconocida: (etiqueta: string) =>
      `El libro solo separa «Capítulo N», «Prólogo», «Epílogo» o «Interludio». «${etiqueta}» saldrá pegada al título.`,
    titulo: 'Título del capítulo',
    tituloPagina: 'Título de la página',
    parrafo: 'Escribe aquí, o pega tu texto…',
    sinTitulo: 'Sin título ni etiqueta, el libro tomaría el primer párrafo como título. Ponle uno.',
    aperturas: 'El capítulo abre con',
    soltarApertura: 'Suelta aquí la ilustración para abrir el capítulo con ella',
    atajos: (mod: string) => `${mod}+I cursiva · ${mod}+B negrita · Intro: párrafo nuevo`,
    // barra de formato
    tipo: 'Tipo de bloque',
    tipos: { parrafo: 'Párrafo', subtitulo: 'Subtítulo', versos: 'Versos' },
    cursiva: 'Cursiva',
    negrita: 'Negrita',
    subirBloque: 'Subir el bloque',
    bajarBloque: 'Bajar el bloque',
    borrarBloque: 'Borrar el bloque',
    // insertar
    insertar: 'Insertar aquí',
    insertarAlFinal: 'Añadir:',
    soltarImagen: 'Suelta aquí la imagen',
    insertables: {
      parrafo: 'Párrafo',
      subtitulo: 'Subtítulo',
      escena: 'Cambio de escena',
      versos: 'Versos',
      ilustracion: 'Ilustración…',
    },
    escena: 'Cambio de escena',
    escenaAyuda: 'Borrar o Suprimir para quitarlo',
    versosAyuda: 'Intro: verso nuevo · Intro en un verso vacío: estrofa nueva (otra vez: salir)',
    verso: (estrofa: number, verso: number) => `Estrofa ${estrofa}, verso ${verso}`,
  },

  ilustracion: {
    alt: '¿Qué se ve en el dibujo?',
    altAyuda: 'Lo leen en voz alta los lectores de pantalla.',
    decorativa: 'Es solo decorativa: no hace falta describirla',
    paginaPropia: 'La ilustración ocupa su propia página',
    falta: (nombre: string) => `Falta la imagen «${nombre}»`,
    elegir: 'Elegir la imagen…',
    cambiar: 'Cambiar la imagen…',
    menu: 'Opciones de la ilustración',
    abrirCapitulo: 'Abrir el capítulo con este dibujo',
    devolver: 'Pasarla al texto del capítulo',
    quitar: 'Quitar la ilustración',
    subir: 'Subir',
    bajar: 'Bajar',
    arrastrar: 'Arrástrala sobre el título para abrir el capítulo con ella',
  },

  imagen: {
    rechazada: {
      heic: 'Es una foto HEIC (la del iPhone). El EPUB solo admite PNG o JPG: ábrela y expórtala como JPG.',
      webp: 'Es una imagen WebP. El EPUB solo admite PNG o JPG: conviértela antes de subirla.',
      tiff: 'Es un TIFF. KDP lo acepta para la portada que se sube aparte, pero dentro del EPUB solo valen PNG o JPG.',
      gif: 'Es un GIF. El EPUB de un libro solo admite PNG o JPG.',
      bmp: 'Es un BMP. El EPUB solo admite PNG o JPG.',
      desconocido: 'No es un PNG ni un JPG de verdad (¿un archivo renombrado?).',
      truncada: 'La imagen está incompleta: parece que se copió a medias. Vuelve a exportarla.',
      ilegible: 'El navegador no consigue abrir esta imagen: puede estar dañada.',
    },
    subiendo: 'Subiendo…',
  },

  portada: {
    titulo: 'Portada y láminas',
    portada: 'Portada',
    portadaAyuda:
      'Esta portada va dentro del EPUB de Apple Books. En KDP la portada se sube aparte, y ese campo solo acepta JPG o TIFF.',
    contraportada: 'Contraportada',
    contraportadaAyuda: 'Va al final del libro, como última página.',
    incluirContraportada: 'Incluir la contraportada en el libro',
    logo: 'Logo del título',
    logoAyuda:
      'Si tu título tiene logotipo, súbelo en negro sobre fondo transparente (PNG). Pubteca hace sola la versión blanca para el modo oscuro. Kindle no lo usa: allí el título va en texto, que se adapta solo.',
    logoBlanco: 'Así se verá en modo oscuro',
    logoOpaco:
      'Este logo no tiene fondo transparente, así que no puedo hacer la versión blanca: en modo oscuro se verá un recuadro. Expórtalo como PNG con transparencia.',
    sinLogoBlanco:
      'Este logo no tiene versión para el modo oscuro: en Apple Books con fondo oscuro casi no se verá. Si tiene el fondo pintado, expórtalo como PNG con el fondo transparente y vuelve a subirlo; o sube tú una versión blanca.',
    otroLogoBlanco: 'Usar otra versión blanca…',
    laminas: 'Láminas a color',
    laminasAyuda: 'Van solas al principio del libro, antes de la portadilla, cada una en su página.',
    anadirLamina: 'Añadir lámina…',
    elegir: 'Elegir imagen…',
    cambiar: 'Cambiar…',
    quitar: 'Quitar',
    soltar: 'o suéltala aquí',
    medidas: (ancho: number, alto: number, peso: string) => `${ancho} × ${alto} px · ${peso}`,
  },

  extras: {
    titulo: 'Páginas extra',
    ayuda: 'Las páginas que no son capítulos: la dedicatoria, una cita al principio, los agradecimientos…',
    dedicatoria: 'Dedicatoria',
    epigrafe: 'Epígrafe',
    inicio: 'Página al principio',
    final: 'Página al final',
    anadirDedicatoria: '+ Dedicatoria',
    anadirEpigrafe: '+ Epígrafe (una cita)',
    anadirInicio: '+ Página al principio',
    anadirFinal: '+ Página al final',
    yaHay: 'Ya hay una',
    vacio: 'Todavía no hay páginas extra. Ninguna es obligatoria.',
    alPrincipio: 'Al principio, antes del primer capítulo',
    alFinal: 'Al final, después del último capítulo',
    moverAlFinal: 'Llevarla al final',
    moverAlPrincipio: 'Llevarla al principio',
    borrar: 'Borrar la página',
    subir: 'Subir',
    bajar: 'Bajar',
    dedicatoriaAyuda: 'Va sola en su página, centrada y en cursiva.',
    epigrafeAyuda: 'Una cita que abre el libro. Va sola en su página.',
  },

  descargar: {
    titulo: 'Descargar los EPUB',
    datos: 'Datos del libro',
    datosAyuda: 'Lo que las tiendas y los lectores ven del libro. Solo el título es obligatorio.',
    campos: {
      titulo: 'Título',
      subtitulo: 'Subtítulo',
      autor: 'Autor o autora',
      sello: 'Sello editorial',
      isbn: 'ISBN',
      isbnAyuda: 'Opcional. Si lo pones, es la identidad del libro para las tiendas.',
      fechaPublicacion: 'Fecha de publicación',
      descripcion: 'Descripción',
      derechos: 'Línea de derechos',
      derechosAyuda: '{año} y {autor} se rellenan solos.',
      idioma: 'Idioma del libro',
    },
    identidad: (titulo: string, autor: string) =>
      `Ya descargaste este libro como «${titulo}»${autor ? ` de ${autor}` : ''}. Si ya lo publicaste, cambiar el título o el autor lo convierte en OTRO libro para las tiendas (sin ISBN, su identificador sale de esos dos datos). Si aún no lo has publicado, no pasa nada.`,
    revision: 'Antes de generar',
    todoBien: 'Nada que revisar antes de generar.',
    ir: 'Ir',
    generar: 'Preparar los dos EPUB',
    regenerar: 'Volver a prepararlos',
    generando: 'Preparando los EPUB…',
    bloqueado: 'Arregla lo marcado como «Impide generar» y vuelve a intentarlo.',
    kindle: 'EPUB para Kindle (KDP)',
    apple: 'EPUB para Apple Books',
    tarifa: (dolares: string) => `tarifa de entrega ≈ ${dolares} por venta`,
    tarifaAyuda: 'Amazon cobra la entrega por MB con la regalía del 70 % (EE. UU.).',
    listos: 'Listos. Descarga cada uno para su tienda:',
    desactualizado: 'Cambiaste el libro después de prepararlos. Vuelve a prepararlos para descargar lo último.',
    sinFuentes:
      'No pude cargar la letra del libro (¿sin conexión?). El EPUB de Apple Books usará la Baskerville del sistema.',
    resultado: 'Lo que dice la revisión',
    resultadoResumen: (mensajes: number, grupos: number) =>
      mensajes === grupos ? '' : `${mensajes} avisos, agrupados en ${grupos}.`,
    verDetalle: 'Ver los mensajes originales',
    afectadas: (n: number) => (n === 1 ? '1 afectada' : `${n} afectadas`),
    reporte: 'Descargar el reporte (.txt)',
  },

  niveles: {
    bloquea: { icono: '⛔', palabra: 'Impide generar' },
    error: { icono: '✗', palabra: 'Error' },
    aviso: { icono: '!', palabra: 'Aviso' },
    nota: { icono: 'i', palabra: 'Nota' },
  },

  problemas: {
    sinTitulo: 'El libro no tiene título. Escríbelo arriba.',
    sinTexto: 'El libro no tiene ningún capítulo con texto.',
    capituloSinTitulo: 'Un capítulo no tiene título ni etiqueta: el libro tomaría su primer párrafo como título.',
    paginaSinTitulo: 'Una página extra no tiene título: el libro tomaría su primer párrafo como título.',
    faltaImagen: 'Una ilustración no tiene imagen: no entrará al libro.',
    capituloVacio: 'Un capítulo está vacío: no saldrá en el libro.',
  } satisfies Record<ClaveProblema, string>,

  // Cada grupo de avisos dice la CONSECUENCIA para el lector, no el tecnicismo.
  grupos: {
    noEsImagen: { titulo: 'Imágenes que no se pueden abrir', consejo: 'No entran al libro. Expórtalas como PNG o JPG.' },
    faltaImagen: { titulo: 'Ilustraciones sin imagen', consejo: 'No entran al libro. Elige la imagen en su tarjeta.' },
    recursoAusente: {
      titulo: 'Una imagen usada dos veces con papeles distintos',
      consejo: 'Usa una imagen distinta para el logo y para las ilustraciones.',
    },
    transparencia: {
      titulo: 'Con zonas transparentes: Kindle las pinta de blanco',
      consejo: 'Aplánalas sobre su fondo al exportarlas.',
    },
    cmyk: { titulo: 'En CMYK: en pantalla los colores salen apagados o raros', consejo: 'Conviértelas a sRGB.' },
    p3: {
      titulo: 'En Display P3: los colores cambian de un lector a otro',
      consejo: 'Expórtalas en sRGB (Procreate y el iPad usan P3 por defecto).',
    },
    pixeles: { titulo: 'Demasiado grandes para Apple Books (más de 5,6 millones de píxeles)', consejo: 'Redúcelas.' },
    portadaLadoCorto: { titulo: 'Portada pequeña para Apple Books', consejo: 'Apple pide al menos 1400 px en el lado corto.' },
    portadaBaja: { titulo: 'Portada algo baja para pantallas de alta resolución', consejo: 'KDP recomienda 2500 px de alto o más.' },
    resolucion: { titulo: 'Se verán borrosas en pantallas grandes', consejo: 'Lo ideal es 1600 × 2400 px (horizontal, 2400 × 1600).' },
    horizontal: { titulo: 'Horizontales: en pantallas verticales se verán reducidas', consejo: '' },
    proporcion: { titulo: 'Con franjas vacías en algunas pantallas', consejo: 'La proporción ideal es 2:3 (por ejemplo 1600 × 2400).' },
    peso: {
      titulo: 'Pesadas: encarecen la tarifa de entrega de Kindle',
      consejo: 'Comprímelas: Amazon cobra la entrega por MB.',
    },
    logoOpaco: { titulo: 'Logo sin fondo transparente: en modo oscuro se verá un recuadro', consejo: 'Súbelo como PNG transparente.' },
    sinLogoBlanco: { titulo: 'Sin logo blanco: en modo oscuro el logo casi no se verá', consejo: 'Sube el logo en negro sobre transparente y se genera solo.' },
    sinPortada: { titulo: 'Sin portada: el EPUB de Apple Books sale sin portada interna', consejo: 'Súbela en «Portada y láminas».' },
    capituloVacio: { titulo: 'Capítulos vacíos que no salen en el libro', consejo: '' },
    sinDescripcion: {
      titulo: 'Ilustraciones sin descripción: los lectores de pantalla dirán solo «Ilustración»',
      consejo: 'Escribe qué se ve en cada una, o márcalas como decorativas.',
    },
    otro: { titulo: '', consejo: '' },
  } satisfies Record<ClaveGrupo, { titulo: string; consejo: string }>,

  importar: {
    titulo: 'Importar',
    elegir: 'Elegir archivos…',
    soltar: 'Suelta aquí tu manuscrito',
    soltarDetalle:
      'Un .docx de Word con el libro entero, o tus capítulos en .md o .txt (con sus imágenes, si las tienen). También puedes pegar el texto.',
    pegar: 'Pegar texto…',
    pegarAyuda: 'Pega aquí el texto (Cmd+V o Ctrl+V). La cursiva se conserva si viene de Word, Pages o Google Docs.',
    pegarListo: 'Usar este texto',
    leyendo: 'Leyendo el documento…',
    noEntiendo: (nombre: string) => `No sé leer «${nombre}». Pubteca entiende .docx, .md, .txt y, para las ilustraciones, PNG y JPG.`,
    docxYOtros: 'Importa el .docx solo: un documento de Word ya trae sus capítulos e imágenes.',
    variosDocx: 'Importa los .docx de uno en uno.',
    error: (nombre: string, mensaje: string) => `No pude leer «${nombre}»: ${mensaje}`,
    cancelar: 'Cancelar',
    // pantalla de cortes
    revisa: 'Revisa dónde empieza cada capítulo',
    revisaAyuda:
      'Pubteca propone los cortes; tú decides. «Cortar aquí» en cualquier línea empieza un capítulo; «No cortar aquí» lo une con el anterior.',
    cortarAqui: 'Cortar aquí',
    noCortar: 'No cortar aquí',
    motivos: {
      estiloTitulo: 'Tiene el estilo «Título 1» de Word',
      lineaCapitulo: 'Parece la cabecera de un capítulo',
      saltoDePagina: 'Hay un salto de página',
      manual: 'Lo cortaste tú',
      archivo: 'Empieza un archivo',
    },
    sugerido: '¿Empieza aquí un capítulo? Hay un salto de página.',
    lineaSiguiente: 'El título es la línea siguiente',
    usarLineaSiguiente: 'Usar la línea siguiente como título',
    esTexto: 'Es texto, no título',
    antes: 'Antes del primer capítulo',
    huerfanos: {
      dedicatoria: 'Es la dedicatoria: llevarla a «Páginas extra»',
      fuera: 'No lo importes (por ejemplo, la portadilla: Pubteca la hace sola con los datos del libro)',
      yaHay: 'El libro ya tiene dedicatoria',
      imagenes: 'Las imágenes de esta parte no se importan.',
      primerCapitulo: '¿Es el primer capítulo? Pulsa «Cortar aquí» en su primera línea.',
    },
    asiQueda: 'Así queda',
    resumen: {
      capitulos: (n: string) => `${n} capítulos`,
      capitulo: '1 capítulo',
      parrafos: (n: string) => `${n} párrafos`,
      enfasis: (n: string) => `${n} cursivas y negritas`,
      escenas: (n: string) => `${n} cambios de escena`,
      versos: (n: string) => `${n} versos`,
      ilustraciones: (n: string) => `${n} ilustraciones`,
      descartados: (n: string) => `${n} elementos descartados`,
    },
    vacios: (n: number) =>
      n === 1
        ? 'Un capítulo no tiene texto. ¿Era un índice escrito a mano?'
        : `${n} capítulos no tienen texto. ¿Era un índice escrito a mano?`,
    quitarVacios: 'Quitar esos cortes',
    descartado: 'Lo que un EPUB no puede llevar',
    descartadoQue: {
      table: 'tablas',
      ul: 'listas',
      ol: 'listas numeradas',
      s: 'tachados',
      u: 'subrayados',
      a: 'enlaces',
      sup: 'superíndices',
      sub: 'subíndices',
      br: 'saltos de línea sueltos',
      nota: 'notas al pie',
    } as Record<string, string>,
    faltan: (n: number) =>
      n === 1
        ? 'Una ilustración pide una imagen que no venía con los archivos:'
        : `${n} ilustraciones piden imágenes que no venían con los archivos:`,
    faltanAyuda: 'Puedes importarlas igual y elegir cada imagen después en su tarjeta.',
    sobrantes: (n: number) =>
      n === 1
        ? 'Una imagen no la pide ninguna marca del texto, así que no se importa:'
        : `${n} imágenes no las pide ninguna marca del texto, así que no se importan:`,
    sobrantesAyuda: 'Puedes añadirlas después en su sitio con el «+» entre párrafos.',
    inservibles: (n: number) =>
      n === 1
        ? 'Una imagen del documento no es PNG ni JPG y no puede ir en el EPUB:'
        : `${n} imágenes del documento no son PNG ni JPG y no pueden ir en el EPUB:`,
    inserviblesAyuda: 'Su sitio queda marcado en el capítulo para que la cambies.',
    sinCortes: 'Todavía no hay ningún capítulo. Pulsa «Cortar aquí» en la línea donde empieza el primero.',
    vistaPrevia: 'Vista previa',
    verCapitulo: 'Ver',
    confirmar: (n: number) => (n === 1 ? 'Importar 1 capítulo' : `Importar ${n} capítulos`),
    descartar: 'No es esto, descartar',
    importando: 'Importando…',
    lineas: (n: string) => `${n} líneas`,
    ilustracion: 'Ilustración',
    escena: 'Cambio de escena',
    versos: 'Versos',
  },

  menu: 'Más opciones',
  cerrar: 'Cerrar',
  deshacer: 'Deshacer',
} as const

export type Ui = typeof ui
