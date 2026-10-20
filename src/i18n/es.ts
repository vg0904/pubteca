// Textos de la INTERFAZ. Siguen el idioma de la app.
// No poner aqui ningun texto que acabe dentro del EPUB: eso va en libro-es.ts
// y sigue el idioma del LIBRO. Mezclarlos produce libros en ingles que dicen
// «CAPITULO».
export const ui = {
  nombre: 'Pubteca',
  lema: 'Tu libro, listo para las tiendas.',
  descripcion:
    'Convierte tus capitulos en dos EPUB listos para publicar: uno para Kindle (KDP) y otro para Apple Books. Gratis y sin instalar nada.',
  privacidad: 'Tu libro se queda en este navegador. Nunca se sube a ningun servidor.',
  enConstruccion: 'En construccion',
  enConstruccionDetalle:
    'Ahora mismo se esta portando el motor de generacion. Esta pagina solo confirma que el despliegue funciona.',
} as const

export type Ui = typeof ui
