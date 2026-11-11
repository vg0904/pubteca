import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cadena, escribirPdf, nombre, num, prefijo } from '../src/core/impreso/pdf'
import { Fuente } from '../src/core/impreso/sfnt'
import { glifosNecesarios, sumaTabla } from '../src/core/impreso/subconjunto'
import type { Fuentes, PaginaCompuesta } from '../src/core/impreso/tipos'
import { FECHA, fuentesDelRepo, GOLDEN, imagenDePrueba, libroImpresoDePrueba } from '../scripts/impreso-prueba'
import { comprobarPdfx, dic, fuentesDelPdf, leerPdf, lista, nombreDe, numero, objeto, paginas, resolver, textosPintados, texto, volcar, type Valor } from '../scripts/leer-pdf'

// El PDF interior: el golden (estructura y contenido descomprimido), el
// determinismo byte a byte, nuestra lista de PDF/X-1a, y que lo que se
// incrusta (fuentes, imagenes, ToUnicode) dice lo que el compositor compuso.
// qpdf y pdffonts los pasa CI sobre el mismo libro (npm run pdfs).

const libro = libroImpresoDePrueba()
const pdf = leerPdf(libro.pdf)

describe('el golden del PDF interior', () => {
  it('la estructura y el contenido descomprimido son los del golden', () => {
    // Para regenerarlo, a proposito: npx tsx scripts/impreso-prueba.ts --golden
    expect(volcar(pdf)).toBe(readFileSync(GOLDEN, 'utf8'))
  })
})

describe('determinismo', () => {
  it('dos generaciones con el mismo reloj dan los mismos bytes', () => {
    const otra = libroImpresoDePrueba()
    expect(Buffer.from(otra.pdf).equals(Buffer.from(libro.pdf))).toBe(true)
  })

  it('con otro reloj solo cambian las fechas y el /ID', () => {
    const otra = libroImpresoDePrueba({}, new Date(Date.UTC(2027, 0, 2, 3, 4, 5)))
    const b = leerPdf(otra.pdf)
    expect(texto(dic(resolver(b, b.trailer.get('Info'))).get('CreationDate'))).toBe("D:20270102030405+00'00'")
    expect(volcar(b).replaceAll("D:20270102030405+00'00'", 'FECHA')).toBe(volcar(pdf).replaceAll("D:20261111120000+00'00'", 'FECHA'))
    expect(JSON.stringify(b.trailer.get('ID'))).not.toBe(JSON.stringify(pdf.trailer.get('ID')))
  })

  it('el reloj es el inyectado, en UTC', () => {
    expect(texto(dic(resolver(pdf, pdf.trailer.get('Info'))).get('ModDate'))).toBe("D:20261111120000+00'00'")
    expect(FECHA.toISOString()).toBe('2026-11-11T12:00:00.000Z')
  })
})

describe('nuestra lista de PDF/X-1a', () => {
  it('pasa sobre el libro de prueba, con y sin sangrado', () => {
    expect(comprobarPdfx(pdf)).toEqual([])
    const fuentes = fuentesDelRepo()
    const conSangrado = escribirPdf(libro.compuesto.paginas, {
      ancho: 432,
      alto: 648,
      sangrado: { interior: 0, exterior: 9, superior: 9, inferior: 9 },
      fuentes,
      imagenes: () => imagenDePrueba(),
      titulo: 'Prueba',
      autor: 'Nadie',
      fecha: FECHA,
    })
    expect(comprobarPdfx(leerPdf(conSangrado))).toEqual([])
  })

  // La lista tiene que morder: se rompe una cosa cada vez en los bytes (con
  // reemplazos del mismo largo, para que la xref siga valiendo).
  const ROTURAS: [string, string, string, RegExp][] = [
    ['version 1.4', '%PDF-1.3', '%PDF-1.4', /version 1\.4/u],
    ['sin TrimBox', '/TrimBox', '/TrimBax', /sin TrimBox/u],
    ['Trapped a medias', '/Trapped /False', '/Trapped /Maybe', /Trapped/u],
    ['sin version PDF/X', '/GTS_PDFXVersion', '/GTS_PDFXVersiom', /GTS_PDFXVersion/u],
    ['sin OutputIntent', '/OutputIntents', '/OutputIntentz', /OutputIntent/u],
    ['imagen en RGB', '/DeviceGray', '/DeviceRGB ', /imagen .* DeviceRGB/u],
    ['fuente sin incrustar', '/FontFile2', '/FontFile7', /sin incrustar/u],
    ['con anotaciones', '/Resources', '/Annots   ', /anotaciones/u],
  ]
  for (const [que, de, a, fallo] of ROTURAS) {
    it(`la lista lo caza: ${que}`, () => {
      const t = Buffer.from(libro.pdf).toString('latin1')
      expect(t.includes(de)).toBe(true)
      const roto = new Uint8Array(Buffer.from(t.replace(de, a), 'latin1'))
      const f = (() => {
        try {
          return comprobarPdfx(leerPdf(roto))
        } catch (e) {
          return [String(e)]
        }
      })()
      expect(f.join('; ')).toMatch(fallo)
    })
  }
})

describe('las paginas', () => {
  it('una pagina del PDF por cada pagina compuesta, del tamaño de corte', () => {
    const ps = paginas(pdf)
    expect(ps).toHaveLength(libro.compuesto.paginas.length)
    for (const p of ps) {
      for (const k of ['MediaBox', 'BleedBox', 'TrimBox']) expect(lista(p.get(k)).map(numero)).toEqual([0, 0, 432, 648])
    }
  })

  it('cada texto va donde lo puso el compositor, y avanza lo mismo (kerning incluido)', () => {
    const pintados = textosPintados(pdf)
    libro.compuesto.paginas.forEach((p, i) => {
      const ops = p.ops.filter((o) => o.op === 'texto')
      const ts = pintados[i] ?? []
      expect(ts).toHaveLength(ops.length)
      ops.forEach((op, k) => {
        if (op.op !== 'texto') return
        const t = ts[k] as (typeof ts)[number]
        expect(t.x).toBeCloseTo(op.x, 3)
        expect(t.y).toBeCloseTo(648 - op.y, 3)
        const f = fuentesDelRepo()[op.cara]
        expect(t.avance).toBeCloseTo(op.glifos.reduce((s, g) => s + (g.avance * op.cuerpo) / f.upm, 0), 2)
        expect(t.texto).toBe(op.glifos.map((g) => g.texto).join(''))
      })
    })
  })

  it('el texto se puede copiar: la ligadura «fi» vuelve a ser «f» + «i»', () => {
    const todo = textosPintados(pdf)
      .flat()
      .map((t) => t.texto)
      .join(' ')
    expect(todo).toContain('finísima:')
    expect(todo).toContain('—¿Y')
    // El guion de particion tambien es texto.
    expect(todo).toContain('esta-')
  })

  it('el sangrado agranda la pagina por fuera y deja el corte en su sitio', () => {
    const fuentes = fuentesDelRepo()
    const s = { interior: 0, exterior: 9, superior: 9, inferior: 9 }
    const b = leerPdf(escribirPdf(libro.compuesto.paginas, { ancho: 432, alto: 648, sangrado: s, fuentes, imagenes: () => imagenDePrueba(), titulo: 'P', autor: 'N', fecha: FECHA }))
    const ps = paginas(b)
    const caja = (p: ReadonlyMap<string, Valor>, k: string): number[] => lista(p.get(k)).map(numero)
    // Impar: el lomo a la izquierda, el sangrado a la derecha.
    expect(caja(ps[0] as ReadonlyMap<string, Valor>, 'MediaBox')).toEqual([0, 0, 441, 666])
    expect(caja(ps[0] as ReadonlyMap<string, Valor>, 'TrimBox')).toEqual([0, 9, 432, 657])
    // Par: el sangrado a la izquierda.
    expect(caja(ps[1] as ReadonlyMap<string, Valor>, 'TrimBox')).toEqual([9, 9, 441, 657])
    const sin = textosPintados(pdf)
    const con = textosPintados(b)
    expect((con[1]?.[0]?.x ?? 0) - (sin[1]?.[0]?.x ?? 0)).toBeCloseTo(9, 6)
    expect((con[0]?.[0]?.x ?? 0) - (sin[0]?.[0]?.x ?? 0)).toBeCloseTo(0, 6)
    expect((con[0]?.[0]?.y ?? 0) - (sin[0]?.[0]?.y ?? 0)).toBeCloseTo(9, 6)
  })
})

describe('las fuentes incrustadas', () => {
  const fs = fuentesDelPdf(pdf)

  it('estan todas, en subconjunto, con un prefijo de seis mayusculas', () => {
    expect(fs.map((f) => f.base.replace(/^[A-Z]{6}\+/u, ''))).toEqual(['SourceSerif4Roman-11pt', 'SourceSerif4Italic-11ptItalic', 'SourceSerif4Roman-11ptBold'])
    for (const f of fs) expect(f.base).toMatch(/^[A-Z]{6}\+/u)
  })

  it('cada subconjunto es una fuente valida: sumas de control y glifos', () => {
    const origen = fuentesDelRepo()
    for (const f of fs) {
      const sub = new Fuente(f.programa)
      const dv = new DataView(f.programa.buffer, f.programa.byteOffset, f.programa.byteLength)
      // Cada tabla con su suma, y el archivo entero a 0xB1B0AFBA.
      for (const [etiqueta, t] of sub.tablas) {
        const datos = f.programa.slice(t.off, t.off + t.len)
        if (etiqueta === 'head') new DataView(datos.buffer).setUint32(8, 0)
        const i = [...sub.tablas.keys()].indexOf(etiqueta)
        expect(sumaTabla(datos), etiqueta).toBe(dv.getUint32(12 + i * 16 + 4))
      }
      expect(sumaTabla(f.programa)).toBe(0xb1b0afba)
      expect([...sub.tablas.keys()].sort()).toEqual(['OS/2', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp'])
      const cara = f.base.includes('Italic') ? 'cursiva' : f.base.includes('Bold') ? 'negrita' : 'regular'
      const o = origen[cara]
      // Los usados conservan su contorno y su avance; lo demas, vacio.
      const largo = (fu: Fuente, g: number): number => {
        const t = fu.tablas.get('loca') as { off: number }
        const v = new DataView(fu.bytes.buffer)
        return fu.locaLarga ? v.getUint32(t.off + (g + 1) * 4) - v.getUint32(t.off + g * 4) : (v.getUint16(t.off + (g + 1) * 2) - v.getUint16(t.off + g * 2)) * 2
      }
      const necesarios = glifosNecesarios(o, f.anchos.keys())
      let vacios = 0
      for (let g = 0; g < sub.numGlifos; g++) {
        // Cada glifo guardado va alineado a 4 bytes.
        if (necesarios.has(g)) expect(largo(sub, g), `glifo ${g}`).toBe((largo(o, g) + 3) & ~3)
        else if (largo(sub, g) === 0) vacios++
        expect(sub.avance(g)).toBe(o.avance(g))
      }
      expect(vacios).toBe(sub.numGlifos - necesarios.size)
      expect(f.programa.length).toBeLessThan(o.bytes.length / 4)
    }
  })

  it('un glifo compuesto se lleva sus piezas: «á» es «a» + el acento, «ñ» es «n» + la tilde', () => {
    // Las piezas se buscan por el cmap, no con la misma funcion que el subconjunto.
    const f = fuentesDelRepo().regular
    const g = (c: string): number => f.glifo(c.codePointAt(0) as number)
    expect([...glifosNecesarios(f, [g('á'), g('ñ')])].sort((a, b) => a - b)).toEqual([0, g('a'), g('n'), g('á'), g('ñ'), g('\u0301'), g('\u0303')].sort((a, b) => a - b))
    // Y en el PDF del libro, que lleva «á» y «ñ», el acento y la tilde tienen contorno.
    const regular = fs.find((x) => x.base.endsWith('SourceSerif4Roman-11pt')) as (typeof fs)[number]
    const sub = new Fuente(regular.programa)
    const t = sub.tablas.get('loca') as { off: number }
    const v = new DataView(regular.programa.buffer, regular.programa.byteOffset)
    for (const pieza of [g('\u0301'), g('\u0303')]) expect(v.getUint32(t.off + (pieza + 1) * 4) - v.getUint32(t.off + pieza * 4)).toBeGreaterThan(0)
  })

  it('los anchos de /W son los de la fuente', () => {
    const origen = fuentesDelRepo()
    for (const f of fs) {
      const o = origen[f.base.includes('Italic') ? 'cursiva' : f.base.includes('Bold') ? 'negrita' : 'regular']
      for (const [g, w] of f.anchos) expect(w).toBeCloseTo((o.avance(g) * 1000) / o.upm, 3)
    }
  })

  it('una fuente cuya licencia no deja incrustarla para el PDF y dice por que', () => {
    const fuentes = fuentesDelRepo()
    const b = new Uint8Array(fuentes.regular.bytes)
    const dv = new DataView(b.buffer)
    const os2 = fuentes.regular.tablas.get('OS/2') as { off: number }
    dv.setUint16(os2.off + 8, 0x0002)
    const restringida: Fuentes = { ...fuentes, regular: new Fuente(b) }
    expect(() => escribirPdf(libro.compuesto.paginas, { ancho: 432, alto: 648, fuentes: restringida, imagenes: () => imagenDePrueba(), titulo: 'P', autor: 'N', fecha: FECHA })).toThrow(
      /licencia .* no deja incrustarla/u,
    )
  })

  it('una fuente que prohibe el subconjunto se incrusta entera', () => {
    const fuentes = fuentesDelRepo()
    const b = new Uint8Array(fuentes.regular.bytes)
    new DataView(b.buffer).setUint16((fuentes.regular.tablas.get('OS/2') as { off: number }).off + 8, 0x0100)
    const entera: Fuentes = { ...fuentes, regular: new Fuente(b) }
    const p = leerPdf(escribirPdf(libro.compuesto.paginas, { ancho: 432, alto: 648, fuentes: entera, imagenes: () => imagenDePrueba(), titulo: 'P', autor: 'N', fecha: FECHA }))
    const regular = fuentesDelPdf(p)[0]
    expect(regular?.base).toBe('SourceSerif4Roman-11pt')
    expect(regular?.programa.length).toBe(b.length)
  })
})

describe('las imagenes', () => {
  it('van una vez, en gris de 8 bits, con sus pixeles tal cual', () => {
    const recursos = dic(resolver(pdf, paginas(pdf)[0]?.get('Resources')))
    const xo = [...dic(recursos.get('XObject')).values()]
    expect(xo).toHaveLength(1)
    const img = objeto(pdf, xo[0])
    expect(nombreDe(img.dic.get('ColorSpace'))).toBe('DeviceGray')
    expect(numero(img.dic.get('BitsPerComponent'))).toBe(8)
    const esperada = imagenDePrueba()
    expect([numero(img.dic.get('Width')), numero(img.dic.get('Height'))]).toEqual([600, 400])
    expect(Buffer.from(img.flujo as Uint8Array).equals(Buffer.from(esperada.pixeles))).toBe(true)
  })

  it('se pintan donde y como las puso el compositor', () => {
    const i = libro.compuesto.paginas.findIndex((p) => p.tipo === 'ilustracion')
    const op = libro.compuesto.paginas[i]?.ops[0]
    if (op?.op !== 'imagen') throw new Error('sin imagen')
    const s = String.fromCharCode(...(objeto(pdf, paginas(pdf)[i]?.get('Contents')).flujo as Uint8Array))
    expect(s).toContain(`q ${num(op.ancho)} 0 0 ${num(op.alto)} ${num(op.x)} ${num(648 - op.y - op.alto)} cm /Im1 Do Q`)
  })

  it('si falta una imagen, lo dice', () => {
    const paginasConImagen: PaginaCompuesta[] = [{ numero: 1, folio: null, tipo: 'ilustracion', seccion: 0, ops: [{ op: 'imagen', id: 'x', x: 0, y: 0, ancho: 10, alto: 10 }], renglones: [] }]
    expect(() => escribirPdf(paginasConImagen, { ancho: 100, alto: 100, fuentes: fuentesDelRepo(), titulo: 'P', autor: 'N', fecha: FECHA })).toThrow(/Falta la imagen «x»/u)
    expect(() =>
      escribirPdf(paginasConImagen, { ancho: 100, alto: 100, fuentes: fuentesDelRepo(), imagenes: () => ({ ancho: 3, alto: 3, pixeles: new Uint8Array(8) }), titulo: 'P', autor: 'N', fecha: FECHA }),
    ).toThrow(/no mide 3 × 3/u)
  })
})

describe('la sintaxis', () => {
  it('numeros con tres decimales, sin exponente ni «-0»', () => {
    expect(num(1e-9)).toBe('0')
    expect(num(-0.0001)).toBe('0')
    expect(num(12.3456)).toBe('12.346')
    expect(num(-3.1)).toBe('-3.1')
    expect(num(32767)).toBe('32767')
    expect(() => num(1e21)).toThrow()
    expect(() => num(NaN)).toThrow()
  })
  it('las cadenas: ASCII literal con escapes, el resto en UTF-16 con BOM', () => {
    expect(cadena('Hola (y) \\')).toBe('(Hola \\(y\\) \\\\)')
    expect(cadena('Lucía')).toBe('<FEFF004C007500630069>'.replace('0069>', '00ED0061>'))
  })
  it('los nombres escapan lo que no es seguro', () => {
    expect(nombre('Mi Fuente#1')).toBe('Mi#20Fuente#231')
  })
  it('el prefijo depende de los glifos, y siempre son seis mayusculas', () => {
    expect(prefijo('X', [1, 2])).toMatch(/^[A-Z]{6}$/u)
    expect(prefijo('X', [1, 2])).toBe(prefijo('X', [1, 2]))
    expect(prefijo('X', [1, 2])).not.toBe(prefijo('X', [1, 3]))
  })
  it('el titulo con tildes llega entero al Info', () => {
    expect(texto(dic(resolver(pdf, pdf.trailer.get('Info'))).get('Author'))).toBe('Lucía Ferrer Ondarra')
  })
})
