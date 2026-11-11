# tests

## De donde salen las expectativas

`casos-texto.json` NO esta escrito a mano. Lo genera
`scripts/exportar-casos-texto.py` ejecutando el `generar_epub.py` de referencia
sobre entradas sinteticas y guardando su salida real:

```bash
npm run oraculo   # necesita el generar_epub.py de referencia al lado del repo
```

El motivo es que escribir las expectativas a mano seria adivinar justo lo que
hay que medir. Media docena de diferencias Python -> JavaScript son silenciosas
(`\w` y `\d` son Unicode en Python y ASCII en JS, la apostrofe se escapa como
`&#x27;` y no `&#39;`, `sin_acentos` descarta la categoria Mn entera y no solo
el bloque latino, `String.split(re, n)` no es `maxsplit`), y todas producen un
libro estructuralmente impecable con el contenido mal.

El JSON lleva el sha256 del `generar_epub.py` del que salio, para saber si el
oraculo se quedo viejo. El script de referencia NO vive en este repo: solo se
commitea su salida, para que el libro del autor nunca entre aqui.

## Los casos son discriminantes a proposito

Varios casos existen solo para distinguir el comportamiento correcto del
plausible. Por ejemplo `cafe_x_` con e acentuada y el guion bajo de cierre al
FINAL de la cadena: si el cierre lo sigue una letra ASCII (`cafe_x_fin`), el
`(?!\w)` corta el match en los dos lenguajes y el caso no distingue nada.
Lo descubrimos mutando el codigo a proposito: la primera version de estos
tests pasaba igual con `\w` ASCII, es decir, no servia.

Si anades un caso, comprueba que FALLA al romper a mano lo que pretende
proteger. Un test que nunca falla no protege nada.

## Que vigila cada archivo

| Archivo | Que comprueba |
|---|---|
| `frontera.test.ts` | Que `src/core/` no se contamine de navegador (sin DOM, sin async, sin Blob) y que el fuente no lleve separadores de linea invisibles |
| `texto.test.ts` | Paridad de las primitivas de texto, y las trampas Python -> JS una a una |
| `config.test.ts` | Paridad de `libro.txt`, incluidos los avisos al caracter |
| `parser.test.ts` | Paridad de bloques y tramos capitulo a capitulo, y donde se parte el capitulo |
| `estado.test.ts` | El reductor de la interfaz: Intro, Borrar, pegar, deshacer, foco, capitulos, extras e importar dentro de un libro. Es el oraculo de la interfaz, que no tiene Python contra el que compararse |
| `tramos.test.ts` | Partir, unir, pegar y poner cursiva o negrita en un rango de una linea |
| `versos.test.ts` | Las teclas de un bloque de versos: verso nuevo, estrofa nueva, salir, unir |
| `importacion.test.ts` | La pantalla de importar sin pantalla: cortar, no cortar, cabecera en dos lineas, el indice escrito a mano del principio, varios `.md` con sus imagenes |
| `importar-docx-navegador.test.ts` | El `.docx` por el camino de mammoth que usa el NAVEGADOR (otra clave de opciones y sin `Buffer`): los demas tests van por el de Node |
| `avisos.test.ts` | Los avisos agrupados (30 ilustraciones -> 4 renglones) y la revision antes de generar |
| `editor-dom.test.ts` | El puente `contenteditable` <-> tramos y el pegado desde Word y Google Docs |
| `almacen.test.ts` | IndexedDB, incluido que una pestaña atrasada no pise lo guardado por otra, y la version minima con la que se guarda cada libro |
| `medios.test.ts` | Audio y video en el EPUB de Apple Books y su ausencia en el de Kindle, sobre `fixtures/libro-medios` (lo mismo que CI pasa por EPUBCheck): `media-type`, poster, CSS, indice en orden de lectura, accesibilidad, y que un libro sin medios no cambie ni un byte |
| `medios-app.test.ts` | Los bloques `video` y `audio` del modelo: al dialecto y de vuelta, a la carpeta `medios/` del motor y a la copia `.zip` |
| `segmentos.test.ts` | El CRC-32, el zip en segmentos con un hueco por medio (rellenado, lo da por bueno `unzip -t`, que comprueba cada CRC) y que el EPUB armado con los medios como ficha es EXACTAMENTE el mismo que con sus bytes |
| `medios-conversion.test.ts` | Añadir audio o video: el plan de cada archivo (valido, convertible o imposible, y por que), el negro, el poster, la lectura real con Mediabunny de `fixtures/medios-sueltos`, el perro guardian del hilo con un Worker de mentira, y como lo dicen el reductor, la revision y los avisos |
| `medios-almacen.test.ts` | El almacen de medios en IndexedDB (y su subida de esquema), la copia `.zip` con `medios/` de ida y vuelta sin leer los videos, y el peso: aviso a 500 MB, bloqueo a 2 GB |

Las mutaciones de H5 (38, todas detectadas) se corrieron con un script fuera
del repo: cambia una linea, corre el test que la protege y comprueba que
falla. Si anades un caso, haz lo mismo a mano. Las de M1 (audio y video): 15,
todas detectadas. Las de M2 (segmentos, almacen, copia, peso): 21; una no se
detectaba porque protegia una regla que nunca se usaba, y se quito la regla.
Las de M3 (añadir audio y video): 22; una no se detectaba (un AAC 5.1 a la
frecuencia del libro) y se añadio su caso.

La CONVERSION de verdad no se puede probar aqui: necesita WebCodecs. Se probo
con un arnes desechable que corre los modulos reales en Safari 27.2 y Chromium
156, y se comprobo la salida con ffprobe y ffmpeg: ver plan.md, M3.

## El libro con medios

`fixtures/libro-medios` es un libro INVENTADO con un video, su poster y dos
audios; uno de los audios va solo tras una ilustracion, que es el caso en que a
Kindle le quedaria una pagina vacia. Los medios los genera
`scripts/medios-prueba.py` (`npm run medios`), que necesita ffmpeg solo para
regenerarlos: son diminutos y estan commiteados, y CI no lo necesita. A
diferencia de `libro-prueba`, no tiene golden del Python: el Python no conoce
el audio ni el video.

`scripts/epub-grande.ts` lo vuelve a construir con un video de 300 MB que
genera en un archivo temporal (y borra): el motor lo recibe como ficha, el
EPUB se escribe a disco por trozos, `unzip -t` lo comprueba y la memoria del
proceso no puede pasar de 250 MB. Va dentro de `npm run epubs`, asi que CI lo
pasa tambien por EPUBCheck.
