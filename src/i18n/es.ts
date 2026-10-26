// Textos de la INTERFAZ. Siguen el idioma de la app.
// No poner aqui ningun texto que acabe dentro del EPUB: eso va en
// src/core/textos-libro.ts y sigue el idioma del LIBRO. Mezclarlos produce
// libros en ingles que dicen «Indice».
import type { ClaveAvisoCopia, ErrorCopia } from '../app/abrir-copia'
import type { ClaveGrupo } from '../app/avisos'
import type { ClaveProblema } from '../app/revision'
import { dolares, numero, tamano, type Separadores } from '../app/formato'

const SEPARADORES: Separadores = { miles: '.', decimal: ',' }

export const ui = {
  nombre: 'Pubteca',
  lema: 'Tu libro, listo para las tiendas.',
  descripcion:
    'Convierte tu manuscrito en dos EPUB listos para publicar: uno para Kindle (KDP) y otro para Apple Books. Gratis y sin instalar nada.',
  privacidad: 'Tu libro se queda en este navegador. Nunca se sube a ningún servidor.',

  /** El idioma de la INTERFAZ, que no es el del libro: ver core/textos-libro.ts. */
  idiomaUi: 'Idioma de Pubteca',


  /**
   * Como se leen aqui los numeros y las fechas. La mecanica esta en
   * `app/formato.ts`; esto es la parte que cambia con el idioma.
   */
  formato: {
    numero: (n: number) => numero(n, SEPARADORES),
    tamano: (bytes: number) => tamano(bytes, SEPARADORES),
    dolares: (x: number) => dolares(x, SEPARADORES),
    haceDias: (dias: number) => (dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`),
  },

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
      'Ojo: Safari y otros navegadores pueden borrar lo que guarda una página si pasas semanas sin abrirla. La copia de verdad es el .zip que guardas tú: el botón «Guardar copia» está siempre arriba, y «Abrir copia» la recupera.',
    privado:
      'No puedo guardar nada en este navegador (¿ventana privada?). Puedes trabajar, pero al cerrar la pestaña se pierde todo: guarda una copia antes.',
    cargando: 'Abriendo…',
  },

  vistaPrevia: {
    titulo: 'Vista previa',
    ayuda:
      'Es el EPUB de verdad, el mismo que se descarga, página a página. Cada lector lo pinta a su manera: el tamaño de la letra y los márgenes los elige quien lee.',
    tienda: 'Tienda',
    tema: 'Fondo',
    temas: { claro: 'Claro', sepia: 'Sepia', oscuro: 'Oscuro' },
    pagina: (i: number, n: number) => `Página ${i} de ${n}`,
    anterior: '← Anterior',
    siguiente: 'Siguiente →',
    marco: (titulo: string) => `Vista previa: ${titulo}`,
  },

  copia: {
    abrir: 'Abrir copia (.zip)',
    abrirDetalle:
      'Una copia que guardaste con Pubteca, o la carpeta de un libro del generador comprimida en .zip. Se abre como un libro nuevo: no pisa nada.',
    leyendo: 'Leyendo la copia…',
    titulo: 'Esto trae la copia',
    hecha: (fecha: string) => `Copia hecha el ${fecha}.`,
    deCarpetas: 'Se leyó desde sus carpetas (libro.txt, capitulos/, ilustraciones/…), como las lee el generador.',
    resumen: (capitulos: number, extras: number, imagenes: number) =>
      [
        capitulos === 1 ? '1 capítulo' : `${capitulos} capítulos`,
        extras === 0 ? '' : extras === 1 ? '1 página extra' : `${extras} páginas extra`,
        imagenes === 0 ? '' : imagenes === 1 ? '1 imagen' : `${imagenes} imágenes`,
      ]
        .filter(Boolean)
        .join(' · '),
    hayAvisos: 'Lo que no se pudo recuperar tal cual:',
    abrirLibro: 'Abrir como libro nuevo',
    cancelar: 'Cancelar',
    soloCopia: 'Una copia (.zip) se abre sola: el resto de archivos no se importaron.',
    errores: {
      noEsZip: 'Ese archivo no es un .zip, o está dañado.',
      noEsCopia:
        'En ese .zip no hay ningún libro: no es una copia de Pubteca y no trae la carpeta capitulos/ con tus capítulos en .md o .txt.',
      danada: 'La copia está dañada: su proyecto.json no se puede leer.',
      versionFutura: 'Esta copia se hizo con una versión más nueva de Pubteca. Recarga la página e inténtalo otra vez.',
    } satisfies Record<ErrorCopia, string>,
    avisos: {
      faltaImagen: (d: string) => `Falta una imagen (${d}). Donde iba, el libro te lo marcará para que la vuelvas a poner.`,
      imagenIlegible: (d: string) => `${d} no es PNG ni JPG, o está dañada: no se abrió.`,
      imagenSinUsar: (d: string) => `${d} no la usa ningún capítulo, así que se quedó fuera (el generador tampoco la usaba).`,
      capituloVacio: (d: string) => `${d} está vacío: no se abrió.`,
      idioma: (d: string) => `El libro no sabe escribir en «${d}»: se puso en español. Cámbialo en «Descargar EPUB».`,
      fecha: (d: string) => `«${d}» no es una fecha (año-mes-día): la fecha de publicación se quitó.`,
      sinLibroTxt: () => 'No traía libro.txt: el título, el autor y los demás datos se piden al descargar.',
      descartados: (d: string) => `${d} ${d === '1' ? 'parte' : 'partes'} de la copia no se entendieron y se quedaron fuera.`,
      dedicatoriaDeMas: (d: string) =>
        `${d}: un libro lleva una sola dedicatoria. Esta pasó a ser una página del principio, con su texto entero.`,
      epigrafeDeMas: (d: string) =>
        `${d}: un libro lleva un solo epígrafe. Este pasó a ser una página del principio, con su texto entero.`,
      copiaAntigua: () =>
        'Es una copia de una versión anterior de Pubteca: vuelve todo el texto y las imágenes, pero no qué ilustraciones eran decorativas ni el nombre con que subiste cada imagen.',
      editadaFuera: () =>
        'Los archivos de texto de la copia se cambiaron fuera de Pubteca después de hacerla: se abrió lo que dicen ellos, que es lo último que escribiste.',
      fuentesPropias: () => 'Traía fuentes propias: Pubteca usa la suya, Libre Baskerville.',
    } satisfies Record<ClaveAvisoCopia, (d: string) => string>,
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

  // Ajustar UNA imagen: recortarla y ponerla en la resolucion que toca. Es
  // decision de autor (que parte del dibujo se ve), asi que va imagen por
  // imagen. Lo que es decision de ENTREGA (comprimir para Kindle) va en la
  // pantalla de descarga, para todas de una vez: ver `descargar.imagenes`.
  ajustar: {
    abrir: 'Ajustar la imagen…',
    arreglar: 'Arreglar',
    pestanas: 'Para qué tienda',
    resolucion: 'Resolución',
    listo: 'Listo',
    // La pestaña de Kindle no ajusta OTRA imagen: dice que hacerle a esta al
    // entregarla. Ver la cabecera de ui/AjustarImagen.tsx.
    kindle: {
      marca: 'propio',
      titulo: 'Solo para esta imagen',
      ayuda:
        'El encuadre es el mismo en las dos tiendas: es tu dibujo. Lo que cambia es cuánto puede pesar, porque Amazon cobra la entrega por MB y Apple Books no cobra por el tamaño del archivo.',
      propio: 'Dar a esta imagen un ajuste propio para Kindle',
      general: (calidad: number, grises: boolean) =>
        `Sigue lo que pusiste en «Descargar EPUB»: JPEG de calidad ${calidad}${grises ? ', en blanco y negro' : ''}.`,
      sinComprimir: 'Ahora mismo Kindle recibe esta imagen tal cual, como Apple Books. Se cambia para todas en «Descargar EPUB».',
      resolucionAyuda: (ancho: number, alto: number) => `A Kindle le llegará en ${ancho} × ${alto} px.`,
      volverAlGeneral: 'Volver al ajuste de todas',
      cuando: 'Esto se guarda al tocarlo. La versión de Kindle se prepara al descargar los EPUB.',
    },
    titulo: 'Ajustar la imagen',
    ayuda: 'Se guarda como una imagen nueva; la que subiste no se toca, y «Deshacer» la devuelve.',
    original: (ancho: number, alto: number, peso: string) => `Ahora: ${ancho} × ${alto} px · ${peso}`,
    proporcion: 'Proporción',
    proporcionAyuda: 'La de las pantallas de los lectores es alta y estrecha: 2:3 es la que mejor les cabe.',
    aspectos: {
      '2:3': '2:3 · la recomendada',
      '3:4': '3:4 · algo más cuadrada',
      '1:1': 'Cuadrada',
      '3:2': '3:2 · horizontal',
      '4:3': '4:3 · horizontal',
      original: 'La de esta imagen',
    } as Record<string, string>,
    zoom: 'Acercar',
    zoomAyuda: 'Acerca el marco para dejar fuera lo que no quieras.',
    encuadre: 'Qué parte se ve',
    encuadreAyuda: 'Arrastra el dibujo para encuadrarlo. Lo que queda fuera del marco no entra al libro.',
    centrar: 'Centrar',
    todo: 'La imagen entera',
    tamano: 'Tamaño final',
    ancho: 'Ancho',
    alto: 'Alto',
    px: 'px',
    sugerido: (ancho: number, alto: number) => `Recomendado: ${ancho} × ${alto} px`,
    usarSugerido: 'Usar el recomendado',
    resultado: (ancho: number, alto: number, peso: string) => `Quedará en ${ancho} × ${alto} px · ${peso}`,
    midiendo: (ancho: number, alto: number) => `Quedará en ${ancho} × ${alto} px · calculando el peso…`,
    formato: 'Formato',
    formatos: { png: 'PNG · sin pérdida', jpeg: 'JPEG · más ligero' } as Record<string, string>,
    formatoAyuda:
      'PNG guarda el dibujo exacto y es lo mejor para Apple Books. JPEG pesa mucho menos; si el libro va a Kindle, comprimir se puede hacer de golpe en «Descargar EPUB».',
    calidad: 'Calidad del JPEG',
    grises: 'Pasarla a blanco y negro',
    aplicar: 'Guardar la imagen ajustada',
    aplicando: 'Ajustando…',
    cancelar: 'Cancelar',
    hecho: 'Imagen ajustada.',
    error: 'No pude ajustar esta imagen en este navegador.',
    sinCambios: 'Así como está, no cambia nada.',
    subira: 'El tamaño que pides es mayor que el trozo que has encuadrado: el dibujo se verá peor, no mejor.',
    tope: 'Más de 5,6 millones de píxeles: Apple Books no lo admite. Baja el tamaño.',
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
    /** Los idiomas del LIBRO que se ofrecen: los que tienen textos en core/textos-libro.ts. */
    idiomas: {
      es: 'Español',
      en: 'Inglés',
      ca: 'Catalán',
      gl: 'Gallego',
      eu: 'Euskera',
      pt: 'Portugués',
      fr: 'Francés',
      it: 'Italiano',
      de: 'Alemán',
    } as Record<string, string>,
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

    // Decision de ENTREGA, no de autor: va aqui y vale para todas las imagenes
    // del libro, para no configurarlas una por una.
    imagenes: {
      titulo: 'Las imágenes en cada tienda',
      ayuda:
        'Apple Books no cobra por el tamaño del archivo (admite hasta 2 GB), así que allí van tus imágenes tal como las subiste. Amazon cobra la entrega por MB, así que a Kindle puedes mandar una versión más ligera. Tus originales no se tocan.',
      apple: 'Apple Books: tus imágenes, sin tocar',
      appleDetalle: (n: number, peso: string) =>
        n === 1 ? `1 imagen · ${peso}` : `${n} imágenes · ${peso}`,
      kindle: 'Kindle (KDP)',
      kindleDetalle: (n: number, peso: string) =>
        n === 1 ? `1 imagen · ${peso}` : `${n} imágenes · ${peso}`,
      comprimir: 'Comprimirlas en JPEG para Kindle',
      calidad: 'Calidad',
      calidadAyuda: 'Entre 70 y 85 casi no se nota al leer y el archivo baja mucho.',
      grises: 'Pasarlas a blanco y negro',
      grisesAyuda:
        'Casi todos los Kindle son de tinta electrónica en gris: así pesan bastante menos y en esos lectores se ven igual.',
      estimado: (peso: string) => `Las imágenes quedarán en ≈ ${peso}`,
      ahorro: (antes: string, ahora: string) => `${antes} → ${ahora}`,
      comprimidas: (antes: string, ahora: string) =>
        `Las imágenes de Kindle se comprimieron: ${antes} → ${ahora}. Las de Apple Books van sin tocar.`,
      sinAhorro:
        'Con estas imágenes, comprimir no ahorra nada: el PNG ya las guarda mejor que el JPEG. Las que no mejoren se mandan tal cual.',
      calculando: 'Calculando…',
      noSePudo: 'No pude calcular el tamaño aquí. Prepara los EPUB y verás el de verdad.',
      sinImagenes: 'Este libro no tiene imágenes, así que no hay nada que comprimir.',
      transparencia:
        'JPEG no guarda transparencias: lo transparente saldrá blanco. Kindle hace eso de todas formas.',
      soloKindle: 'La portada y el logo no entran al EPUB de Kindle, así que no se comprimen.',
    },
  },

  // Las dos tiendas, como las nombra la interfaz cuando hay que separar lo
  // que le toca a cada una (los avisos de una imagen, el recordatorio antes de
  // descargar). El reparto esta en app/avisos.ts.
  tiendas: {
    apple: 'Apple Books',
    kindle: 'Kindle',
    lista: 'Lista',
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
}

/**
 * La forma de los textos de la interfaz. Sale del español, que es el original.
 *
 * SIN `as const` a proposito: con el, cada cadena tendria su tipo literal y
 * `en.ts` solo podria repetir las palabras en español. Asi `Ui` dice «aqui va
 * un string» y el compilador exige que esten TODAS las claves, con la misma
 * forma y la misma firma en las funciones.
 */
export type Ui = typeof ui
