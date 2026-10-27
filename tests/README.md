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
| `almacen.test.ts` | IndexedDB, incluido que una pestaña atrasada no pise lo guardado por otra |

Las mutaciones de H5 (38, todas detectadas) se corrieron con un script fuera
del repo: cambia una linea, corre el test que la protege y comprueba que
falla. Si anades un caso, haz lo mismo a mano.
