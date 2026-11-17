# Tu libro, para la web

Esta carpeta es un libro listo para leerse en un sitio web, en cualquier
navegador y en cualquier pantalla. La generó Pubteca.

Este archivo está escrito para quien vaya a publicarlo: tú, la persona que
lleva tu sitio, o una IA a la que le pases la carpeta.

## Qué hay aquí

```
index.html          el libro, listo para abrirse
lector.js           el lector: el elemento <pubteca-lector> (un archivo, sin dependencias)
LEEME.md            este archivo
libro/
  libro.json        el manifiesto: datos del libro, sus partes en orden, cómo se abre y los textos del lector
  libro.css         la hoja de estilo del libro
  cap01.html …      una página por parte (capítulos, dedicatoria, derechos…)
  imagenes/         la portada y las ilustraciones
  letras/           las letras del libro (WOFF) y sus licencias
```

No hay nada que compilar ni que instalar. Son archivos estáticos.

## Tres formas de publicarlo

### 1. Tal cual

Sube la carpeta entera a cualquier hosting de archivos estáticos (Netlify,
GitHub Pages, Cloudflare Pages, Vercel, el FTP de tu dominio…). El libro queda
en la dirección de `index.html`.

### 2. Dentro de un sitio hecho con un editor (WordPress, Wix, Squarespace…)

Publica la carpeta como en el punto 1 y, en la página donde quieras el libro,
incrústalo con un bloque de HTML:

```html
<iframe src="https://tu-dominio.com/mi-libro/" title="Título del libro"
        style="width: 100%; height: 90vh; border: 0;"></iframe>
```

### 3. Integrado en el código de un sitio

Copia `lector.js` y la carpeta `libro/` a tu sitio y escribe, donde vaya el libro:

```html
<script src="/ruta/lector.js" defer></script>
<pubteca-lector src="/ruta/libro/libro.json"></pubteca-lector>
```

Es un elemento estándar del navegador (un *custom element*), así que funciona
igual en HTML plano y en React, Vue, Svelte, Astro o Next. En un framework,
carga `lector.js` una vez en el cliente (`import './lector.js'`) y usa la
etiqueta como cualquier otra. No necesita `index.html`.

## Dos formas de leer

- **Desplazar**: el libro de corrido, bajando por la página, como un artículo.
  El lector crece con su contenido y es la página la que se desplaza: no le
  pongas una altura fija.
- **Pasar páginas**: como en Kindle o Apple Books. Se pasa página deslizando el
  dedo, tocando el lado izquierdo o derecho, con las flechas o la barra
  espaciadora del teclado, con el trackpad, o con los botones de flecha. El
  lector ocupa una caja de alto fijo: la ventana entera con el atributo
  `pagina`, o `--pubteca-alto` (85vh si no se pone) incrustado en una página.

El autor eligió con cuál se abre (`lectura.modo` en `libro.json`). Cada lector
puede cambiarlo en «Aa», y su elección se recuerda.

## Para probarlo en tu equipo

Abrir `index.html` con doble clic funciona, pero a medias: sin un servidor, el
navegador no deja cargar las partes dentro del lector y se enseñan en un marco,
sin temas, letras ni tamaño. Para verlo como quedará publicado, sirve la
carpeta:

```bash
npx serve .
```

```bash
python3 -m http.server 8000
```

## Personalizarlo

### Atributos de `<pubteca-lector>`

| Atributo | Qué hace |
|---|---|
| `src` | La dirección de `libro.json`. Obligatorio. |
| `modo` | Cómo se abre: `desplazar` o `paginas`. Manda sobre lo que diga el libro. |
| `letra` | La letra con la que se abre: el `id` de una de `letras` en `libro.json` (`literata`, `eb-garamond`, `sistema`…). |
| `tema` | El tema con el que se abre: `auto` (el del sistema; es el que vale si no se pone), `claro`, `sepia` u `oscuro`. |
| `parte` | El id de la parte con la que se abre (por ejemplo `cap01`), en vez de la portada. |
| `pagina` | El lector es la página entera: ocupa el alto de la ventana, pone el título de la pestaña y el color de fondo del documento, y la rueda del ratón también pasa páginas. Es como lo usa `index.html`. |
| `sin-hash` | No lee ni escribe la dirección de la página (`#cap03`). Ponlo si tu sitio ya usa el `#` para otra cosa, como un enrutador. |
| `sin-memoria` | No guarda nada en el navegador de quien lee (ni sus ajustes ni por dónde iba). |

Lo que elige quien lee en «Aa» (modo, tema, tamaño, letra, interlineado y
alineación) manda sobre los atributos, y los atributos sobre el libro.

### Variables CSS

Se ponen sobre el elemento o sobre cualquiera de sus padres:

```css
pubteca-lector {
  --pubteca-acento: #8a3b12;
  --pubteca-ancho: 38em;
  --pubteca-alto: 80vh;
}
```

| Variable | Qué cambia | Si no se pone |
|---|---|---|
| `--pubteca-acento` | Botón principal, barra de progreso, foco | El color del texto |
| `--pubteca-fuente` | Añade la letra de tu sitio a las que se pueden elegir, con su nombre (el primero de la lista), y la pone por defecto | Solo las del libro |
| `--pubteca-fuente-interfaz` | La letra de botones y menús | La del sistema |
| `--pubteca-tamano` | El tamaño base de la letra | `1.125rem` |
| `--pubteca-interlineado` | El interlineado «Normal» | `1.65` |
| `--pubteca-ancho` | El ancho máximo de la columna de texto | `34em` |
| `--pubteca-alto` | El alto del lector al pasar páginas, si no ocupa la ventana entera | `85vh` |
| `--pubteca-arriba` | Dónde se queda pegada la barra al desplazar. Ponle el alto de la cabecera fija de tu sitio | `0px` |
| `--pubteca-claro-fondo`, `--pubteca-claro-texto` | Los colores del tema claro | `#ffffff`, `#1b1b1b` |
| `--pubteca-sepia-fondo`, `--pubteca-sepia-texto` | Los del tema sepia | `#f5eddc`, `#4a3a28` |
| `--pubteca-oscuro-fondo`, `--pubteca-oscuro-texto` | Los del tema oscuro | `#121212`, `#e4dfd6` |

Si usas una letra propia en `--pubteca-fuente`, cárgala en tu página como
siempre (`@font-face` o un `<link>`): el lector la usa, no la descarga.

Para lo que no cubren las variables, el lector expone sus piezas con
`::part()`: `lector`, `barra`, `progreso`, `hoja`, `contenido`, `pie`,
`paginador`, `panel` y `cubierta`.

```css
pubteca-lector::part(barra) { border-bottom: 0; }
```

El aspecto del texto del libro (sangrías, títulos de capítulo, ilustraciones)
está en `libro/libro.css`, que se puede editar.

### Eventos y métodos

```js
const lector = document.querySelector('pubteca-lector')

lector.addEventListener('pubteca-listo', (e) => {
  console.log(e.detail.libro) // libro.json
})
lector.addEventListener('pubteca-parte', (e) => {
  // { id, titulo, posicion, total }; posicion 0 es la portada
  console.log(e.detail.id)
})
lector.addEventListener('pubteca-pagina', (e) => {
  // Al pasar páginas: { parte, pagina, paginas }, con pagina desde 1
  console.log(e.detail.pagina, '/', e.detail.paginas)
})

lector.irA('cap03')
lector.siguiente() // la parte siguiente
lector.anterior() // la parte anterior
lector.adelante() // una página (al pasar páginas) o una parte (al desplazar)
lector.atras()
lector.parte // el id de la parte abierta; 'inicio' es la portada
lector.modo // 'desplazar' o 'paginas'
lector.pagina // al pasar páginas, la página de la parte (desde 1)
lector.paginas // y cuántas tiene
lector.libro // libro.json, o null si aún no cargó
```

### Los textos del lector

«Empezar a leer», «Índice», «Tipo de letra»… van en `libro/libro.json`, en
`textos`, en el idioma del libro. Se pueden cambiar ahí. `index.html` lleva una
copia del manifiesto dentro (es lo que le permite abrirse sin servidor): si
cambias `libro.json` y usas `index.html`, cambia también esa copia, o bórrala y
el lector leerá `libro.json`.

## Las letras

El libro lleva seis letras de libro dentro, en `libro/letras/`: Literata,
Source Serif 4, EB Garamond, Libre Baskerville, Alegreya y Crimson Pro. Van con
el libro para que el nombre que ve quien lee sea la letra que de verdad se
pinta, en cualquier aparato. Cada navegador descarga solo la que se usa (unos
200 a 330 kB con sus cuatro caras). La séptima, «Del sistema», es la del
aparato de cada lector y no se descarga.

Las seis tienen la licencia SIL Open Font License, que permite usarlas en un
sitio web. Cada una lleva su licencia al lado (`OFL-*.txt`): déjala con ella.

## Sin el lector

Cada parte es además una página HTML completa (`libro/cap01.html`), con su
enlace a la anterior y a la siguiente. Se leen sin JavaScript, las encuentran
los buscadores, y sirven de materia prima si prefieres montar tu propia
lectura: el texto de cada parte está en su `<main>`, y el orden, los títulos y
las letras, en `libro/libro.json`:

```json
{
  "formato": "pubteca-web",
  "version": 1,
  "titulo": "…",
  "autor": "…",
  "idioma": "es",
  "portada": { "src": "imagenes/portada.jpg", "ancho": 1600, "alto": 2560 },
  "estilo": "libro.css",
  "muestra": false,
  "partes": [
    { "id": "cap01", "clase": "capitulo", "titulo": "Capítulo 1: …", "archivo": "cap01.html", "indice": true }
  ],
  "lectura": { "modo": "paginas", "letra": "literata" },
  "letras": [
    {
      "id": "literata", "nombre": "Literata", "familia": "Pubteca Literata", "respaldo": "Georgia, serif",
      "caras": [{ "src": "letras/Literata-Regular.woff", "peso": "400", "estilo": "normal" }],
      "licencia": "letras/OFL-Literata.txt"
    }
  ],
  "textos": { "empezar": "Empezar a leer", "…": "…" }
}
```

Las rutas de `libro.json` (`archivo`, `estilo`, `portada.src`, las de
`letras`) son relativas a él. `indice` dice si la parte sale en el índice;
`muestra`, si el libro no está entero.

## Lo que conviene saber

- **Lo que se publica en la web se puede copiar.** No hay forma real de
  impedirlo. Si no quieres el libro entero en abierto, en Pubteca puedes
  elegir qué capítulos se publican.
- **Lo que recuerda el lector** (sus ajustes y por dónde iba cada persona) se
  guarda solo en el navegador de quien lee, en `localStorage`. No se envía a
  ningún sitio y no usa cookies.
- **Audio y video** no entran en el libro web por ahora.
- `lector.js` tiene licencia MIT: se puede usar, modificar y redistribuir.
