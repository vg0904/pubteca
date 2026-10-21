// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

/**
 * mammoth tiene DOS caminos para abrir el .docx: el de Node (el que usan los
 * demas tests) y el del navegador, que Vite elige por el campo «browser» de su
 * package.json. Cada uno quiere una clave distinta en las opciones, y con la
 * equivocada fallan con «Could not find file in options».
 *
 * Todos los tests de H4 pasaban por el camino de Node y la app real no podia
 * abrir ni un .docx. Este test carga el MISMO paquete que carga el navegador
 * (mammoth.browser.js, el que se construye con ese campo «browser») y le pasa
 * un .docx de verdad.
 */
vi.mock('mammoth', async () => {
  const navegador = (await import('mammoth/mammoth.browser.js')) as unknown as { default: unknown }
  return navegador.default as object
})

const { importarDocx } = await import('../src/app/importar/docx')

const leer = (nombre: string): ArrayBuffer =>
  // Copiado a un ArrayBuffer de ESTE entorno: el jszip del paquete del
  // navegador comprueba `instanceof ArrayBuffer`, y el del Buffer de Node es
  // de otro reino.
  new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', 'docx', nombre))).buffer

describe('importar un .docx con el mammoth del navegador', () => {
  it('abre el documento y propone los capitulos', async () => {
    let n = 0
    const p = await importarDocx(leer('manuscrito-realista.docx'), { nombreArchivo: 'm', nuevoId: (x) => `${x}-${++n}` })
    expect(p.cortes).toHaveLength(5)
    expect(p.bloques.length).toBeGreaterThan(5)
  })

  it('saca las ilustraciones: en el navegador no hay Buffer', async () => {
    // En el mammoth que Vite empaqueta para la app, `image.read()` sin
    // codificacion hace `Buffer.from(...)`, y `Buffer` no existe en el
    // navegador: lanza ReferenceError, mammoth se traga el error y la
    // ilustracion desaparecia del capitulo sin decir nada. El paquete de
    // arriba trae su propio Buffer y no lo reproduce, asi que aqui se usa el
    // mammoth de Node con `read()` fallando EXACTAMENTE como en el navegador.
    vi.doMock('mammoth', async () => {
      const real = ((await vi.importActual('mammoth')) as { default: typeof import('mammoth') }).default
      type Img = Parameters<Parameters<typeof real.images.imgElement>[0]>[0]
      return {
        ...real,
        images: {
          ...real.images,
          imgElement: (f: (image: Img) => Promise<{ src: string }>) =>
            real.images.imgElement((image) =>
              f({
                ...image,
                read: () => Promise.reject(new ReferenceError('Buffer is not defined')),
                readAsArrayBuffer: () => image.readAsArrayBuffer(),
              } as unknown as Img),
            ),
        },
      }
    })
    vi.resetModules()
    const { importarDocx: importarSinBuffer } = await import('../src/app/importar/docx')
    let n = 0
    const buf = readFileSync(join(import.meta.dirname, 'fixtures', 'docx', 'capitulo-completo.docx'))
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    const p = await importarSinBuffer(bytes, { nombreArchivo: 'c', nuevoId: (x) => `${x}-${++n}` })
    expect(p.imagenes).toHaveLength(1)
    expect(p.imagenes[0]?.bytes.length).toBeGreaterThan(1000)
    expect(p.bloques.map((b) => b.tipo)).toContain('ilustracion')
  })
})
