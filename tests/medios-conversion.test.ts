import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agrupar, tiendasDe } from '../src/app/avisos'
import { ESTADO_INICIAL, reducir, type Accion, type Estado } from '../src/app/estado'
import { duracion, frecuencia } from '../src/app/formato'
import {
  clasificar,
  esNegro,
  frecuenciaDelLibro,
  medidasDeSalida,
  nombreDeCodec,
  type Capacidades,
  type InfoMedio,
  type Plan,
} from '../src/app/medios/clasificar'
import { convertirEnSuHilo, ErrorConversion, type HiloConversion } from '../src/app/medios/hilo'
import { analizar, opcionesDeMuestra } from '../src/app/medios/inspeccionar'
import { momentoPorDefecto, recorteQueLlena } from '../src/app/medios/poster'
import { DATOS_POR_DEFECTO, type Bloque, type Medio, type Proyecto } from '../src/app/modelo'
import { revisar } from '../src/app/revision'
import { mediosDe } from '../src/app/ui/archivos'

/**
 * Añadir audio y video (hito M3): que es cada archivo, que hay que hacerle, y
 * el hilo que lo convierte. La conversion de verdad necesita WebCodecs y se
 * probo en Safari 27 y Chromium 156 (plan.md); aqui se fija todo lo que se
 * decide sin navegador, y la lectura real de los archivos con Mediabunny.
 */

const TODO: Capacidades = { decodificaVideo: true, decodificaAudio: true, codificaAvc: true, codificaAac: true }
const SIN_AAC: Capacidades = { ...TODO, codificaAac: false }

const iphone: InfoMedio = {
  contenedor: 'mov',
  segundos: 12,
  bytes: 30_000_000,
  video: { codec: 'hevc', ancho: 1080, alto: 1920, rotacion: 90, hdr: false },
  audio: { codec: 'aac', hz: 44_100, canales: 2 },
}
const notaDeVoz: InfoMedio = { contenedor: 'mp4', segundos: 30, bytes: 500_000, video: null, audio: { codec: 'aac', hz: 48_000, canales: 1 } }
const pasos = (p: Plan): string[] => (p.clase === 'imposible' ? [`imposible:${p.motivo}`] : p.pasos.map((x) => (x.tipo === 'contenedor' ? `contenedor:${x.de}` : `${x.tipo}:${x.motivo}`)))

describe('el plan de un video', () => {
  it('el .mov del iPhone: cambia de caja y se recodifica para los negros; el giro no se toca', () => {
    const p = clasificar(iphone, TODO, null)
    expect(p.clase).toBe('convertible')
    expect(pasos(p)).toEqual(['contenedor:mov', 'video:negro'])
    expect(p.clase !== 'imposible' && p.tipo).toBe('m4v')
  })

  it('si ya empieza y acaba en negro (medido), y es H.264 en MPEG-4: entra tal cual', () => {
    const p = clasificar({ ...iphone, contenedor: 'mp4', video: { ...(iphone.video as NonNullable<InfoMedio['video']>), codec: 'avc' }, negro: { principio: true, final: true } }, TODO, null)
    expect(p).toEqual({ clase: 'valido', tipo: 'm4v', pasos: [] })
  })

  it('con el negro medido pero en .mov: valido, solo cambia de caja', () => {
    expect(pasos(clasificar({ ...iphone, negro: { principio: true, final: true } }, TODO, null))).toEqual(['contenedor:mov'])
  })

  it('negro solo al principio no basta; sin medir, tampoco', () => {
    expect(pasos(clasificar({ ...iphone, contenedor: 'mp4', negro: { principio: true, final: false } }, TODO, null))).toEqual(['video:negro'])
    expect(pasos(clasificar({ ...iphone, contenedor: 'mp4' }, TODO, null))).toEqual(['video:negro'])
  })

  it('HDR se recodifica a SDR aunque ya sea negro; otro codec, por el codec', () => {
    const v = iphone.video as NonNullable<InfoMedio['video']>
    expect(pasos(clasificar({ ...iphone, video: { ...v, hdr: true }, negro: { principio: true, final: true } }, TODO, null))).toEqual(['contenedor:mov', 'video:hdr'])
    expect(pasos(clasificar({ ...iphone, video: { ...v, codec: 'prores' } }, TODO, null))).toEqual(['contenedor:mov', 'video:codec'])
  })

  it('un 4K se reduce a 1920 de lado largo, con medidas pares y la proporcion', () => {
    const p = clasificar({ ...iphone, video: { ...(iphone.video as NonNullable<InfoMedio['video']>), ancho: 2160, alto: 3840 } }, TODO, null)
    const v = p.clase !== 'imposible' ? p.pasos.find((x) => x.tipo === 'video') : undefined
    expect(v && v.tipo === 'video' && [v.ancho, v.alto, v.antes]).toEqual([1080, 1920, { ancho: 2160, alto: 3840 }])
    expect(medidasDeSalida(1921, 1081)).toEqual({ ancho: 1920, alto: 1080 })
    expect(medidasDeSalida(161, 91)).toEqual({ ancho: 162, alto: 92 })
  })

  it('el sonido del video, si no es AAC o pasa de estereo, a AAC; su frecuencia no se toca', () => {
    const conPcm = { ...iphone, audio: { codec: 'pcm-s16', hz: 48_000, canales: 2 } }
    expect(pasos(clasificar(conPcm, TODO, 44_100))).toEqual(['contenedor:mov', 'video:negro', 'audio:codec'])
    const p = clasificar({ ...iphone, audio: { codec: 'aac', hz: 48_000, canales: 6 } }, TODO, 44_100)
    expect(p.clase !== 'imposible' && p.pasos.find((x) => x.tipo === 'audio')).toEqual({ tipo: 'audio', motivo: 'canales', hz: 48_000, canales: 2 })
    expect(pasos(clasificar(iphone, TODO, 48_000))).toEqual(['contenedor:mov', 'video:negro'])
  })

  it('lo que este navegador no puede: dice que no, y por que', () => {
    expect(pasos(clasificar(iphone, { ...TODO, decodificaVideo: false }, null))).toEqual(['imposible:noDecodifica'])
    expect(pasos(clasificar(iphone, { ...TODO, codificaAvc: false }, null))).toEqual(['imposible:sinH264'])
    expect(pasos(clasificar({ ...iphone, audio: { codec: 'pcm-s16', hz: 48_000, canales: 2 } }, SIN_AAC, null))).toEqual(['imposible:sinAac'])
    // Sin AAC, un video con su sonido ya en AAC SI se puede: solo se recodifica la imagen.
    expect(clasificar(iphone, SIN_AAC, null).clase).toBe('convertible')
  })

  it('un archivo que no se lee, o sin pistas', () => {
    expect(pasos(clasificar(null, TODO, null))).toEqual(['imposible:formato'])
    expect(pasos(clasificar({ ...notaDeVoz, contenedor: 'otro' }, TODO, null))).toEqual(['imposible:formato'])
    expect(pasos(clasificar({ ...notaDeVoz, audio: null }, TODO, null))).toEqual(['imposible:sinPistas'])
  })
})

describe('el plan de un audio', () => {
  it('la nota de voz del iPhone (AAC en .m4a): entra tal cual y fija la frecuencia del libro', () => {
    expect(clasificar(notaDeVoz, TODO, null)).toEqual({ clase: 'valido', tipo: 'm4a', pasos: [] })
  })

  it('a otra frecuencia que la del libro: se recodifica a la del libro', () => {
    const p = clasificar(notaDeVoz, TODO, 44_100)
    expect(p.clase !== 'imposible' && p.pasos).toEqual([{ tipo: 'audio', motivo: 'frecuencia', hz: 44_100, canales: 1 }])
  })

  it('WAV y MP3 a AAC; mono se queda mono; mas de dos canales, a estereo', () => {
    const wav: InfoMedio = { ...notaDeVoz, contenedor: 'wave', audio: { codec: 'pcm-s16', hz: 48_000, canales: 1 } }
    const p = clasificar(wav, TODO, null)
    expect(p.clase !== 'imposible' && p.pasos).toEqual([{ tipo: 'contenedor', de: 'wave' }, { tipo: 'audio', motivo: 'codec', hz: 48_000, canales: 1 }])
    const mp3 = clasificar({ ...notaDeVoz, contenedor: 'mp3', audio: { codec: 'mp3', hz: 22_050, canales: 6 } }, TODO, null)
    // 22,05 kHz no la acepta el codificador AAC: 44,1.
    expect(mp3.clase !== 'imposible' && mp3.pasos.find((x) => x.tipo === 'audio')).toEqual({ tipo: 'audio', motivo: 'codec', hz: 44_100, canales: 2 })
  })

  it('un AAC 5.1 a la frecuencia del libro se recodifica solo por los canales, a estereo', () => {
    const p = clasificar({ ...notaDeVoz, audio: { codec: 'aac', hz: 48_000, canales: 6 } }, TODO, 48_000)
    expect(p.clase !== 'imposible' && p.pasos).toEqual([{ tipo: 'audio', motivo: 'canales', hz: 48_000, canales: 2 }])
  })

  it('un AAC suelto (.aac) solo cambia de caja', () => {
    expect(pasos(clasificar({ ...notaDeVoz, contenedor: 'adts' }, TODO, null))).toEqual(['contenedor:adts'])
  })

  it('Safari antes de la 26 (sin AudioEncoder): un MP3 no se puede, un .m4a a la frecuencia del libro si', () => {
    expect(pasos(clasificar({ ...notaDeVoz, contenedor: 'mp3', audio: { codec: 'mp3', hz: 44_100, canales: 2 } }, SIN_AAC, null))).toEqual(['imposible:sinAac'])
    expect(clasificar(notaDeVoz, SIN_AAC, 48_000).clase).toBe('valido')
    expect(pasos(clasificar(notaDeVoz, SIN_AAC, 44_100))).toEqual(['imposible:sinAac'])
  })

  it('la frecuencia del libro es la del primer audio que la tiene, en el orden del libro', () => {
    const audio = (id: string): Bloque => ({ id, tipo: 'audio', medioId: id, alt: '', decorativa: false })
    const medios = new Map<string, Medio>([
      ['a1', { id: 'a1', nombreOriginal: '', tipo: 'm4a', bytes: 1, crc32: 0, segundos: 1, hz: 48_000 }],
      ['a2', { id: 'a2', nombreOriginal: '', tipo: 'm4a', bytes: 1, crc32: 0, segundos: 1, hz: 44_100 }],
    ])
    const cap = (bloques: Bloque[]) => ({ id: 'c', etiqueta: '', titulo: [], aperturas: [], bloques })
    expect(frecuenciaDelLibro({ capitulos: [cap([audio('a1'), audio('a2')])], extras: [] }, medios)).toBe(48_000)
    expect(frecuenciaDelLibro({ capitulos: [cap([audio('a1'), audio('a2')])], extras: [] }, medios, 'a1')).toBe(44_100)
    expect(frecuenciaDelLibro({ capitulos: [cap([])], extras: [] }, medios)).toBeNull()
  })
})

describe('el negro, el poster y los nombres', () => {
  const lienzo = (rgb: [number, number, number], n = 100, claros = 0): Uint8Array =>
    new Uint8Array(n * 4).map((_, i) => (i % 4 === 3 ? 255 : Math.floor(i / 4) < claros ? 255 : rgb[i % 4] as number))

  it('negro es negro de verdad: oscuro con una farola encendida no lo es', () => {
    expect(esNegro(lienzo([0, 0, 0]))).toBe(true)
    expect(esNegro(lienzo([12, 12, 12]))).toBe(true)
    expect(esNegro(lienzo([0, 0, 0], 100, 5))).toBe(false)
    expect(esNegro(lienzo([40, 40, 40]))).toBe(false)
    expect(esNegro(new Uint8Array(0))).toBe(false)
  })

  it('la muestra para medir el negro lleva siempre fit (Mediabunny lanza sin el)', () => {
    expect(opcionesDeMuestra(1080, 1920)).toEqual({ width: 64, height: 114, fit: 'fill' })
  })

  it('el poster por defecto no cae en el negro del principio ni del final', () => {
    expect(momentoPorDefecto(30)).toBe(3)
    expect(momentoPorDefecto(2)).toBe(0.5)
    expect(momentoPorDefecto(0.4)).toBeCloseTo(0.2)
    expect(momentoPorDefecto(0)).toBe(0)
  })

  it('una imagen subida se recorta al centro a la proporcion del video', () => {
    expect(recorteQueLlena({ ancho: 2000, alto: 1000 }, { ancho: 1080, alto: 1920 })).toEqual({ x: 718.75, y: 0, ancho: 562.5, alto: 1000 })
  })

  it('nombres y numeros que se le enseñan al autor', () => {
    expect([nombreDeCodec('hevc'), nombreDeCodec('pcm-s24'), nombreDeCodec('aac'), nombreDeCodec(null)]).toEqual(['HEVC', 'PCM', 'AAC', '?'])
    expect([duracion(12.4), duracion(725), duracion(3723)]).toEqual(['0:12', '12:05', '1:02:03'])
    expect([frecuencia(44_100, { miles: '.', decimal: ',' }), frecuencia(48_000, { miles: ',', decimal: '.' })]).toEqual(['44,1 kHz', '48 kHz'])
  })

  it('al soltar archivos, se reconocen el audio y el video aunque Safari no diga su tipo', () => {
    const f = (name: string, type = ''): File => new File([new Uint8Array(1)], name, { type })
    expect(mediosDe([f('IMG_0001.MOV'), f('a.png', 'image/png'), f('nota', 'audio/x-m4a'), f('x.txt')]).map((x) => x.name)).toEqual(['IMG_0001.MOV', 'nota'])
  })
})

describe('la lectura real, con Mediabunny', () => {
  const SUELTOS = join(import.meta.dirname, 'fixtures', 'medios-sueltos')
  const blob = (ruta: string): Blob => new Blob([readFileSync(ruta)])

  it('el .mov vertical: H.264, girado en los metadatos, a su tamaño en pantalla', async () => {
    const a = await analizar(blob(join(SUELTOS, 'vertical.mov')))
    // ffmpeg gira 90 en sentido antihorario (`-display_rotation 90`), y
    // Mediabunny cuenta en el horario: 270. Es el mismo giro.
    expect(a?.info).toMatchObject({ contenedor: 'mov', video: { codec: 'avc', ancho: 90, alto: 160, rotacion: 270, hdr: false }, audio: { codec: 'aac', hz: 44_100, canales: 2 } })
    expect(a?.info.segundos).toBeCloseTo(1, 1)
  })

  it('la nota WAV y el MP3', async () => {
    expect((await analizar(blob(join(SUELTOS, 'nota-48k-mono.wav'))))?.info).toMatchObject({ contenedor: 'wave', video: null, audio: { codec: 'pcm-s16', hz: 48_000, canales: 1 } })
    expect((await analizar(blob(join(SUELTOS, 'nota.mp3'))))?.info).toMatchObject({ contenedor: 'mp3', video: null, audio: { codec: 'mp3', hz: 44_100 } })
  })

  it('lo que ya convirtio Pubteca: MPEG-4 con H.264 y AAC', async () => {
    const a = await analizar(blob(join(import.meta.dirname, 'fixtures', 'libro-medios', 'medios', 'cap01-v01.m4v')))
    expect(a?.info).toMatchObject({ contenedor: 'mp4', video: { codec: 'avc', ancho: 160, alto: 90 }, audio: { codec: 'aac' } })
  })

  it('sin WebCodecs (Node), no puede nada: y el plan lo dice en vez de intentarlo', async () => {
    const a = await analizar(blob(join(SUELTOS, 'nota.mp3')))
    expect(a?.puede).toEqual({ decodificaVideo: false, decodificaAudio: false, codificaAvc: false, codificaAac: false })
    expect(pasos(clasificar(a?.info ?? null, a?.puede as Capacidades, null))).toEqual(['imposible:noDecodifica'])
  })

  it('algo que no es audio ni video: null', async () => {
    expect(await analizar(new Blob([new TextEncoder().encode('esto no es un video')]))).toBeNull()
  })
})

describe('el hilo de la conversion y su perro guardian', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Un Worker de mentira que hace lo que le diga el test. */
  function hiloFalso(): HiloConversion & { emitir(m: unknown): void; terminado: boolean; recibido: unknown[] } {
    const h = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      onerror: null as ((e: ErrorEvent) => void) | null,
      terminado: false,
      recibido: [] as unknown[],
      postMessage(m: unknown) {
        h.recibido.push(m)
      },
      terminate() {
        h.terminado = true
      },
      emitir(m: unknown) {
        h.onmessage?.({ data: m } as MessageEvent)
      },
    }
    return h
  }
  const plan = { clase: 'convertible', tipo: 'm4v', pasos: [] } as const

  it('si el hilo se calla, se mata y se dice que se quedo parado', async () => {
    vi.useFakeTimers()
    const h = hiloFalso()
    const t = convertirEnSuHilo(new Blob(), plan, () => undefined, { crearHilo: () => h, parado: 5_000 })
    const fallo = t.hecho.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(6_000)
    const e = (await fallo) as ErrorConversion
    expect(e).toBeInstanceOf(ErrorConversion)
    expect(e.causa).toBe('parado')
    expect(h.terminado).toBe(true)
  })

  it('mientras dé señales (progreso o latido), sigue, aunque tarde', async () => {
    vi.useFakeTimers()
    const h = hiloFalso()
    const progreso: number[] = []
    const t = convertirEnSuHilo(new Blob(), plan, (p) => progreso.push(p), { crearHilo: () => h, parado: 5_000 })
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(4_000)
      h.emitir(i % 2 ? { tipo: 'vivo' } : { tipo: 'progreso', fraccion: i / 10 })
    }
    const datos = new Blob([new Uint8Array(3)])
    h.emitir({ tipo: 'hecho', datos, enMemoria: false })
    expect(await t.hecho).toEqual({ datos, enMemoria: false })
    expect(progreso).toEqual([0, 0.2, 0.4])
    expect(h.terminado).toBe(true)
    expect(h.recibido).toHaveLength(1)
  })

  it('cancelar mata el hilo; un error del hilo se dice como fallo', async () => {
    const h = hiloFalso()
    const t = convertirEnSuHilo(new Blob(), plan, () => undefined, { crearHilo: () => h })
    t.cancelar()
    await expect(t.hecho).rejects.toMatchObject({ causa: 'cancelado' })
    expect(h.terminado).toBe(true)
    const h2 = hiloFalso()
    const t2 = convertirEnSuHilo(new Blob(), plan, () => undefined, { crearHilo: () => h2 })
    h2.emitir({ tipo: 'error', mensaje: 'Encoder failed' })
    await expect(t2.hecho).rejects.toMatchObject({ causa: 'fallo', message: 'Encoder failed' })
  })
})

describe('en el libro: el reductor, la revision y los avisos', () => {
  const video: Bloque = { id: 'v', tipo: 'video', medioId: 'm', posterId: null, alt: '', decorativa: false }
  const audio: Bloque = { id: 'a', tipo: 'audio', medioId: 'm2', alt: '', decorativa: false }
  const proyecto: Proyecto = {
    id: 'p',
    version: 2,
    datos: { ...DATOS_POR_DEFECTO, titulo: 'T' },
    capitulos: [{ id: 'c', etiqueta: 'Capítulo 1', titulo: [{ texto: 'X', marcas: [] }], aperturas: [], bloques: [video, audio] }],
    extras: [],
    laminas: [],
    portada: {},
  }
  const abierto: Estado = reducir(ESTADO_INICIAL, { tipo: 'abrir', proyecto, imagenes: [] } as Accion)
  const donde = { tipo: 'capitulo', id: 'c' } as const

  it('la descripcion, el «decorativo» y el poster cambian en su bloque; un audio no tiene poster', () => {
    let e = reducir(abierto, { tipo: 'medio', donde, bloque: 'v', cambios: { alt: 'El muelle', posterId: 'i1' }, ahora: 1 })
    e = reducir(e, { tipo: 'medio', donde, bloque: 'a', cambios: { decorativa: true, posterId: 'x' }, ahora: 2 })
    const [v, a] = e.proyecto?.capitulos[0]?.bloques ?? []
    expect(v).toEqual({ ...video, alt: 'El muelle', posterId: 'i1' })
    expect(a).toEqual({ ...audio, decorativa: true })
  })

  it('escribir la descripcion letra a letra es UN paso de deshacer', () => {
    let e = abierto
    for (const [i, alt] of ['E', 'El', 'El m'].entries()) e = reducir(e, { tipo: 'medio', donde, bloque: 'v', cambios: { alt }, ahora: 100 + i })
    e = reducir(e, { tipo: 'deshacer' } as Accion)
    expect(e.proyecto?.capitulos[0]?.bloques[0]).toEqual(video)
  })

  it('un video sin poster es un error en la revision, con su «Ir»', () => {
    const medios = new Map<string, Medio>([
      ['m', { id: 'm', nombreOriginal: 'v', tipo: 'm4v', bytes: 1, crc32: 0, segundos: 1 }],
      ['m2', { id: 'm2', nombreOriginal: 'a', tipo: 'm4a', bytes: 1, crc32: 0, segundos: 1 }],
    ])
    expect(revisar(proyecto, new Map(), medios)).toEqual([{ clave: 'sinPoster', nivel: 'error', ir: { capitulo: 'c' }, que: 'Capítulo 1: X' }])
  })

  it('los mensajes del motor sobre medios se agrupan, y cada uno sabe a que tienda le importa', () => {
    const g = agrupar({
      errores: [
        'capitulos/cap01.md: la marca pide «cap01-v01», pero no hay medios/cap01-v01.m4v ni .mp4.',
        'capitulos/cap01.md: el video «cap01-v01» no tiene póster (medios/cap01-v01.jpg o .png). Apple Books no acepta un video sin él.',
        'capitulos/cap01.md: la marca pide «cap01-01», pero no hay ilustraciones/cap01-01.png ni .jpg.',
      ],
      avisos: [],
      notas: [
        'Audio y video sin descripción (la leen los lectores de pantalla): capitulos/cap01.md → cap01-a01; capitulos/cap02.md → cap02-a01',
        '3 videos y 1 audio solo van en el EPUB de Apple Books: KDP no acepta libros con audio ni video, así que el de Kindle sale sin ellos.',
      ],
    })
    expect(g.map((x) => [x.clave, x.nivel, x.elementos.length])).toEqual([
      ['faltaMedio', 'error', 1],
      ['sinPoster', 'error', 1],
      ['faltaImagen', 'error', 1],
      ['medioSinDescripcion', 'nota', 2],
      ['soloApple', 'nota', 0],
    ])
    expect(tiendasDe('soloApple')).toEqual(['kindle'])
    expect(tiendasDe('sinPoster')).toEqual(['apple'])
  })
})
