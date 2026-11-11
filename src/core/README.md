# core

TypeScript **puro y sincrono**. Sin DOM, sin canvas, sin `File`, sin `async`.

Recibe `{texto, bytes de imagenes como Uint8Array, metadatos}` y devuelve un
`Uint8Array` con el EPUB. Es el port literal de `generar_epub.py`.

Esta frontera es lo que hace posibles las tres cosas que el proyecto necesita:

1. golden tests contra la salida del Python,
2. generar los libros de prueba en CI sin navegador,
3. que el mismo core corra en Node como CLI.

Si el core se vuelve `async` por un inflate o un hash, los golden tests dejan de
ser deterministas y el `await` se contagia a todo el pipeline. No lo vuelvas async.

## `impreso/`: el libro en papel

El compositor del PDF interior, igual de puro y sincrono. La app le pasa las
fuentes ya leidas (`Fuente` sobre sus bytes) y el proyecto del motor; el core
no carga nada.

- `sfnt.ts` lee una fuente TrueType: `cmap`, avances, kerning de GPOS y
  ligaduras de GSUB, si su licencia deja incrustarla (`fsType`), el contorno
  de cada glifo como trazado SVG (con el pinta la vista previa) y la caja que
  declara cada glifo (lo que de verdad suben los acentos).
- `guiones.ts` parte palabras: Liang con los patrones de `patrones/` (generados,
  no se editan a mano) y encima las reglas de la RAE.
- `parrafo.ts` compone un parrafo con Knuth y Plass: nunca tres guiones
  seguidos, la ultima palabra entera, la raya pegada a su palabra.
- `paginar.ts` corta en paginas sobre una reticula: capitulos en impar, sin
  viudas ni huerfanas, impar sin guion al pie, el cambio de escena siempre
  visible, ilustraciones en su pagina, cabeceras y folios.
- `tipos.ts`: lo que sale es una LISTA DE OPERACIONES por pagina (glifos
  colocados, imagenes). La pintan el PDF y la vista previa: lo que se ve es lo
  que se imprime.
- `subconjunto.ts` recorta una fuente a los glifos usados (y las piezas de
  los compuestos), conservando sus ids.
- `pdf.ts` escribe el PDF/X-1a: PDF 1.3, solo gris, fuentes en subconjunto
  con ToUnicode, cajas con sangrado, OutputIntent por nombre. Determinista:
  el reloj se inyecta y el /ID es un hash del contenido.
- `familias.ts` (las seis letras, con su cuerpo recomendado), `formatos.ts`
  (los cortes de KDP y lo que pide cada destino: margenes minimos, el medianil
  por numero de paginas, cuantas paginas, la ultima en blanco) y `config.ts`
  (las opciones del impreso con su valor por defecto; `normalizarConfig` es la
  unica puerta, para el almacen, la copia y el compositor).
- `contenido.ts` lee lo que se imprime del MISMO proyecto del motor que da los
  EPUB, con las reglas de `libro.ts`.
- `plan.ts` decide que paginas lleva el libro y en que orden (anteportada,
  laminas, portada, creditos, extras, indice, capitulos, colofon), como se
  numeran (romanos o nada en los preliminares, arabigos desde el capitulo 1),
  y lo compone entero con los margenes del destino: el medianil de KDP sale
  del numero real de paginas (`buscarMedianil`) y el indice lleva los folios
  reales (dos vueltas).
- `cubierta.ts` compone la cubierta entera: el lomo por paginas y papel, los
  seis estilos de portada como DATOS (en fracciones del ancho de la portada y
  milimetros fijos), la contraportada con la caja del codigo y la sinopsis, la
  tinta de cada pieza por contraste (WCAG) y el velo cuando hace falta. No
  pinta: da las capas del fondo (que pinta la app) y las operaciones en
  vectores. Sus opciones viven en `cubierta-config.ts`, ligero, para que el
  almacen y la copia no carguen el compositor.
- `ean13.ts`: el codigo de barras de un ISBN, modulo a modulo (las tablas de
  la norma), y `pdf-cubierta.ts`, el PDF de la cubierta con las piezas del
  escritor del interior: varias letras, texto girado, rectangulos y el fondo en
  sRGB (no es PDF/X-1a: ver plan.md, decision 11).
