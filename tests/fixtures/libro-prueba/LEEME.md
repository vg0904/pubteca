# libro-prueba

Libro **inventado** de principio a fin. Ninguna linea, imagen ni dato sale de
un libro real: el brief lo prohibe explicitamente y el `.gitignore` del
proyecto original esta puesto para lo mismo.

Existe para una cosa: que los golden tests comparen la salida del port de
TypeScript con la del `generar_epub.py` de referencia, y que EPUBCheck valide
el resultado en CI.

## Que ejercita a proposito

| Pieza | Para probar |
|---|---|
| `cap01.md` | cabecera «Capitulo N: Titulo», cambio de escena, cursiva y negrita, ilustracion en medio del texto |
| `cap02.md` | ilustracion ANTES del titulo (abre con dibujo), subtitulo con `#`, bloque de versos con cambio de estrofa, dos ilustraciones |
| `cap04.md` | el hueco en la numeracion (falta el 3): el generador tiene que avisar |
| `cap05-epilogo.md` | la cabecera «Epilogo», que no lleva numero |
| `extras/dedicatoria.md` | pagina centrada en cursiva, sin titulo, al inicio |
| `extras/inicio-nota.md` | extra que va al inicio por empezar su nombre con «inicio» |
| `extras/agradecimientos.md` | extra que va al final, con su primera linea como titulo |
| `ilustraciones/color-0N.png` | laminas a color de apertura, que van solas al principio |
| `ilustraciones/cap09-99.png` | imagen que NO esta marcada en ningun capitulo: tiene que avisar |
| `ilustraciones/cap02-01.png` | imagen con transparencia: tiene que avisar (Kindle la vuelve blanca) |
| `portada/` | portada, contraportada, y logo en sus dos versiones para el modo oscuro |
| `fuentes/` | Libre Baskerville (OFL), que solo entra en la version de Apple Books |

Las imagenes son las sinteticas de `tests/fixtures/imagenes/`, generadas por
`scripts/imagenes-prueba.py`. Las fuentes son Libre Baskerville de verdad,
redistribuible bajo la SIL Open Font License; su `OFL.txt` viaja con ellas.
