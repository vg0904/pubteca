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
| `impreso-fuente.test.ts` | Leer Source Serif 4: metricas, kerning de GPOS, ligaduras de GSUB (la mas larga primero), lo que falta, lo que permite su `fsType`, y que un `Buffer` de Node se copia |
| `impreso-guiones.test.ts` | La particion: una lista de palabras con su division de la RAE, y sus reglas sobre muchas palabras (nunca dos vocales separadas, nunca una letra sola) |
| `impreso-parrafo.test.ts` | Knuth-Plass y las reglas del parrafo, sobre cientos de parrafos inventados a medidas estrechas: nunca tres guiones seguidos, la ultima palabra entera, la raya pegada, nada dentro de una ligadura, recomponer sin un guion |
| `impreso-paginar.test.ts` | Las reglas de la pagina sobre un libro inventado de doce capitulos: capitulo en impar, viudas, huerfanas, impar sin guion al pie, el cambio de escena siempre con adorno en el borde, subtitulos, versos, ilustraciones, cabeceras y folios |
| `impreso-plan.test.ts` | El plan del libro impreso sobre el libro inventado con sus extras: el orden de la tradicion (anteportada, portada, creditos al dorso, extras en impar, el capitulo 1 en impar con el folio 1), la dedicatoria movida al final, el indice con los folios reales, el colofon en la ultima impar, el numero par de paginas, IngramSpark con la ultima en blanco, las laminas en gris u omitidas, el medianil de KDP segun el numero real de paginas (y la oscilacion), que nada impreso cae fuera de lo que pide el destino en todos los cortes, la medida, y que el PDF es el plan pagina a pagina |
| `impreso-app.test.ts` | El impreso en la app: del libro de la app al compositor por el camino del EPUB, las opciones en el reductor (deshacer, version 3), en IndexedDB y en la copia (con los ids nuevos de los extras), el motor del hilo, la cola que solo deja esperar al ultimo, el lienzo que pinta lo mismo que el PDF y las imagenes en gris |
| `cubierta.test.ts` | La cubierta: 6 × 9 in con 212 paginas en crema da 12,78 × 9,25 in y lomo de 13,5 mm; el lomo sale del interior compuesto; el EAN-13 da los mismos modulos que el codificador de ZXing; el ISBN (prefijo 978/979 y digito de control, el de 10 con su X y su 0); la zona de silencio de 11 y 7 modulos, sin nada encima, y ninguna cifra sobre una barra; el codigo suelto en SVG (milimetros, contornos, origen en su caja); ninguna pieza de ningun estilo invade la caja del codigo ni sale de los margenes de KDP en ningun corte (con textos largos y logos); la plantilla Papiro al milimetro; la tinta por contraste y el velo; y el PDF (cajas, texto girado, fondo en RGB, determinismo) |
| `cubierta-app.test.ts` | La cubierta en la app: lo que se le pasa al core, sus opciones en el reductor (deshacer, formato 4), en IndexedDB y en la copia, las imagenes del sello (que no entran en ningun EPUB), el pintor y lo que se mide de los dibujos; la muestra del codigo (solo en pantalla, en gris, con un control que ningun lector acepta), el codigo suelto, lo que se le dice al autor de su ISBN, y el pHYs de los PNG |
| `impreso-pdf.test.ts` | El PDF interior de `fixtures/libro-impreso`: su golden, dos generaciones con el mismo reloj byte a byte, nuestra lista de PDF/X-1a (y que la lista caza cada cosa que se rompe), que cada texto va donde lo puso el compositor y avanza lo mismo, la ToUnicode, los subconjuntos (sumas de control, glifos compuestos), el sangrado, las imagenes en gris y lo que la licencia de una fuente prohibe |

Las mutaciones de H5 (38, todas detectadas) se corrieron con un script fuera
del repo: cambia una linea, corre el test que la protege y comprueba que
falla. Si anades un caso, haz lo mismo a mano. Las de M1 (audio y video): 15,
todas detectadas. Las de M2 (segmentos, almacen, copia, peso): 21; una no se
detectaba porque protegia una regla que nunca se usaba, y se quito la regla.
Las de M3 (añadir audio y video): 22; una no se detectaba (un AAC 5.1 a la
frecuencia del libro) y se añadio su caso.
Las de M4 (el compositor del impreso): 40, todas detectadas al final. Cinco no
se detectaban a la primera: el cambio de escena en blanco se comprobaba en los
metadatos y no en lo pintado; recomponer no comprobaba el texto; y faltaban
subtitulos y versos largos cerca del corte de pagina. Otra dejo de detectarse
al cambiar el libro de prueba (el adorno partido entre dos paginas): dependia
de la suerte, y ahora un test pone el cambio de escena en cada renglon del pie.
Una se descarto por equivalente (una raya entre dos letras en español no
separa la raya de su palabra).
Las de M5 (el escritor de PDF y el subconjunto): 29, todas detectadas. Otra,
que no repetia la fuente tras un `BT`, se descarto por equivalente: el
`BT` no reinicia la fuente, y la imagen de por medio va entre `q` y `Q`.
Las de M7 (la cubierta): 40. Dos no se detectaban a la primera: un test sacaba
el margen del lomo de la misma constante que comprobaba (ahora va la cifra de
KDP escrita a mano), y nadie miraba cuanto deja el velo por encima del umbral
(ahora un dibujo gris liso lo mide).
Las de M6 (el plan del impreso y su interfaz): 64. Dos no se detectaban a la
primera porque faltaba el caso (el capitulo 1 en impar con los demas en la
pagina siguiente; IngramSpark con el libro acabando lleno en una par), y otra
protegia una cache que nunca se usaba: se quito la cache.

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

## El texto del impreso

Los tests del impreso no usan un libro: `impreso/ayuda.ts` inventa parrafos con
un generador con semilla y un vocabulario hecho para esto, asi que cada vuelta
compone exactamente lo mismo. Las fuentes son las del repo
(`public/fuentes/impreso/`).

## El libro impreso

`fixtures/libro-impreso` es un libro INVENTADO de tres capitulos cortos con
dialogos, un poema, un subtitulo, cambios de escena y una ilustracion, y cuatro
paginas extra (dedicatoria, epigrafe, una nota al principio y unos
agradecimientos al final). La
ilustracion no es un archivo: `scripts/impreso-prueba.ts` genera un degradado
en gris, que es lo que la app le dara al core. `npm run pdfs` escribe sus PDF
en `tmp/pdfs` y les pasa nuestra lista de PDF/X-1a; CI ademas los pasa por
`qpdf --check` y `pdffonts`.

Su golden (`golden/libro-impreso/interior.pdf.txt`) NO sale de un oraculo:
es nuestra propia salida, volcada objeto a objeto con los flujos
descomprimidos y sin lo que depende del compresor (los /Length y el /ID). Fija
el PDF para que nada lo cambie sin querer. Si un cambio lo cambia a
proposito, se regenera a mano y se mira el diff:

```bash
npx tsx scripts/impreso-prueba.ts --golden
```

El mismo comando reescribe el golden del PLAN (`golden/libro-impreso/plan.txt`):
el libro completo del caso de M6 (6 × 9, cuerpo 11, la dedicatoria al final,
con indice y colofon), una pagina por linea con su folio, lo que es y su primer
renglon, y los avisos. Se lee de un vistazo: es la forma de ver que un cambio
no movio ninguna pagina.

## El codigo de barras

Que el EAN-13 se LEE no lo puede decir este codigo: lo dice un lector. CI pinta
las cubiertas de prueba a 300 ppi (`pdftoppm`) y `zbarimg` tiene que leer en
ellas el ISBN del impreso; el codigo suelto lo pinta desde su SVG otro pintor
(`rsvg-convert`) y `zbarimg` lo lee tambien. Aqui, los modulos se comparan con los que escribe el
codificador de ZXing (Zint) para tres numeros, copiados en el test.

