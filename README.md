# Pubteca

**Tu libro, listo para las tiendas.**

Convierte tus capitulos en dos EPUB listos para publicar: uno para **Kindle (KDP)**
y otro para **Apple Books**, y en el **PDF interior del libro impreso** para KDP,
IngramSpark o una imprenta. Corre entero en el navegador: tu manuscrito nunca
sale de tu equipo.

> En construccion. Ahora mismo se esta portando el motor de generacion.

## Por que

Publicar una novela ilustrada bien maquetada hoy significa pagarle a un
profesional o comprar una app de pago. El motor que hay detras de Pubteca ya
existe y funciona (`generar_epub.py`, EPUB con 0 errores y 0 advertencias en
EPUBCheck), pero se maneja desde la terminal y exige conocer convenciones de
texto a mano. Pubteca es ese mismo motor con una interfaz que cualquier
escritor pueda usar.

## Como esta hecho

Dos capas, y la frontera entre ellas es la decision mas importante del proyecto:

- **`src/core/`** — TypeScript puro y **sincrono**. Sin DOM, sin canvas, sin
  `File`. Recibe datos y devuelve un `Uint8Array` con el EPUB. Es el port
  literal del Python de referencia.
- **`src/app/`** — React, canvas, IndexedDB, File API, mammoth.

Esa separacion es lo que permite comparar la salida contra el Python
(*golden tests*), validar con EPUBCheck en CI sin navegador, y que el mismo
core pueda correr en Node como CLI.

Dependencias de produccion: seis. `react`, `react-dom`, `fflate` (empaqueta el
EPUB con el `mimetype` primero y sin comprimir, descomprime el chunk `iCCP` y
exporta el proyecto), `mammoth` (importar `.docx`, cargada a demanda), `idb`
(autoguardado) y `mediabunny` (leer y convertir audio y video con WebCodecs,
cargada a demanda: unos 108 kB comprimidos que solo descarga quien añade un
audio o un video). Cero WASM, cero router.

## Desarrollo

```bash
npm install
npm run dev
npm test
npm run build
```

`npm run epubs` y `npm run pdfs` generan en `tmp/` los EPUB y los PDF de los
libros de prueba, que CI pasa por EPUBCheck, qpdf y pdffonts.

Requiere Node >= 22.12. El navegador minimo es Safari 16.4.

## Licencias

El codigo, MIT (ver `LICENSE`). La fuente Libre Baskerville que se incluye
dentro de los EPUB de Apple Books va bajo la SIL Open Font License; su
`OFL.txt` viaja con ella. Mediabunny va bajo la Mozilla Public License 2.0, que
obliga a mantener su codigo fuente disponible tal cual: se usa sin modificar,
desde npm, y su licencia viaja con el paquete.

Para el libro impreso: seis letras de libro con la SIL Open Font License,
Source Serif 4, EB Garamond, Literata, Crimson Pro, Alegreya y Libre
Baskerville, cada una con su `OFL-<Familia>.txt` en `public/fuentes/impreso/`
(solo las descarga quien abre «Libro impreso» y elige esa letra); y los
patrones de particion de
hyph-utf8, el español de Javier Bezos (MIT) y el ingles de Gerard Kuiken
(licencia permisiva de una frase); los dos llevan su aviso dentro de
`src/core/impreso/patrones/`. Los genera `scripts/impreso-recursos.py` desde un
commit fijo y comprobado.

Pubteca no esta asociado ni respaldado por Amazon, Kindle Direct Publishing ni
Apple. Los nombres de esas tiendas se usan solo para describir a que formato va
dirigido cada archivo.
