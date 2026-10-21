# Pubteca — Plan del MVP

## Context

En `/Users/victorg04/Desktop/VG DATA/Generador EPUB` ya existe `generar_epub.py`: 1096 líneas de
Python (solo biblioteca estándar) que toman las carpetas de un proyecto de libro (`libro.txt`,
`capitulos/`, `ilustraciones/`, `portada/`, `extras/`, `fuentes/`) y producen dos EPUB 3 reflowable
— uno para Kindle/KDP y otro para Apple Books — que pasan EPUBCheck con 0 errores y 0 advertencias.
Funciona, está probado con un libro real y con libros de prueba con piezas faltantes.

El problema es la distribución, no el motor. Hoy el escritor tiene que hacer doble clic en un
`.command`, respetar nombres de carpeta exactos, escribir metadatos en un `libro.txt` de
`clave: valor` y conocer convenciones de texto a mano (`Capítulo 3: Título` en la primera línea,
`* * *` para un cambio de escena, `[ilustración: cap03-01 | descripción]` en su propia línea, `> `
para versos, archivos `capXX-YY.png`). Eso excluye justo al público al que sirve: autores que
quieren publicar sin pagarle a un maquetador ni comprar Vellum o Atticus.

**Pubteca** es ese mismo motor con interfaz gráfica, corriendo 100 % en el navegador, compartido
como un link y sin subir el manuscrito a ningún servidor — importante para una novela inédita.
Alcance de esta etapa: **paridad de funciones con el Python**. Las mejoras vienen después.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Nombre | **Pubteca** · repo `pubteca` · `vg0904.github.io/pubteca` |
| Metadatos | Los rellena el autor en la interfaz; `libro.txt` es solo el formato del `.zip` |
| Entrada de capítulos | `.docx`, `.md`/`.txt`, y pegar texto. **Sin** editor de escritura propio |
| Ubicación | Carpeta y repo nuevos. Esta carpeta sigue siendo el libro privado del autor |
| Imágenes | El MVP **solo avisa**. No redimensiona ni comprime (eso es post‑MVP) |
| Entorno | Node v26.12.0 + npm 11.20.0 ya instalados en `/opt/homebrew/bin` |
| Rutas | **Sin router.** El paso del asistente es estado, no URL |

## Arquitectura: la frontera que decide todo

Dos capas, y la frontera entre ellas es la decisión más importante del proyecto:

- **`src/core/` — TypeScript puro y síncrono.** Sin DOM, sin canvas, sin `File`, sin `async`.
  Recibe `{texto, bytes de imágenes como Uint8Array, metadatos}` y devuelve un `Uint8Array` con el
  EPUB. Es el port literal del Python.
- **`src/app/` — la capa de navegador.** React, canvas, IndexedDB, File API, mammoth.

Esa frontera es lo que hace posibles las tres cosas que el proyecto necesita: golden tests contra
la salida del Python, generar los libros de prueba en CI sin navegador (porque Java no está
instalado localmente), y que mañana el mismo core corra en Node como CLI.

El core debe ser **síncrono**: si se vuelve `async` por un inflate o un hash, los golden tests
dejan de ser deterministas y se contagia `await` a todo el pipeline.

### Dependencias de producción: cinco

| Paquete | Versión | Para qué |
|---|---|---|
| `react` + `react-dom` | 19.3.1 | Interfaz |
| `fflate` | 0.8.3 (MIT, ~12 kB gz) | Empaqueta el EPUB, descomprime el `iCCP` (`unzlibSync`), y exporta/importa el `.zip` del proyecto |
| `mammoth` | 1.13.0 (BSD‑2, ~90 kB gz) | Importar `.docx`. Con `import()` dinámico: solo pesa si el autor suelta un Word |
| `idb` | 8.0.4 (ISC, ~1.5 kB gz) | Autoguardado en IndexedDB |

Y nada más: canvas 2D nativo para el logo blanco, `DataView` puro para inspeccionar bytes, iframe
sandbox para la vista previa, `Blob` + `<a download>` para descargar. **Cero WASM, cero epub.js,
cero router.** Bundle inicial estimado ~70–90 kB gz.

Dev: `vite` 8.3.4, `typescript` 6.0.3 (lo que instala create-vite; mantener su default), `vitest` 5.0.5.

**`fflate` es la elección crítica, verificada en su código fuente:** con `{level: 0}` escribe
método de compresión 0 (STORE de verdad, no «deflate nivel 0»), y su escritor de cabeceras no añade
ningún extra field automático. Eso es exactamente lo que piden EPUBCheck PKG‑005 y PKG‑006.
`@zip.js/zip.js` queda descartado: su `extendedTimestamp` es `true` por defecto y escribiría el
extra field 0x5455 en el `mimetype`. Ojo con la otra API de fflate: `ZipDeflate` fija
`compression = 8` ignorando el `level`; para STORE en streaming hay que usar `ZipPassThrough`.

## Contrato de port

El port no es una reescritura: es una **copia literal** de reglas. Los nombres de clase CSS, los
ids, el orden de los atributos y hasta los saltos de línea están congelados, porque los golden
tests comparan los archivos completos. Módulos, con las líneas del Python que cubren:

| Módulo | Python |
|---|---|
| `core/mensajes.ts` | 42–54, 1075–1086 (diagnósticos inyectables, **no** globales de módulo) |
| `core/texto.ts` | 57–72, 320–367 (`esc`, `sin_acentos`, `nombre_seguro`, `orden_natural`, `en_linea`…) |
| `core/config.ts` | 79–115, 626–628 |
| `core/parser.ts` | 320–395 (las cuatro regex y los seis tipos de bloque) |
| `core/secuencia.ts` | 398–441 (dónde se parte el capítulo) |
| `core/plantillas.ts` · `core/css.ts` | 448–468 · 471–593 |
| `core/imagen-inspeccion.ts` · `core/imagen-validacion.ts` · `core/imagenes.ts` | 122–186 · 189–223 · 226–280 |
| `core/fuentes.ts` | 287–313 |
| `core/libro.ts` | 600–822 (nombres de archivo, ids, `epub:type`) |
| `core/identificador.ts` · `core/opf.ts` · `core/nav.ts` · `core/ncx.ts` | 839–844 · 846–934 · 825–837 · 936–954 |
| `core/zip.ts` · `core/construir.ts` · `core/reporte.ts` | 1008–1038 · 958–1005 · 1045–1091 |
| `core/proyecto.ts` | **nuevo**: sistema de archivos virtual que reemplaza `pathlib` |

### Las trampas que hay que resolver antes de escribir código

De 39 riesgos de fidelidad identificados, estos son los que rompen el libro en silencio:

1. **`\w` es Unicode en Python y ASCII en JS.** En `_cursiva_` y `__negrita__`, `camiñó_x_fin` no
   se italiza en Python pero sí en JS. Usar `[\p{L}\p{N}_]` con flag `u`. Es la divergencia más
   silenciosa de todo el port.
2. **`\d` es Unicode en Python y ASCII en JS.** Afecta a `orden_natural`, `anio()` y `color-NN`.
   Usar `/(\p{Nd}+)/u` y normalizar dígitos no ASCII al importar.
3. **`html.escape(quote=True)` emite `&#x27;`, no `&#39;`.** Frecuentísimo en español
   (`D'Artagnan`). Dos funciones separadas: `esc` (fuerte) y `escInline` (solo `& < >`, usada
   dentro de `en_linea`).
4. **`sin_acentos` descarta la categoría Mn completa**, no el bloque de diacríticos latinos:
   `s.normalize("NFD").replace(/\p{Mn}/gu, "")`. Y `nombre_seguro` hace `.strip("-")`, no `trim()`,
   con fallback literal `"archivo"`.
5. **UUID v5 determinista.** Si cambia, el libro cambia de identidad para las tiendas. Namespace
   URL `6ba7b811-…` (no DNS `6ba7b810-…`), semilla `"generador-epub:" + titulo + "|" + autor`.
   `crypto.subtle` es asíncrono → SHA‑1 en JS puro y síncrono (~60 líneas), con vectores de prueba
   contra la salida de Python. **Este es el primer test del proyecto.**
6. **`new Date().toISOString()` lleva milisegundos** y EPUBCheck rechaza ese formato para
   `dcterms:modified`. Y el año de derechos es local, no UTC.
7. **`String.split(regex, limit)` no es `maxsplit`**: trunca el array en vez de limitar las
   divisiones, y se perdería el título entero. Hace falta un `splitOnce` propio.
8. **El centinela `\x00N\x00` de `en_linea`**: mantener el orden exacto (escapar → guardar
   escapes → 5 regex de énfasis → restaurar) y restaurar con una función, no con un string de
   reemplazo (un `$` del contenido se leería como referencia de grupo).
9. **La inspección de bytes va antes del canvas, siempre.** En cuanto una imagen pasa por `<img>`
   o `createImageBitmap`, el navegador ya convirtió a RGB y se pierden el perfil ICC y el CMYK.
   Basta `File.slice(0, 256*1024)` para leer cabeceras, así la validación es instantánea.
10. **El `iCCP` es zlib, no deflate crudo**: `unzlibSync`, no `inflateSync`, y saltando el byte de
    método. Equivocarse hace desaparecer en silencio el aviso de Display P3 — justo uno de los
    problemas reales del autor con Procreate.
11. **`DataView` lanza `RangeError` donde Python tolera rebanadas fuera de rango.** Validar
    `i + 8 + largo <= len` y envolver la inspección en try/catch.

### Bugs del Python: qué se replica y qué se corrige

Se encontraron bugs reales. Política explícita, porque afecta a los golden tests:

**Se replican** (son tipografía o decisiones defendibles, no fallos): el flag `primero` no se
reinicia tras partir el capítulo por una ilustración (el texto continúa el mismo hilo, es
correcto); `div.continuacion` sin regla CSS (gancho para el futuro); el desenvolvido codicioso de
`limpiar_titulo`.

**Se corrigen**, con divergencia documentada y test propio:

- `Cap. 3: El bosque` produce hoy el título `3: El bosque` (el `re.split` parte en el punto de
  «Cap.»). Reutilizar los índices del match de `RE_TITULO` en vez de volver a partir.
- La misma imagen en dos papeles rompe la versión Kindle: el registro queda `solo_apple` y la
  página que la referencia sí va a Kindle → recurso ausente del manifest. En la GUI será **más**
  fácil caer en esto. Verificar al empaquetar que todo `<img src>` de las páginas incluidas está
  en el manifest de esa tienda.
- `usadas_claves` compara por *stem* cruzando carpetas, así que un `ilustraciones/logo.png` sin
  marcar no genera el aviso de imagen huérfana. Comparar por ruta relativa.
- Sin capítulos válidos se genera un EPUB inválido. Debe bloquear.
- `inicio_lectura` puede apuntar a una página de ilustración: «Comenzar a leer» abre la lámina.
- `n_ilus` es código muerto en `seccion_con_titulo` (se devuelve `k`); borrarlo sin cambiar el
  conteo del reporte.
- **Escapar un marcador de bloque no lo desactiva** (encontrado en H1, y el más visible para el
  autor). La detección se hace sobre la línea desescapada, así que el marcador se reconoce
  igual, pero el contenido sale de la línea original, así que encima queda basura impresa:
  `\> cita` es un verso con una barra invertida visible, `\# algo` un subtítulo con una
  almohadilla visible, y `\[ilustración: x | y\]` inserta la ilustración. Dentro de un
  párrafo el escape sí funciona: son las marcas de **bloque** las que no. La GUI lo vuelve
  irrelevante (no hay marcadores que escapar), pero la vía de importar `.md`/`.txt` lo pisa.
  La corrección: desescapar DESPUÉS de clasificar la línea, no antes.
- **Un PNG truncado cuelga al generador** (encontrado en H2). `struct.unpack(">IIBB", b[16:26])`
  no comprueba el límite, así que un archivo copiado a medias lanza `struct.error` sin capturar
  y el proceso aborta con un traceback: el autor no recibe un libro, recibe un error de Python.
  Verificado contra el script. **Ya corregido** en el port, con un test que recorre todos los
  prefijos de un PNG y de un JPEG válidos.
- **La misma imagen en dos papeles rompe la versión Kindle** — ya estaba en la lista, y en H2 se
  añadió la red: al empaquetar se verifica que ninguna página incluida referencie un recurso
  ausente del paquete de su tienda.

Y la propia GUI vuelve **imposibles** tres errores enteros del reporte actual, porque las imágenes
se referencian por id de Blob y no por un nombre escrito a mano: marca que pide un archivo
inexistente, imagen huérfana en `ilustraciones/`, y nombre de archivo mal formado.

## Flujo de la interfaz

Asistente de un solo documento, en español, sin router. Entrada directa a un capítulo vacío con el
cursor puesto: **los metadatos se piden al descargar, no al empezar** (pedirlos antes de que el
escritor vea una palabra en pantalla es el abandono más común en herramientas de autoría).

1. **Inicio** — «Libro nuevo» / «Continuar: *Título*» / «Abrir copia (.zip)», y una línea: «Tu
   libro se queda en este navegador». Varios proyectos desde el MVP.
2. **Importar — el caso principal es UN SOLO `.docx`.** Los escritores hacen el libro entero en
   un documento único; subir un archivo por capítulo es la excepción, no la regla. Así que la
   pantalla se diseña alrededor de un documento que la app propone cortar, y aceptar varios
   archivos es una comodidad secundaria. **Nada se aplica sin confirmar**: pantalla con recuentos (18
   capítulos · 1.240 párrafos · 86 cursivas · 3 elementos descartados), el primer capítulo
   renderizado al lado y «No es esto, descartar». Una importación que destroza el manuscrito en
   silencio es el otro gran motivo de abandono.
3. **Editor de bloques tipados**, no rich‑text. Seis bloques — párrafo, subtítulo, cambio de
   escena, versos, ilustración, cabecera — que son exactamente lo que el motor sabe representar,
   más cursiva y negrita con Cmd+B/Cmd+I. El escritor nunca ve un asterisco. Un TipTap permitiría
   tablas, h3, enlaces y colores que el generador tiraría en silencio: vería una cosa en la app y
   otra en su Kindle, que es el fallo más caro de esta herramienta. El texto se guarda como AST de
   bloques en JSON; el Markdown es solo formato de salida.
4. **Ilustraciones** — barra de inserción con «+» entre bloques (visible con el foco, no solo al
   pasar el ratón, porque en iPad y con teclado no existiría), o arrastrar la imagen al hueco. La
   tarjeta lleva miniatura, el campo «¿Qué se ve en el dibujo?» y una línea discontinua rotulada
   «La ilustración ocupa su propia página». Arrastrarla sobre la cabecera = abrir el capítulo con
   un dibujo. El corte en varios XHTML nunca se nombra: se enseña.
5. **Portada, contraportada y logo** — con la frase que más rechazos evita: «Esta portada va dentro
   del EPUB de Apple Books. En KDP la portada se sube aparte, y ese campo solo acepta JPG o TIFF».
   El logo se sube en negro y la app genera la versión de modo oscuro con canvas.
6. **Revisión** — tres niveles con icono *y* palabra (nunca solo color). Casi nada bloquea: solo
   «no hay texto», «no hay título» y «esta imagen no se puede decodificar». Transparencia, P3,
   CMYK y tamaños avisan pero dejan generar, igual que hoy. Los avisos se **agrupan por tipo**:
   30 ilustraciones de Procreate producen hoy ~40 líneas de reporte, y esa pared es la principal
   causa de abandono; agrupadas son tres renglones. Cada renglón dice la consecuencia para el
   lector y tiene un botón «Ir» a la tarjeta culpable.
7. **Vista previa** — iframe sandbox con el XHTML y el CSS **reales**, con selector de tienda
   (la portadilla y la fuente cambian) y tema claro/sepia/oscuro. No hace falta epub.js (y está
   abandonado desde 2022): la app genera el XHTML, así que la previsualización fiel es ese mismo
   XHTML. Dos cuidados: `srcdoc` no resuelve rutas relativas (reescribir `src` a Blob URLs **solo
   en la copia de previsualización**) y los temas viven en un `preview.css` aparte que **nunca**
   entra al EPUB.
8. **Descargar** — dos botones nombrados por destino, no por formato: «EPUB para Kindle (KDP) —
   7,4 MB · tarifa ≈ $1,11 por venta» y «EPUB para Apple Books». Generar primero con barra de
   progreso y disparar el `click` en un clic posterior: Safari descarta descargas que perdieron la
   activación del usuario, y la File System Access API no existe en iPad.
9. **Copia de seguridad** — «Guardar copia (.zip)» siempre visible, nunca en un menú. El `.zip`
   reproduce la estructura de carpetas del Python **más** un `proyecto.json` canónico: es respaldo,
   es formato abierto y es puente de ida y vuelta con `generar_epub.py`.

**Nota de producto sobre el identificador:** el `urn:uuid:` del libro se deriva de
`título|autor`, así que la app necesita esos dos campos **antes** de que el autor publique (el
flujo ya los pide al descargar, con el título obligatorio) y debe avisar si cambian después de
haber publicado: para las tiendas sería otro libro distinto.

**El riesgo de producto, no técnico:** WebKit expulsa el almacenamiento de un origen tras un
periodo sin visitas. Un escritor que deje su novela solo en IndexedDB puede perderla. Por eso
`navigator.storage.persist()` al crear el proyecto, «Copia de seguridad: hace N días» siempre
visible y en ámbar a los 7 días, y decirlo con honestidad en la interfaz.

## Hitos

**H0 · Entorno y publicación. ✅ HECHO** — repo <https://github.com/vg0904/pubteca>, sitio en
<https://vg0904.github.io/pubteca/>, CI verde en 34 s con typecheck + tests + build + despliegue.
Más `tests/frontera.test.ts`: 13 patrones prohibidos que vigilan que el core no se contamine de
navegador (comprobado que falla de verdad al meterle un módulo con `document` y `await`).

**H0, lo planeado:** Carpeta nueva `~/Desktop/VG DATA/pubteca`, `git init`, repo público
`pubteca` con `gh`, scaffold Vite+React+TS+Vitest, `base: '/pubteca/'` en `vite.config.ts`,
`public/.nojekyll`, workflow de Pages (`configure-pages` + `upload-pages-artifact` +
`deploy-pages`), licencia MIT y `OFL.txt` de la fuente.
*Terminado cuando:* una página con el nombre carga en `vg0904.github.io/pubteca`.
(Si se olvida el `base`, el sitio despliega «con éxito» y queda en blanco con 404 en todos los
assets, sin ningún mensaje útil. Es el fallo número uno de Vite + Pages.)

**H1 · Core, parte de texto. ✅ HECHO** — 412 tests, typecheck limpio, CI verde.
El oráculo (`tests/casos-texto.json`, 249 casos) sale de ejecutar el Python, no de
expectativas escritas a mano. **Diez mutaciones deliberadas** en los cinco módulos fallan entre
1 y 17 tests cada una — la primera versión de los tests pasaba igual con `\w` ASCII, así que
no servía; se arreglaron los casos, no el código. `strict` y `noUncheckedIndexedAccess`
activados (el andamio de Vite no los traía). Guardián nuevo contra U+2028/U+2029 en el fuente.

**H1, lo planeado:** `mensajes`, `texto`, `config`, `parser`, `secuencia`.
*Terminado cuando:* hay un test unitario por cada una de las 11 trampas de arriba, incluido
`camiñó_x_fin`, `a&b<c>"d'e` y el orden natural de `['01.md','cap01.md','cap1.md','cap10.md']`.

**H2 · Core, parte de empaquetado. ✅ HECHO** — 785 tests. Los **48 archivos de texto** de los
dos EPUB salen idénticos byte a byte a los del Python, y el reporte coincide hasta los anchos de
campo. 25 mutaciones deliberadas, todas detectadas.

**H2, lo planeado:** `plantillas`, `css`, `imagen-*`, `fuentes`, `libro`,
`identificador`, `opf`, `nav`, `ncx`, `zip`, `construir`, `reporte`, `proyecto`. Más
`scripts/generar.ts` para invocar el core desde Node.
*Terminado cuando:* `npx tsx scripts/generar.ts tests/fixtures/libro-prueba` escribe los dos EPUB,
y pasan el test de UUID contra los vectores de Python y el test de bytes del ZIP (bytes 0‑3 =
`PK\x03\x04`, método en offset 8 = 0, extra field en offset 28 = 0, nombre = `mimetype`).

**H3 · Golden tests y EPUBCheck en CI. ✅ HECHO en lo esencial** — CI verde con
**0 fatals / 0 errors / 0 warnings / 0 infos** en los dos EPUB, con EPUBCheck **5.3.0 y 5.4.0**.
Falta ampliar el fixture a los nueve casos (ahora hay uno, el libro completo).

**H3, lo planeado:** Libro de prueba **inventado** en `tests/fixtures/`
(nunca uno real) que ejercite todas las convenciones, con imágenes sintéticas pequeñas generadas
por script. Nueve casos, incluidos los que ya destaparon bugs reales: completo, **sin portada**,
sin logo, sin contraportada, sin ilustraciones, hueco en la numeración, prólogo/interludio/epílogo,
imágenes con alfa + CMYK + P3, y títulos con acentos.
*Terminado cuando:* CI verde. `actions/setup-java` + jar oficial fijado (matriz **5.3.0 y 5.4.0**),
`--failonwarnings`, **sin** el flag `-u` (los mensajes `USAGE` incluyen `OBS_001` por el `toc.ncx`,
que se produce a propósito por compatibilidad), fallos acumulados en vez de abortar en el primero,
e informes JSON subidos como artefacto — porque sin Java local, el informe de CI es la única forma
de ver qué dijo EPUBCheck.

**H4 · Capa de navegador. ✅ HECHO** — 919 tests. Modelo del proyecto como AST de bloques,
serializador sin pérdidas (demostrado con 600 modelos generados), almacén en IndexedDB, los tres
importadores y el puente al motor. **Cadena completa probada de punta a punta: un `.docx` de Word
entra y salen dos EPUB válidos con las ilustraciones en su sitio.** 37 mutaciones, todas
detectadas.

**Cambio de diseño pedido por el autor, y es mejor:** el importador de Word **propone, no
decide**. Devuelve el documento como lista plana de bloques más cortes *sugeridos* con su motivo,
y el autor ajusta dónde empieza cada capítulo y dónde va cada ilustración antes de aplicar nada.
Lo que queda antes del primer corte se devuelve como huérfano en vez de meterlo a la fuerza.

**H4, lo planeado:** Modelo de proyecto, IndexedDB con `idb`, y los tres importadores.
Mammoth con `convertImage` desde el primer día: por defecto mete cada imagen como base64 en el
HTML, lo que con un libro ilustrado es un string de decenas de MB y, en Safari, una pestaña muerta.
Y su salida no se sanea: recorrerla con `DOMParser`, nunca `dangerouslySetInnerHTML`.
*Terminado cuando:* se importa un `.docx` con el libro entero, se ajustan los cortes y todo se recupera intacto tras recargar la página.

### Lo primero que tiene que resolver la pantalla de importar

Con un documento único, **acertar dónde empieza cada capítulo es el juego entero**. Medido contra
un manuscrito realista de cinco capítulos (`tests/fixtures/docx/manuscrito-realista.docx`), la
detección actual acierta **3 de 5**, y hay dos huecos con nombre y apellido:

1. **Mammoth descarta los saltos de página.** No queda ni rastro en su HTML, y el salto de
   página es como la mayoría de los escritores separan capítulos en un documento único: la señal
   más fuerte del caso real es hoy invisible. **Es recuperable:** `fflate` ya es dependencia, así
   que se puede descomprimir el `.docx` y buscar `<w:br w:type="page"/>` en `word/document.xml`
   para saber entre qué párrafos estaba. Esto es lo primero que hay que hacer de H5.
2. **La etiqueta no se separa sin un separador.** `CAPÍTULO UNO` en su propia línea detecta el
   corte pero deja `etiqueta=""` y se lleva todo al título, porque `partirCabecera` solo parte
   cuando hay un `:`, un `.` o un guion detrás. En un manuscrito único esa es la forma común.

Y lo que **no** se puede detectar por patrón: un capítulo marcado solo con un número (`4`), o con
un título sin la palabra «capítulo». Por eso **«Cortar aquí» no puede estar escondido**: la
detección siempre va a fallar en algunos, y lo que salva el caso real no es acertar siempre sino
que corregirlo cueste un clic. Hay tests que registran estos límites; cuando la detección mejore,
fallarán, y eso es lo que se busca.

**H5 · Interfaz.** Asistente, editor de bloques, ilustraciones, portada/logo, extras, reordenar.
Toda acción de arrastrar duplicada en un menú.
*Terminado cuando:* un libro completo se arma sin tocar un archivo ni escribir una convención.

**H6 · Revisión, vista previa y descarga.**
*Terminado cuando:* el EPUB descargado desde el navegador es equivalente al del script para el
mismo libro de prueba.

**H7 · Copia `.zip` del proyecto**, ida y vuelta, compatible con `generar_epub.py`.

**H8 · Pulido.** Logo y favicon, `LEEME.md`, y la nota de requisito mínimo (Safari 16.4+).

El orden es deliberado: **el core y su red de seguridad antes de la interfaz.** Un atributo de más
en el OPF no falla en la app, falla en la tienda, semanas después.

## Verificación

0. **El oráculo sale del propio Python, no de expectativas escritas a mano.**
   `scripts/exportar-casos-texto.py` recorre `esc`, `sin_acentos`, `nombre_seguro`,
   `orden_natural`, `en_linea`, `texto_plano` y `limpiar_titulo` con ≥ 80 entradas elegidas
   (incluidas las trampas de abajo) y escribe `tests/casos-texto.json` con el par
   entrada→salida real. El test de TS lo consume. Escribir las expectativas a mano sería
   adivinar justo lo que hay que medir.
1. **Unitarios** (`vitest`, sin navegador): las 11 trampas de fidelidad, una por una.
   **Regla, aprendida a golpes en H1:** cada caso nuevo tiene que FALLAR al romper a mano lo que
   pretende proteger. Los primeros tests de `enLinea` pasaban igual con `\w` ASCII (el `(?!\w)`
   de cierre cortaba el match en los dos lenguajes), así que no protegían nada. Un test que
   nunca falla es peor que no tenerlo, porque da confianza falsa.
2. **Golden tests contra el Python.** Correr `python3 generar_epub.py` una vez sobre el libro de
   prueba desde esta carpeta, y commitear en `pubteca/tests/golden/` el `content.opf`, `toc.ncx`,
   `nav.xhtml`, `estilo.css` y los `.xhtml` como referencia (solo la salida, no el script).
   Dos conjuntos: `paridad/`, que debe coincidir carácter a carácter, y `divergencias/`, con la
   salida esperada de los seis bugs corregidos.
   **El contrato no es un hash del `.epub`** — eso es inalcanzable, porque pako y zlib producen
   flujos deflate distintos para el mismo contenido. Es: la lista y el orden de las entradas; el
   `mimetype` como entrada 0, STORED, 20 bytes; el contenido **descomprimido** byte a byte de cada
   entrada de texto; y el SHA‑256 de cada entrada binaria (las imágenes y fuentes deben viajar sin
   recodificar). Reloj fijo inyectado para neutralizar `dcterms:modified` y la fecha DOS del ZIP.
3. **EPUBCheck en CI** sobre los nueve casos × dos tiendas × dos versiones, con
   `--failonwarnings`. Es lo que convierte «0 warnings» de aspiración en garantía mecánica.
4. **Un test que afirme que el CSS empaquetado no contiene `background` ni `color:`**, para que los
   temas de la vista previa no se filtren nunca al libro. Y otro que preserve el `text-align`
   explícito en cada elemento centrado: Apple Books no heredó el centrado del `div` al `h1` y la
   portadilla salió descentrada; un refactor «limpio» reintroduce el bug, y Chrome **no** lo
   muestra porque Chrome sí hereda.
4b. **Dos trampas que solo aparecieron al ejecutar, no al leer el código:**
   · `format(x, ".1f")` de Python redondea **al par** y `toFixed` hacia arriba. Sobre 9012 valores
   plausibles solo hay dos diferencias, pero son alcanzables: una ilustración de exactamente
   1.250.000 bytes da «pesa 1.2 MB» en Python y «1.3 MB» con `toFixed`. Resuelto con aritmética
   exacta en BigInt (`src/core/numero.ts`), verificado en 487 valores a cuatro precisiones.
   · El reporte imprime la hora **local** mientras `dcterms:modified` va en **UTC**. El golden
   dependía de la zona horaria de quien lo generó: pasaba en la máquina del autor (UTC−6) y
   fallaba en CI (UTC). Golden regenerado en UTC y `TZ=UTC` fijado en los tests. **Lo encontró
   CI, no el desarrollo local**, que es exactamente para lo que está.

5. **Puerta de salida del motor: el libro real. ✅ PASADA.** Con el libro real del autor (14
   capítulos, 93 líneas de verso, portada en `.jpeg`): **48 archivos de texto idénticos** y 8
   binarios con el mismo sha256. La única diferencia en toda la salida es una línea del reporte,
   el tamaño del EPUB de Apple (0,77 contra 0,78 MB), que es zlib contra fflate comprimiendo lo
   mismo. Se corrió sobre una copia en el scratchpad: no se escribió nada en la carpeta del autor.

5b. **Lo planeado para esa puerta:** Antes de dar el core por bueno,
   `npm run generar -- "/Users/victorg04/Desktop/VG DATA/Generador EPUB"` contra el libro de
   verdad del autor, y comparar las entradas de texto con las de `salida/*.epub`. Es la prueba
   más dura que existe y es gratis. Nunca se commitea: el libro se queda donde está.
6. **EPUBCheck también en local**, no solo en CI: `brew install --cask temurin` da Java y
   permite correr `java -jar epubcheck.jar` sin esperar al pipeline. Quita la única razón por la
   que la validación dependía de GitHub.
7. **Manual, antes de publicar:** Kindle Previewer 3, Libros en Mac y iPad, y una prueba de carga
   con un libro de 60 ilustraciones en un iPad real (30 imágenes de 4 MB pueden matar la pestaña
   sin mensaje).

## Fuera del MVP

Procesado automático de imágenes (redimensionar, sRGB, aplanar alfa, cuantización PNG con
`@squoosh-kit/imagequant`) — es lo que más avisos apagaría y lo que más dinero ahorra en tarifa de
entrega, así que es el primer candidato para la siguiente ronda. Vista previa con marcos de
dispositivo y modo desaturado para e‑ink. Descarga de la portada lista para KDP. Elegir entre
varias fuentes OFL. Segundo idioma real con i18next (en el MVP, diccionario TS plano, pero con los
textos de la **interfaz** y los del **libro** separados desde el día uno: traducir la interfaz sin
separarlos produciría libros en inglés que dicen «CAPÍTULO»).

Nota para después: GitHub Pages no permite cabeceras HTTP, así que no hay COOP/COEP, así que no hay
`SharedArrayBuffer`, así que el WASM multihilo no funciona. De `oxipng` solo servirá la variante no
paralela. Cualquier plan de imágenes que asuma hilos exige mudarse a Cloudflare Pages o Netlify.

## Riesgo mayor

Que el port se desvíe del Python sin que nadie lo note. No se mitiga con cuidado, se mitiga con los
hitos H2 y H3 **antes** de la interfaz: golden tests y EPUBCheck en CI. Es la razón de que el plan
construya el motor primero aunque durante unos días no haya nada que mirar en pantalla.
