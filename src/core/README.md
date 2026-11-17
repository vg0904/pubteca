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
  vectores. Las piezas de la portada que el autor mueve a mano (`mover`, por
  estilo y en fracciones de A) se aplican sin salir nunca de lo seguro de KDP,
  y la cubierta dice lo que de verdad se movio (`movidas`). Sus opciones viven
  en `cubierta-config.ts`, ligero, para que el almacen y la copia no carguen
  el compositor.
- `ean13.ts`: el codigo de barras de un ISBN, modulo a modulo (las tablas de
  la norma), y lo que le pasa a un ISBN que no vale (`revisarIsbn`: la forma,
  el prefijo 978/979 de los libros o el digito de control, con el que tocaria).
  `codigo.ts` compone el codigo en su caja (ISBN encima, barras al 90 %, zona
  de silencio de 11 y 7 modulos, cifras debajo) y lo escribe en SVG con el
  texto en contornos; lo usan la contraportada, la muestra de la pantalla y el
  codigo suelto. `pdf-cubierta.ts`, el PDF de la cubierta con las piezas del
  escritor del interior: varias letras, texto girado, rectangulos y el fondo en
  sRGB (no es PDF/X-1a: ver plan.md, decision 11) o, si el autor lo pide, en
  CMYK y PDF/X-1a:2001 con su OutputIntent.
- `icc.ts` lee un perfil ICC de la version 2 y aplica sus tablas (mft1/mft2:
  curvas, rejilla en tetraedros o multilineal); `color.ts` separa el sRGB en
  CMYK con la tabla perceptual del perfil (en una rejilla de 33³ sobre el RGB),
  con el limite de tinta, y hace la prueba en pantalla. Sin WASM: TypeScript.

## `web/`: el libro para la web

Un .zip que se sube tal cual a cualquier hosting, o que se integra en un sitio
con `<pubteca-lector src="libro/libro.json">`. Sale del MISMO `Libro` que los
EPUB: `construir.ts` (el de los EPUB) exporta `armar()`, que arma las partes en
su orden de siempre y dice que paginas puso cada una, y el `Libro` apunta en
`secciones` las paginas de cada capitulo y de cada extra. Los EPUB no cambian
ni un byte: lo vigilan los golden.

- `construir.ts` junta las paginas de cada capitulo en una sola parte (el EPUB
  las parte por las ilustraciones), las pasa a HTML (sin `epub:type`, las
  imagenes con su tamaño y `loading="lazy"`), y escribe `libro.json`, una
  pagina por parte que tambien se lee suelta, e `index.html` con el manifiesto
  dentro (para abrirse con doble clic). Lo omitido se quita ANTES de armar: sus
  ilustraciones no viajan y lo demas conserva sus nombres. Recibe el lector y el
  LEEME ya leidos: el core no carga nada.
- `config.ts`: lo omitido, los enlaces, si se aligeran las imagenes y como se
  abre el libro (modo y letra); `normalizarWeb` es la unica puerta, y
  `urlSegura` solo deja pasar `http` y `https`.
- `letras.ts` + `woff.ts`: las seis letras del impreso viajan en el .zip (en
  WOFF, con su OFL al lado) para que el nombre que ve quien lee sea la letra
  que se pinta. `aWoff` comprime cada tabla con zlib sin tocar ni un byte de
  ella, y rellena tambien la ultima: sin ese relleno Chrome rechaza la fuente.
  Una familia que no llega entera, o sin su licencia, no se ofrece.
- `textos.ts`: los botones del lector y la pagina del final, en los nueve
  idiomas del libro. Viajan en `libro.json`, no en el lector.
- `css.ts`: la hoja de Kindle mas lo que cambia al leer de corrido.

El lector (`src/lector/lector.js`) no es TypeScript ni pasa por el empaquetador:
es el archivo que se entrega, tal cual, sin dependencias. Lee de corrido o pasa
paginas: el texto se reparte en columnas del tamaño de la ventana y pasar
pagina es mover la tira (con el dedo, tocando los lados, el teclado, el
trackpad o los botones). Las letras las registra en el DOCUMENTO con
`FontFace`: Chrome no lee las `@font-face` de dentro de una sombra. La app lo lee como
texto (`?raw`). Junto a el, los LEEME en español e ingles que van en el .zip.
`npm run web -- <carpeta-del-libro>` escribe en `tmp/web` la carpeta abierta,
para servirla y mirarla.
