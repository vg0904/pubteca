# app

La capa de navegador: React, canvas, IndexedDB, File API, mammoth.

Nada de aqui puede importarse desde `src/core/`. La flecha va siempre
`app -> core`, nunca al reves.

## Como esta organizada

- **Logica pura, sin React y sin navegador** (se prueba en node): `estado.ts`
  (el reductor de toda la interfaz, con deshacer y el foco), `tramos.ts`,
  `versos.ts`, `importacion.ts` (la pantalla de importar), `avisos.ts`,
  `revision.ts`, `imagen-ajuste.ts` (el encuadre y el tamano de una imagen),
  `entrega.ts` (que imagenes recibe cada tienda), `formato.ts` (la mecanica de
  los numeros, sin el idioma), mas lo de H4 (`modelo`, `serializar`,
  `exportar`, `html`). Si una decision de la interfaz se puede tomar aqui, se
  toma aqui.
- **Navegador**: `editor-dom.ts` (contenteditable <-> tramos), `pegar.ts`,
  `subir.ts` (bytes ANTES que canvas), `imagen-canvas.ts` (recortar,
  redimensionar y recodificar), `repositorio.ts` (los Blob de las imagenes),
  `generar.ts`, `copia.ts`, `almacen.ts`.
- **Componentes** en `ui/`. Solo pintan el estado y despachan acciones. El
  editor de texto (`ui/TextoEditable.tsx`) no deja que React gestione sus
  hijos: mientras el autor escribe, el DOM manda.

## Los dos idiomas

Los textos de la interfaz estan en `src/i18n/` y llegan a los componentes por
contexto (`useTextos()`), NUNCA por un `import` directo a `i18n/es`: un modulo
importado se resuelve una vez y no habria forma de cambiar de idioma sin
recargar. Por el mismo motivo nada lee `ui` en el cuerpo de un modulo — un
`const X = ui.algo` arriba del archivo se congelaria en el idioma inicial. Lo
vigila `tests/i18n.test.ts`, que ademas comprueba que `en.ts` tenga todas las
claves de `es.ts` y que no se haya quedado ni una frase en español.

El idioma de la interfaz NO es el idioma del libro: ese se elige en «Descargar
EPUB», vive en `datos.idioma` y decide los textos que van DENTRO del EPUB
(`core/textos-libro.ts`).

## Las imagenes: dos decisiones distintas

- **De autor, imagen por imagen** (`imagen-ajuste.ts` + `ui/AjustarImagen.tsx`):
  que trozo del dibujo se ve y a que resolucion sale. Es creativo, asi que se
  decide en cada imagen. El cuadro codifica la imagen de verdad para decir lo
  que va a pesar; una tabla de bytes/pixel se equivoca por mucho con un dibujo
  concreto.
- **De entrega, para todas a la vez** (`entrega.ts` + la pantalla de descarga):
  si a Kindle se le manda una version mas ligera. Es la misma decision para las
  treinta ilustraciones del libro, asi que pedirla una por una serian treinta
  veces el mismo gesto. Ahi el peso se estima midiendo una muestra.

## Añadir audio o video

`medios/` en cuatro piezas, de lo que se decide a lo que se hace:

- `clasificar.ts` (puro, se prueba en Node): que es el archivo y que hay que
  hacerle para que quede como lo pide Apple. `valido`, `convertible` o
  `imposible`, con cada paso y su motivo. Es lo que el autor ve y confirma
  ANTES de que se toque nada.
- `inspeccionar.ts`: lee el archivo con Mediabunny (cabeceras e indice, sin
  decodificar) y pregunta al navegador que puede hacer. Y aparte, decodificando,
  si el primer y el ultimo fotograma son negros.
- `convertir.ts` + `conversion.worker.ts`: la conversion, en su hilo. El negro
  se pone como fotograma I420 hecho a mano, sin lienzo: con un lienzo, Safari se
  colgaba con los videos verticales. La salida va a OPFS, no a memoria.
- `hilo.ts`: el perro guardian, en la pagina. Si el hilo pasa 30 s sin dar
  señales, se mata y se dice por que.

Mediabunny se carga con `import('./mb')`, nunca del paquete entero: asi el
empaquetador deja fuera los formatos que no se usan.

## El audio y el video no pasan por memoria

Un video del iPhone son cientos de MB, y en un iPad eso mata la pestaña. Por eso
ni el motor ni la pagina tienen nunca un video entero:

- `repositorio.ts` lo guarda en IndexedDB y se queda con el Blob que devuelve,
  que vive en disco. Su CRC-32 se saca una vez, leyendolo por trozos.
- `exportar.ts` se lo pasa al motor como FICHA (tamaño y CRC). El motor escribe
  el EPUB en segmentos, con un hueco donde va cada medio (`core/zip.ts`).
- `generar.ts` arma el archivo con `new Blob([trozo, video, trozo...])`, que no
  copia: el navegador apunta a los Blob del almacen.
- La copia `.zip` va igual, y al abrirla `leerZip` (abrir-copia.ts) lee el
  directorio central y CORTA el archivo donde esta cada medio, sin leerlo.

Para que las dos tiendas lleven imagenes distintas, el motor se corre DOS veces
(`generar.ts`), cada una con los bytes de una, y de cada vuelta se guarda un
libro. El core no se entera: sigue construyendo los dos EPUB de un solo
proyecto, con sus golden tests intactos.


## El libro impreso

`ui/Impreso.tsx` se carga con `import()` al entrar en «Libro impreso», y
`impreso/` hace el resto:

- `preparar.ts` (puro, se prueba en Node): del libro de la app a lo que lee
  el compositor, por el MISMO `exportar()` que los EPUB. Para componer bastan
  las medidas de las imagenes, asi que se exporta con bytes vacios. El orden de
  las paginas extra se guarda por ids de la app y llega al core por el nombre
  de su archivo.
- `motor.ts` + `impreso.worker.ts`: componer y escribir el PDF, en su hilo.
  El PDF sale de la ULTIMA composicion, la que el autor esta viendo.
- `hilo.ts`: la cola. Mientras se compone, de lo que llega solo espera el
  ultimo (arrastrar un deslizador no encola veinte libros). Sin Worker, el
  motor corre en la pagina.
- `fuentes.ts` trae las letras de `public/fuentes/impreso/` la primera vez.
- `lienzo.ts` pinta una pagina con los contornos de los glifos que da el core:
  las mismas operaciones que el PDF. La miniatura entera va en gris por CSS.
- `grises.ts`: cada imagen, en gris, aplanada sobre blanco y a 300 ppi del
  tamaño al que se imprime (sin ampliar nunca).
- `avisos.ts` agrupa los avisos por clase, con su nivel. Nada bloquea.

Las opciones viven en `Proyecto.impreso`, opcional: un libro que nunca las
toco se guarda igual que antes, y uno que si, como formato 3 (ver
`VERSION_PROYECTO`).
