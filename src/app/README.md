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

