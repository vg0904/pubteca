import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// El core es TypeScript puro y sincrono: sin DOM, sin canvas, sin File, sin
// async. Esa frontera es lo que hace posibles los golden tests contra el
// Python, la validacion en CI sin navegador y un CLI en Node.
//
// Es facil de romper por accidente (un `await` que se cuela, un `document`
// para parsear algo) y el sintoma no aparece hasta que CI ya no puede generar
// los libros de prueba. Este test lo sostiene.

const RAIZ = join(import.meta.dirname, '..', 'src', 'core')

function archivosTs(dir: string): string[] {
  let salida: string[] = []
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) salida = salida.concat(archivosTs(ruta))
    else if (entrada.endsWith('.ts') && !entrada.endsWith('.d.ts')) salida.push(ruta)
  }
  return salida
}

/** Quita comentarios de linea y de bloque para no acusar a la documentacion. */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const PROHIBIDO: { patron: RegExp; porque: string }[] = [
  { patron: /\bdocument\b/, porque: 'el core no puede tocar el DOM' },
  { patron: /\bwindow\b/, porque: 'el core no puede tocar el DOM' },
  { patron: /\bnavigator\b/, porque: 'el core no puede tocar APIs del navegador' },
  { patron: /\bDOMParser\b/, porque: 'el core no puede tocar el DOM' },
  { patron: /\bcanvas\b|OffscreenCanvas|createImageBitmap/i, porque: 'el core no decodifica imagenes, solo lee sus bytes' },
  { patron: /\bnew File\b|\bFileReader\b|\bBlob\b/, porque: 'el core recibe Uint8Array, no File ni Blob' },
  { patron: /\basync\b|\bawait\b|Promise</, porque: 'el core es sincrono o los golden tests dejan de ser deterministas' },
  { patron: /crypto\.subtle/, porque: 'crypto.subtle es asincrono: el SHA-1 del uuid5 va en JS puro' },
  { patron: /\bfrom\s+['"][^'"]*\/app\//, porque: 'la flecha va app -> core, nunca al reves' },
  { patron: /\bindexedDB\b|from\s+['"]idb['"]/, porque: 'la persistencia vive en la capa de app' },
  { patron: /from\s+['"]mammoth['"]/, porque: 'mammoth es de la capa de app' },
  { patron: /from\s+['"]react/, porque: 'el core no sabe que existe React' },
  { patron: /Date\.now\(\)|new Date\(\s*\)/, porque: 'el reloj se inyecta, o los golden tests no son reproducibles' },
]

// U+2028 y U+2029 son terminadores de linea REALES en JavaScript. Si uno se
// cuela en el fuente (es facil al generar codigo, porque son invisibles),
// parte una expresion regular o una cadena por la mitad y el error que da el
// compilador no apunta a la causa. Paso por esto escribiendo config.ts.
describe('el fuente no contiene separadores de linea invisibles', () => {
  const TODOS = [
    ...archivosTs(join(import.meta.dirname, '..', 'src')),
    ...archivosTs(join(import.meta.dirname)),
  ]
  const INVISIBLES: [number, string][] = [
    [0x2028, 'LINE SEPARATOR'],
    [0x2029, 'PARAGRAPH SEPARATOR'],
    [0x0085, 'NEL'],
    [0x000b, 'tabulacion vertical'],
  ]

  for (const [punto, nombre] of INVISIBLES) {
    it(`ningun archivo contiene U+${punto.toString(16).toUpperCase().padStart(4, '0')} (${nombre})`, () => {
      const culpables = TODOS.filter((f) =>
        readFileSync(f, 'utf8').includes(String.fromCodePoint(punto)),
      )
      expect(culpables).toEqual([])
    })
  }
})

describe('frontera entre core y app', () => {
  const archivos = archivosTs(RAIZ)

  it('hay modulos de core que vigilar', () => {
    // Mientras el core este vacio esto solo documenta la intencion; en cuanto
    // H1 anada el primer modulo, el resto del test empieza a morder.
    expect(Array.isArray(archivos)).toBe(true)
  })

  for (const { patron, porque } of PROHIBIDO) {
    it(`ningun modulo de core usa ${patron.source} (${porque})`, () => {
      const culpables = archivos.filter((f) => patron.test(sinComentarios(readFileSync(f, 'utf8'))))
      expect(culpables.map((f) => f.replace(RAIZ, 'src/core'))).toEqual([])
    })
  }
})
