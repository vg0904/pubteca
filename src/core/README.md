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
