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
fuentes ya leidas (`Fuente` sobre sus bytes) y los bloques del parser; el core
no carga nada.

- `sfnt.ts` lee una fuente TrueType: `cmap`, avances, kerning de GPOS y
  ligaduras de GSUB, y si su licencia deja incrustarla (`fsType`).
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
