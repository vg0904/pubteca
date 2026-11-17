# Your book, for the web

This folder is a book ready to be read on a website, in any browser and on any
screen. It was made with Pubteca.

This file is written for whoever is going to publish it: you, the person who
runs your site, or an AI you hand the folder to.

## What is in here

```
index.html          the book, ready to open
lector.js           the reader: the <pubteca-lector> element (one file, no dependencies)
LEEME.md            this file
libro/
  libro.json        the manifest: book data, its parts in order, how it opens and the reader's texts
  libro.css         the book's stylesheet
  cap01.html …      one page per part (chapters, dedication, copyright…)
  imagenes/         the cover and the illustrations
  letras/           the book's typefaces (WOFF) and their licences
```

There is nothing to build or install. These are static files. File names and
identifiers are in Spanish (`libro` is book, `lector` is reader, `parte` is
part, `letra` is typeface); this guide explains each one.

## Three ways to publish it

### 1. As it is

Upload the whole folder to any static file host (Netlify, GitHub Pages,
Cloudflare Pages, Vercel, your domain's FTP…). The book lives at the address of
`index.html`.

### 2. Inside a site made with a builder (WordPress, Wix, Squarespace…)

Publish the folder as in option 1 and, on the page where you want the book,
embed it with an HTML block:

```html
<iframe src="https://your-domain.com/my-book/" title="Book title"
        style="width: 100%; height: 90vh; border: 0;"></iframe>
```

### 3. Built into a site's code

Copy `lector.js` and the `libro/` folder into your site and write, where the
book goes:

```html
<script src="/path/lector.js" defer></script>
<pubteca-lector src="/path/libro/libro.json"></pubteca-lector>
```

It is a standard browser element (a custom element), so it works the same in
plain HTML and in React, Vue, Svelte, Astro or Next. In a framework, load
`lector.js` once on the client (`import './lector.js'`) and use the tag like
any other. It does not need `index.html`.

## Two ways to read

- **Scroll** (`desplazar`): the book as one continuous text, scrolling down the
  page, like an article. The reader grows with its content and the page is what
  scrolls: do not give it a fixed height.
- **Turn pages** (`paginas`): like Kindle or Apple Books. Pages turn by swiping,
  by tapping the left or right side, with the keyboard arrows or space bar, with
  the trackpad, or with the arrow buttons. The reader takes a fixed-height box:
  the whole window with the `pagina` attribute, or `--pubteca-alto` (85vh by
  default) when embedded in a page.

The author chose which one it opens with (`lectura.modo` in `libro.json`). Each
reader can change it under "Aa", and their choice is remembered.

## Trying it on your computer

Opening `index.html` with a double click works, but only halfway: without a
server the browser will not let the reader load the parts, so they are shown in
a frame, without themes, typefaces or text size. To see it as it will look once
published, serve the folder:

```bash
npx serve .
```

```bash
python3 -m http.server 8000
```

## Customising it

### Attributes of `<pubteca-lector>`

| Attribute | What it does |
|---|---|
| `src` | The address of `libro.json`. Required. |
| `modo` | How it opens: `desplazar` (scroll) or `paginas` (turn pages). Wins over the book's choice. |
| `letra` | The typeface it opens with: the `id` of one of the `letras` in `libro.json` (`literata`, `eb-garamond`, `sistema`…). |
| `tema` | The theme it opens with: `auto` (the system's; used when the attribute is missing), `claro` (light), `sepia` or `oscuro` (dark). |
| `parte` | The id of the part it opens with (for example `cap01`), instead of the cover. |
| `pagina` | The reader is the whole page: it fills the window height, sets the tab title and the document's background colour, and the mouse wheel turns pages too. This is how `index.html` uses it. |
| `sin-hash` | It neither reads nor writes the page address (`#cap03`). Use it if your site already uses `#` for something else, such as a router. |
| `sin-memoria` | It stores nothing in the reader's browser (neither their settings nor where they left off). |

What a reader picks under "Aa" (mode, theme, size, typeface, line spacing and
alignment) wins over the attributes, and the attributes win over the book.

### CSS variables

Set them on the element or on any of its ancestors:

```css
pubteca-lector {
  --pubteca-acento: #8a3b12;
  --pubteca-ancho: 38em;
  --pubteca-alto: 80vh;
}
```

| Variable | What it changes | Default |
|---|---|---|
| `--pubteca-acento` | Main button, progress bar, focus ring | The text colour |
| `--pubteca-fuente` | Adds your site's typeface to the ones on offer, with its name (the first in the list), and makes it the default | Only the book's |
| `--pubteca-fuente-interfaz` | The typeface of buttons and menus | The system font |
| `--pubteca-tamano` | The base text size | `1.125rem` |
| `--pubteca-interlineado` | The "Normal" line height | `1.65` |
| `--pubteca-ancho` | The maximum width of the text column | `34em` |
| `--pubteca-alto` | The reader's height when turning pages, unless it fills the window | `85vh` |
| `--pubteca-arriba` | Where the bar sticks when scrolling. Set it to the height of your site's fixed header | `0px` |
| `--pubteca-claro-fondo`, `--pubteca-claro-texto` | The light theme's background and text colours | `#ffffff`, `#1b1b1b` |
| `--pubteca-sepia-fondo`, `--pubteca-sepia-texto` | The sepia theme's | `#f5eddc`, `#4a3a28` |
| `--pubteca-oscuro-fondo`, `--pubteca-oscuro-texto` | The dark theme's | `#121212`, `#e4dfd6` |

If you use your own typeface in `--pubteca-fuente`, load it in your page as
usual (`@font-face` or a `<link>`): the reader uses it, it does not download it.

For anything the variables do not cover, the reader exposes its pieces through
`::part()`: `lector` (the reader), `barra` (the bar), `progreso` (progress),
`hoja` (the sheet), `contenido` (the content), `pie` (previous and next part),
`paginador` (the page bar), `panel` and `cubierta` (the cover image).

```css
pubteca-lector::part(barra) { border-bottom: 0; }
```

How the book's text looks (indents, chapter titles, illustrations) is in
`libro/libro.css`, which you can edit.

### Events and methods

```js
const lector = document.querySelector('pubteca-lector')

lector.addEventListener('pubteca-listo', (e) => {
  console.log(e.detail.libro) // libro.json, once loaded
})
lector.addEventListener('pubteca-parte', (e) => {
  // { id, titulo, posicion, total }; posicion 0 is the cover
  console.log(e.detail.id)
})
lector.addEventListener('pubteca-pagina', (e) => {
  // When turning pages: { parte, pagina, paginas }, pagina counted from 1
  console.log(e.detail.pagina, '/', e.detail.paginas)
})

lector.irA('cap03') // go to a part
lector.siguiente() // next part
lector.anterior() // previous part
lector.adelante() // forward: a page (turning pages) or a part (scrolling)
lector.atras() // back
lector.parte // the id of the open part; 'inicio' is the cover
lector.modo // 'desplazar' or 'paginas'
lector.pagina // when turning pages, the page within the part (from 1)
lector.paginas // and how many it has
lector.libro // libro.json, or null if it has not loaded yet
```

### The reader's texts

"Start reading", "Contents", "Typeface"… live in `libro/libro.json`, under
`textos`, in the book's language. You can change them there. `index.html`
carries a copy of the manifest inside (that is what lets it open without a
server): if you change `libro.json` and use `index.html`, change that copy too,
or delete it and the reader will read `libro.json`.

## The typefaces

The book carries six book typefaces inside, in `libro/letras/`: Literata,
Source Serif 4, EB Garamond, Libre Baskerville, Alegreya and Crimson Pro. They
travel with the book so that the name a reader sees is the typeface actually
drawn, on any device. Each browser downloads only the one in use (about 200 to
330 kB with its four faces). The seventh, "System", is each reader's own device
typeface and is not downloaded.

All six are licensed under the SIL Open Font License, which allows using them on
a website. Each comes with its licence next to it (`OFL-*.txt`): keep it there.

## Without the reader

Each part is also a complete HTML page (`libro/cap01.html`), with a link to the
previous and the next one. They can be read without JavaScript, search engines
find them, and they are raw material if you would rather build your own reading
experience: each part's text is in its `<main>`, and the order, the titles and
the typefaces are in `libro/libro.json`:

```json
{
  "formato": "pubteca-web",
  "version": 1,
  "titulo": "…",
  "autor": "…",
  "idioma": "en",
  "portada": { "src": "imagenes/portada.jpg", "ancho": 1600, "alto": 2560 },
  "estilo": "libro.css",
  "muestra": false,
  "partes": [
    { "id": "cap01", "clase": "capitulo", "titulo": "Chapter 1: …", "archivo": "cap01.html", "indice": true }
  ],
  "lectura": { "modo": "paginas", "letra": "literata" },
  "letras": [
    {
      "id": "literata", "nombre": "Literata", "familia": "Pubteca Literata", "respaldo": "Georgia, serif",
      "caras": [{ "src": "letras/Literata-Regular.woff", "peso": "400", "estilo": "normal" }],
      "licencia": "letras/OFL-Literata.txt"
    }
  ],
  "textos": { "empezar": "Start reading", "…": "…" }
}
```

The paths in `libro.json` (`archivo`, `estilo`, `portada.src`, those in
`letras`) are relative to it. `indice` says whether the part appears in the
table of contents; `muestra`, whether the book is only a sample.

## Good to know

- **Anything published on the web can be copied.** There is no real way to
  prevent it. If you do not want the whole book in the open, in Pubteca you can
  choose which chapters are published.
- **What the reader remembers** (their settings and where each person left off)
  is stored only in that person's browser, in `localStorage`. It is not sent
  anywhere and it uses no cookies.
- **Audio and video** are not part of the web book for now.
- `lector.js` is MIT licensed: you may use, modify and redistribute it.
