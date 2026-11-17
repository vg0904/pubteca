/**
 * «Cubierta»: los seis estilos sobre el dibujo del autor, la cubierta entera
 * con su lomo, las opciones, los avisos y el PDF (mas un PNG de vista previa).
 *
 * Se carga con import() (ver Libro.tsx). El lomo sale del interior compuesto:
 * al entrar se compone el libro en su hilo, como en «Libro impreso», y con su
 * numero de paginas se mide el lomo. La cubierta en si se compone aqui mismo:
 * son unos milisegundos.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { componerCubierta, ESTILOS_ORDEN, type CubiertaCompuesta, type FuentesCubierta, type RolCubierta } from '../../core/impreso/cubierta'
import { colorDe, ESCALAS, LIMITE_TINTA, type Ajuste, type ColorCubierta, type ConfigCubierta, type EstiloId, type PiezaContra, type Punto, type QuePieza, type Tono } from '../../core/impreso/cubierta-config'
import { probarFilas, pruebaEnPantalla, type RejillaRgb } from '../../core/impreso/color'
import { escribirCubierta } from '../../core/impreso/pdf-cubierta'
import { nombreSeguro } from '../../core/texto'
import { descargar } from '../copia'
import { codigoSuelto, muestraDelCodigo } from '../cubierta/codigo'
import { jpegDelEbook, medidasDelEbook } from '../cubierta/epub'
import { separarEnHilo } from '../cubierta/cmyk'
import { separacionDe } from '../cubierta/cmyk-motor'
import { CONDICION_PERFIL, perfilCmyk } from '../cubierta/perfil'
import { arrastrada, direccionDeTecla, escalaDe, esDeContra, movibles, movidaDe, paso, piezaEn, type Direccion, type PiezaMovible } from '../cubierta/mover'
import { alineada, colocar, conTamano, esquinaEn, tirarDeEsquina, type Alineacion, type Esquina, type Guia } from '../cubierta/iman'
import { ASA, cursorDeEsquina, pintarCapa } from '../cubierta/capa'
import { avisosDeCubierta } from '../cubierta/avisos'
import { fuentesDeCubierta } from '../cubierta/fuentes'
import { medirDibujo } from '../cubierta/medir'
import { pintarCubierta, pintarSueltas, trazosDeCubierta, type ParaPintarCubierta, type QuePintar } from '../cubierta/pintar'
import { configCubiertaDe, datosDeCubierta, ROLES_CUBIERTA, type Medicion } from '../cubierta/preparar'
import type { Estado } from '../estado'
import { motivoIsbn } from '../isbn'
import { conPpi } from '../../core/png'
import { bytesDeFamilia } from '../impreso/fuentes'
import { ColaDeComposicion } from '../impreso/hilo'
import { configDe, prepararImpreso } from '../impreso/preparar'
import type { AvisoCubierta } from '../../core/impreso/cubierta'
import type { Proyecto } from '../modelo'
import { useDespacho, useMedios, useTextos } from './contexto'

type Ui = ReturnType<typeof useTextos>
type Imagenes = ReadonlyMap<RolCubierta, ImageBitmap>

function Nivel({ nivel }: { nivel: 'aviso' | 'nota' }) {
  const ui = useTextos()
  return (
    <span className={`nivel nivel-${nivel}`}>
      <span aria-hidden="true">{ui.niveles[nivel].icono}</span> {ui.niveles[nivel].palabra}
    </span>
  )
}

/** La cubierta (o un trozo) pintada en un lienzo de `px` de ancho. */
function Lienzo({ c, px, pintar, que, etiqueta }: { c: CubiertaCompuesta; px: number; pintar: ParaPintarCubierta | null; que: QuePintar; etiqueta: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const r = que.region ?? { x: 0, y: 0, ancho: c.medidas.ancho, alto: c.medidas.alto }
  const altoPx = Math.round((px * r.alto) / r.ancho)
  useEffect(() => {
    const el = ref.current
    if (!el || !pintar) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    el.width = Math.round(px * dpr)
    el.height = Math.round(altoPx * dpr)
    const ctx = el.getContext('2d')
    if (ctx) pintarCubierta(ctx, c, el.width / r.ancho, pintar, que)
  }, [c, px, altoPx, pintar, que, r.ancho])
  return <canvas ref={ref} className="lienzo-cubierta" style={{ width: px, height: altoPx }} role="img" aria-label={etiqueta} />
}

/**
 * Un valor con su deslizador y su numero escrito, para afinar: lo que se
 * escribe fuera de rango, o lo que no es numero, no se manda (y al salir del
 * campo vuelve el valor de verdad). Si el valor cambia desde fuera (deshacer,
 * arrastrar), el campo lo sigue.
 */
function NumeroConDeslizador({ etiqueta, valor, min, max, paso, unidad, desactivado = false, alCambiar }: { etiqueta: string; valor: number; min: number; max: number; paso: number; unidad: string; desactivado?: boolean; alCambiar: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valor))
  const [de, setDe] = useState(valor)
  if (de !== valor) {
    setDe(valor)
    setTexto(String(valor))
  }
  const id = useId()
  return (
    <div className="campo-numero">
      <label htmlFor={id}>{etiqueta}</label>
      <input type="range" min={min} max={max} step={paso} value={valor} disabled={desactivado} aria-label={etiqueta} onChange={(e) => alCambiar(Number(e.target.value))} />
      <span className="numero-con-unidad">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={paso}
          value={texto}
          disabled={desactivado}
          onChange={(e) => {
            setTexto(e.target.value)
            const v = Number(e.target.value.replace(',', '.'))
            if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) alCambiar(v)
          }}
          onBlur={() => setTexto(String(valor))}
        />
        <span aria-hidden="true">{unidad}</span>
      </span>
    </div>
  )
}

/**
 * La cubierta entera, con las piezas que se arrastran. Con raton o lapiz se
 * arrastra en el acto; con el dedo, primero se toca la pieza (asi el dedo
 * sigue desplazando la pagina hasta que el autor elige algo).
 *
 * Al arrastrar, la pieza se pega a los centros, a los margenes y a las otras
 * piezas (iman.ts), con Alt suelta; nunca sale de lo seguro ni pisa a otra.
 * Las de la contraportada cambian de tamaño tirando de una esquina del marco.
 * Con el teclado: las flechas afinan 1 mm (5 con Mayusculas), y + y - cambian
 * el tamaño de las de la contraportada.
 *
 * Encima va otro lienzo (capa.ts) con lo que ayuda y no se imprime: los
 * contornos, el marco, las asas y las guias. Asi pasar el raton no repinta la
 * cubierta.
 */
function VistaMovible({
  c,
  pintar,
  que,
  etiqueta,
  nombres,
  elegida,
  alElegir,
  alMover,
  alAjustar,
  prueba,
}: {
  c: CubiertaCompuesta
  pintar: ParaPintarCubierta | null
  que: QuePintar
  etiqueta: string
  nombres: Readonly<Record<PiezaMovible, string>>
  elegida: PiezaMovible | null
  alElegir: (q: PiezaMovible | null) => void
  alMover: (q: PiezaMovible, a: Punto) => void
  alAjustar: (q: PiezaContra, a: Ajuste) => void
  /** La prueba de CMYK: los colores como saldran impresos. */
  prueba: RejillaRgb | null
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const refCapa = useRef<HTMLCanvasElement>(null)
  const px = 760
  const altoPx = Math.round((px * c.medidas.alto) / c.medidas.ancho)
  // La ultima cubierta compuesta: cada cuadro del arrastre parte de lo que de verdad se movio.
  const ultima = useRef(c)
  useEffect(() => {
    ultima.current = c
  }, [c])
  const arrastre = useRef<
    | { modo: 'mover'; que: PiezaMovible; id: number; desde: { x: number; y: number }; base: Punto; cuadro: number }
    | { modo: 'tamano'; que: PiezaContra; esquina: Esquina; id: number; cuadro: number }
    | null
  >(null)
  const [dentro, setDentro] = useState(false)
  const [sobre, setSobre] = useState<PiezaMovible | null>(null)
  const [guias, setGuias] = useState<readonly Guia[]>([])
  const [arrastrando, setArrastrando] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || !pintar) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    el.width = Math.round(px * dpr)
    el.height = Math.round(altoPx * dpr)
    const ctx = el.getContext('2d')
    if (!ctx) return
    const escala = el.width / c.medidas.ancho
    if (!prueba) {
      pintarCubierta(ctx, c, escala, pintar, que)
      return
    }
    // Con la prueba: la cubierta, sus pixeles pasados por el papel, y las guias encima, sin pasar.
    pintarCubierta(ctx, c, escala, pintar, { ...que, guias: false })
    const img = ctx.getImageData(0, 0, el.width, el.height)
    probarFilas(prueba, img.data, el.width, 0, el.height)
    ctx.putImageData(img, 0, 0)
    pintarCubierta(ctx, c, escala, pintar, { capas: false, texto: false, guias: que.guias ?? false, sinFondo: true })
  }, [c, altoPx, pintar, que, prueba])

  // La capa de encima: barata, se repinta con cada cambio del raton.
  useEffect(() => {
    const el = refCapa.current
    if (!el) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const w = Math.round(px * dpr)
    const h = Math.round(altoPx * dpr)
    if (el.width !== w) el.width = w
    if (el.height !== h) el.height = h
    const ctx = el.getContext('2d')
    if (!ctx) return
    // Los pixeles CSS de verdad (la vista encoge con la ventana): asi las rayas y las asas no adelgazan.
    const real = el.getBoundingClientRect().width || px
    pintarCapa(ctx, c, w / c.medidas.ancho, (dpr * px) / real, { dentro, sobre, elegida, nombre: elegida ? nombres[elegida] : '', guias, arrastrando }, w, h)
  }, [c, altoPx, dentro, sobre, elegida, nombres, guias, arrastrando])

  const enHoja = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = (ref.current as HTMLCanvasElement).getBoundingClientRect()
    return { x: ((e.clientX - r.left) * c.medidas.ancho) / r.width, y: ((e.clientY - r.top) * c.medidas.alto) / r.height }
  }
  /** Puntos de la hoja por pixel de pantalla: el iman y las asas se miden en pixeles. */
  const puntosPorPixel = (): number => c.medidas.ancho / ((ref.current as HTMLCanvasElement).getBoundingClientRect().width || px)
  const esquinaBajo = (pt: { x: number; y: number }): Esquina | null => (elegida && esDeContra(elegida) ? esquinaEn(c, elegida, pt.x, pt.y, (ASA / 2 + 4) * puntosPorPixel()) : null)
  const soltar = (): void => {
    const a = arrastre.current
    if (!a) return
    cancelAnimationFrame(a.cuadro)
    arrastre.current = null
    setArrastrando(false)
    setGuias([])
  }
  /** Las flechas: un paso, sin iman, sin salir de lo seguro ni pisar a otra. */
  const mover = (q: PiezaMovible, d: Direccion, mm: number): void => alMover(q, colocar(c, q, paso(c, q, d, mm), { umbral: 0, iman: false }).movida)

  return (
    <div className="lienzo-con-capa" style={{ width: px }}>
      <canvas
        ref={ref}
        className={`lienzo-cubierta lienzo-movible${elegida ? ' con-pieza' : ''}`}
        style={{ width: px, height: altoPx }}
        role="img"
        aria-label={etiqueta}
        tabIndex={0}
        onPointerEnter={() => setDentro(true)}
        onPointerLeave={() => {
          setDentro(false)
          setSobre(null)
        }}
        onPointerDown={(e) => {
          const pt = enHoja(e)
          const esquina = esquinaBajo(pt)
          const q = esquina ? elegida : piezaEn(c, pt.x, pt.y)
          if (!q) {
            alElegir(null)
            return
          }
          const yaElegida = q === elegida
          alElegir(q)
          // El dedo: el primer toque elige; arrastrar, despues (ver touch-action en el CSS).
          if (e.pointerType === 'touch' && !yaElegida) return
          e.preventDefault()
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // Sin captura, el arrastre sigue mientras el puntero no salga del lienzo.
          }
          arrastre.current = esquina && esDeContra(q) ? { modo: 'tamano', que: q, esquina, id: e.pointerId, cuadro: 0 } : { modo: 'mover', que: q, id: e.pointerId, desde: pt, base: movidaDe(c, q), cuadro: 0 }
        }}
        onPointerMove={(e) => {
          const a = arrastre.current
          const pt = enHoja(e)
          if (!a || a.id !== e.pointerId) {
            if (e.pointerType === 'touch') return
            const esquina = esquinaBajo(pt)
            const q = esquina ? elegida : piezaEn(c, pt.x, pt.y)
            setSobre(q)
            e.currentTarget.style.cursor = esquina ? cursorDeEsquina(esquina) : q ? 'move' : ''
            return
          }
          setArrastrando(true)
          const libre = e.altKey
          const umbral = 8 * puntosPorPixel()
          // Un movimiento por cuadro: componer y pintar cada evento seria llegar tarde.
          cancelAnimationFrame(a.cuadro)
          a.cuadro = requestAnimationFrame(() => {
            const k = ultima.current
            if (a.modo === 'tamano') {
              alAjustar(a.que, tirarDeEsquina(k, a.que, a.esquina, pt))
              return
            }
            const r = colocar(k, a.que, arrastrada(k, a.base, a.desde, pt), { umbral, iman: !libre })
            setGuias(r.guias)
            alMover(a.que, r.movida)
          })
        }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            alElegir(null)
            return
          }
          if (elegida && esDeContra(elegida) && (e.key === '+' || e.key === '-')) {
            e.preventDefault()
            alAjustar(elegida, conTamano(c, elegida, escalaDe(c, elegida) + (e.key === '+' ? 0.05 : -0.05)))
            return
          }
          const d = direccionDeTecla(e.key)
          if (!d || !elegida) return
          e.preventDefault()
          mover(elegida, d, e.shiftKey ? 5 : 1)
        }}
      />
      <canvas ref={refCapa} className="capa-de-ayuda" aria-hidden="true" />
    </div>
  )
}

/** Un dibujo para cada boton de alinear: la raya a la que se alinea y la pieza junto a ella. */
function IconoAlinear({ como }: { como: Alineacion }) {
  const vertical = como === 'izquierda' || como === 'centro' || como === 'derecha'
  const en = como === 'izquierda' || como === 'arriba' ? 3 : como === 'derecha' || como === 'abajo' ? 17 : 10
  const pieza = vertical ? { x: en === 3 ? 3 : en === 17 ? 9 : 6, y: 6, w: 8, h: 8 } : { x: 6, y: en === 3 ? 3 : en === 17 ? 9 : 6, w: 8, h: 8 }
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="icono-alinear">
      {vertical ? <line x1={en} y1="1" x2={en} y2="19" /> : <line x1="1" y1={en} x2="19" y2={en} />}
      <rect x={pieza.x} y={pieza.y} width={pieza.w} height={pieza.h} rx="1.5" />
    </svg>
  )
}

function textoDeAviso(a: AvisoCubierta, ui: Ui): string {
  const t = ui.cubierta.avisos
  const f = ui.formato.decimal
  switch (a.codigo) {
    case 'resolucionArte':
      return t.resolucionArte(t.dibujos[a.rol], a.ppi, a.pixeles.ancho, a.pixeles.alto)
    case 'sinPortada':
      return t.sinPortada
    case 'lomoSinTexto':
      return t.lomoSinTexto(a.paginas, a.minimo)
    case 'lomoEstrecho':
      return t.lomoEstrecho
    case 'isotipoOmitido':
      return t.isotipoOmitido(f(a.lomo))
    case 'sinIsotipo':
      return t.sinIsotipo
    case 'codigoSinIsbn':
      return t.codigoSinIsbn
    case 'codigoKdp':
      return t.codigoKdp
    case 'codigoMovido':
      return t.codigoMovido
    case 'velo':
      return t.velo(t.piezas[a.pieza])
    case 'contrasteBajo':
      return t.contrasteBajo(t.piezas[a.pieza], f(a.contraste))
    case 'sinopsisCortada':
      return t.sinopsisCortada
    case 'lomoDeIngram':
      return t.lomoDeIngram
    case 'piezasSeTocan':
      return t.piezasSeTocan(t.piezas[a.a], t.piezas[a.b])
    case 'colorRgb':
      return ui.cubierta.rgb
  }
}

/** Un lienzo de `ancho` × `alto` pixeles: el de fuera de pantalla si lo hay. */
function lienzoDe(ancho: number, alto: number): OffscreenCanvas | HTMLCanvasElement {
  return typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(ancho, alto) : Object.assign(document.createElement('canvas'), { width: ancho, height: alto })
}

async function blobDe(l: OffscreenCanvas | HTMLCanvasElement, tipo: string, calidad?: number): Promise<Blob> {
  if ('convertToBlob' in l) return l.convertToBlob({ type: tipo, ...(calidad !== undefined ? { quality: calidad } : {}) })
  return new Promise((res, rej) => l.toBlob((b) => (b ? res(b) : rej(new Error('El navegador no pudo codificar la imagen.'))), tipo, calidad))
}

export default function PantallaCubierta({ estado }: { estado: Estado }) {
  const ui = useTextos()
  const t = ui.cubierta
  const despachar = useDespacho()
  const { repo } = useMedios()
  const p = estado.proyecto as Proyecto
  const c = configCubiertaDe(p)
  const impreso = configDe(p)
  const cambiar = useCallback((cambios: Partial<ConfigCubierta>) => despachar({ tipo: 'cubierta', cambios, ahora: Date.now() }), [despachar])
  const f = ui.formato.decimal
  const nombreFondo = useId()

  // -- el interior, para el numero de paginas -------------------------------------
  const [anio] = useState(() => new Date().getFullYear())
  const preparado = useMemo(() => prepararImpreso(p, estado.imagenes, anio), [p, estado.imagenes, anio])
  const cola = useMemo(() => new ColaDeComposicion(), [])
  const siguiente = useRef(0)
  const [paginas, setPaginas] = useState<{ para: unknown; n: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const espera = setTimeout(() => {
      void (async () => {
        try {
          const caras = await bytesDeFamilia(preparado.config.fuente)
          const r = await cola.componer({ tipo: 'componer', id: ++siguiente.current, contenido: preparado.contenido, config: preparado.config, imagenes: preparado.imagenes, fuente: { id: preparado.config.fuente, caras } })
          if (!vivo || !r) return
          if (r.tipo === 'componer') setPaginas({ para: preparado.contenido, n: r.impreso.paginas.length })
          else if (r.tipo === 'error') setError(t.error(r.error))
        } catch {
          if (vivo) setError(t.sinFuentes)
        }
      })()
    }, 250)
    return () => {
      vivo = false
      clearTimeout(espera)
    }
  }, [preparado, cola, t])

  // -- las letras, las imagenes y lo que se mide de los dibujos ---------------------
  const [fuentes, setFuentes] = useState<{ id: string; f: FuentesCubierta } | null>(null)
  useEffect(() => {
    let vivo = true
    fuentesDeCubierta(impreso.fuente).then(
      (x) => vivo && setFuentes({ id: impreso.fuente, f: x }),
      () => vivo && setError(t.sinFuentes),
    )
    return () => {
      vivo = false
    }
  }, [impreso.fuente, t])
  const ids = ROLES_CUBIERTA.map((r) => p.portada[r] ?? '').join('|')
  const [imagenes, setImagenes] = useState<{ ids: string; mapa: Imagenes; medidas: Partial<Record<'portada' | 'contraportada', Medicion>> } | null>(null)
  useEffect(() => {
    if (!repo || typeof createImageBitmap !== 'function') return undefined
    let vivo = true
    void (async () => {
      const mapa = new Map<RolCubierta, ImageBitmap>()
      const medidas: Partial<Record<'portada' | 'contraportada', Medicion>> = {}
      for (const rol of ROLES_CUBIERTA) {
        const id = p.portada[rol]
        const blob = id ? repo.blob(id) : undefined
        if (!blob) continue
        try {
          mapa.set(rol, await createImageBitmap(blob))
          if (rol === 'portada' || rol === 'contraportada') medidas[rol] = await medirDibujo(blob)
        } catch {
          // Una imagen que no se decodifica se queda fuera: la cubierta sale igual.
        }
      }
      if (vivo) setImagenes({ ids, mapa, medidas })
    })()
    return () => {
      vivo = false
    }
    // Solo cuando cambian las imagenes, no con cada cambio del libro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, repo])

  // -- la cubierta ------------------------------------------------------------------
  const n = paginas?.n ?? null
  const datos = useMemo(() => (n !== null ? datosDeCubierta(p, estado.imagenes, n, imagenes?.medidas ?? {}) : null), [p, estado.imagenes, n, imagenes])
  const compuesta = useMemo(() => (datos && fuentes ? componerCubierta(datos, c, fuentes.f) : null), [datos, fuentes, c])
  const estilos = useMemo(
    () => (datos && fuentes ? ESTILOS_ORDEN.map((e) => ({ e, c: componerCubierta(datos, { ...c, estilo: e, titulo: null }, fuentes.f) })) : []),
    // Las miniaturas no dependen del estilo elegido ni de las tintas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, fuentes, c.encuadre, c.fondo, c.lomo, c.codigo, c.sinopsis, c.lomoManual, c.autor, c.mover],
  )
  const pintar = useMemo<ParaPintarCubierta | null>(
    () => (fuentes ? { fuentes: fuentes.f, trazo: trazosDeCubierta(fuentes.f), imagen: (rol) => imagenes?.mapa.get(rol) ?? null } : null),
    [fuentes, imagenes],
  )
  const [guias, setGuias] = useState(true)
  // La muestra del codigo cuando la caja queda libre: solo en pantalla.
  const muestra = useMemo(
    () => (compuesta && fuentes ? muestraDelCodigo(compuesta, { sinIsbn: t.opciones.muestraSinIsbn, kdp: t.opciones.muestraKdp }, fuentes.f) : []),
    [compuesta, fuentes, t],
  )
  const queVista = useMemo<QuePintar>(() => ({ capas: true, texto: true, guias, extra: muestra }), [guias, muestra])

  // -- mover las piezas a mano -----------------------------------------------------------
  const [elegidaPedida, setElegida] = useState<PiezaMovible | null>(null)
  const piezasMovibles = useMemo(() => (compuesta ? movibles(compuesta) : []), [compuesta])
  // Si la pieza elegida ya no esta (otro estilo, sin titulo), no hay elegida.
  const elegida = elegidaPedida && piezasMovibles.some((x) => x.que === elegidaPedida) ? elegidaPedida : null
  // Las de la portada, por estilo; las de la contraportada, con su tamaño (el que de verdad tienen).
  const moverPieza = useCallback(
    (pieza: PiezaMovible, a: Punto | null) => {
      if (!esDeContra(pieza)) despachar({ tipo: 'moverPieza', estilo: c.estilo, pieza, a, ahora: Date.now() })
      else despachar({ tipo: 'ajustarContra', pieza, a: a ? { ...a, escala: compuesta ? escalaDe(compuesta, pieza) : 1 } : null, ahora: Date.now() })
    },
    [despachar, c.estilo, compuesta],
  )
  const ajustarPieza = useCallback((pieza: PiezaContra, a: Ajuste) => despachar({ tipo: 'ajustarContra', pieza, a, ahora: Date.now() }), [despachar])
  const movidasDelEstilo = c.mover[c.estilo] ?? {}
  const estaMovida = (q: PiezaMovible): boolean => (esDeContra(q) ? Boolean(c.contra[q]) : Boolean(movidasDelEstilo[q]))
  const hayMovidas = Object.keys(movidasDelEstilo).length > 0 || Object.keys(c.contra).length > 0

  // -- el color del PDF: RGB o CMYK, y la prueba de como sale impreso -----------------------
  const color: ColorCubierta = colorDe(c, impreso.destino)
  const [verPrueba, setVerPrueba] = useState(true)
  const [prueba, setPrueba] = useState<{ limite: number; rejilla: RejillaRgb } | null>(null)
  const limite = LIMITE_TINTA[impreso.destino]
  useEffect(() => {
    if (color !== 'cmyk' || (prueba && prueba.limite === limite)) return undefined
    let vivo = true
    perfilCmyk().then(
      ({ perfil }) => vivo && setPrueba({ limite, rejilla: pruebaEnPantalla(perfil, separacionDe(perfil, limite)) }),
      () => vivo && setError(t.color.sinPerfil),
    )
    return () => {
      vivo = false
    }
  }, [color, limite, prueba, t])
  const pruebaVista = color === 'cmyk' && verPrueba && prueba && prueba.limite === limite ? prueba.rejilla : null

  // -- la portada del ebook ---------------------------------------------------------------
  const [ebook, setEbook] = useState<{ blob: Blob; de: CubiertaCompuesta } | null>(null)
  const [preparandoEbook, setPreparandoEbook] = useState(false)
  const prepararEbook = async (): Promise<void> => {
    if (!compuesta || !pintar) return
    setPreparandoEbook(true)
    try {
      const j = await jpegDelEbook(compuesta, pintar)
      setEbook({ blob: new Blob([j.bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }), de: compuesta })
    } catch (e) {
      setError(t.error(e instanceof Error ? e.message : String(e)))
    } finally {
      setPreparandoEbook(false)
    }
  }

  // -- el codigo suelto (SVG y PNG a 300 ppi) ------------------------------------------
  // Se prepara en cuanto hay ISBN y letras, para que el clic baje el archivo al momento.
  const suelto = useMemo(() => (fuentes ? codigoSuelto(impreso.isbn, fuentes.f) : null), [fuentes, impreso.isbn])
  const [pngCodigo, setPngCodigo] = useState<{ de: string; blob: Blob } | null>(null)
  useEffect(() => {
    if (!suelto || !pintar) return undefined
    let vivo = true
    void (async () => {
      try {
        const k = 300 / 72
        const l = lienzoDe(Math.round(suelto.caja.ancho * k), Math.round(suelto.caja.alto * k))
        const ctx = l.getContext('2d') as CanvasRenderingContext2D | null
        if (!ctx) return
        pintarSueltas(ctx, suelto.ops, suelto.caja, k, pintar)
        const bytes = conPpi(new Uint8Array(await (await blobDe(l, 'image/png')).arrayBuffer()), 300)
        if (vivo) setPngCodigo({ de: suelto.cifras, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }) })
      } catch {
        // Sin PNG, queda el SVG.
      }
    })()
    return () => {
      vivo = false
    }
  }, [suelto, pintar])

  // -- PDF y PNG ---------------------------------------------------------------------
  // El PDF y el PNG se preparan juntos y se bajan con su boton: Safari tira
  // una descarga que llega mas de un segundo despues del clic.
  const [pdf, setPdf] = useState<{ blob: Blob; png: Blob; de: CubiertaCompuesta; color: ColorCubierta } | null>(null)
  const [preparando, setPreparando] = useState(false)
  const nombre = (ext: string): string => `${nombreSeguro(p.datos.titulo) || 'libro'}-cubierta.${ext}`
  const nombreEbook = `${nombreSeguro(p.datos.titulo) || 'libro'}-portada-ebook.jpg`
  const prepararPdf = async (): Promise<void> => {
    if (!compuesta || !fuentes || !pintar) return
    setPreparando(true)
    try {
      // El fondo a 300 ppi, solo las capas: el texto lo pone el PDF en vectores.
      const k = 300 / 72
      const w = Math.round(compuesta.medidas.ancho * k)
      const h = Math.round(compuesta.medidas.alto * k)
      const l = lienzoDe(w, h)
      const ctx = l.getContext('2d') as CanvasRenderingContext2D | null
      if (!ctx) throw new Error('canvas')
      pintarCubierta(ctx, compuesta, k, pintar, { capas: true, texto: false })
      const fondo =
        color === 'cmyk'
          ? // En CMYK: los pixeles del lienzo, separados con el perfil en su hilo (tarda segundos).
            { cmykComprimido: await separarEnHilo(ctx.getImageData(0, 0, w, h).data, w, h, limite), ancho: w, alto: h }
          : { jpeg: new Uint8Array(await (await blobDe(l, 'image/jpeg', 0.92)).arrayBuffer()), ancho: w, alto: h }
      const bytes = escribirCubierta(compuesta, {
        fuentes: fuentes.f,
        fondo,
        titulo: p.datos.titulo,
        autor: p.datos.autor,
        fecha: new Date(),
        ...(color === 'cmyk' ? { condicion: CONDICION_PERFIL } : {}),
      })
      // La vista previa: la misma cubierta con su texto, a 150 ppi.
      const kp = 150 / 72
      const lp = lienzoDe(Math.round(compuesta.medidas.ancho * kp), Math.round(compuesta.medidas.alto * kp))
      const cp = lp.getContext('2d') as CanvasRenderingContext2D | null
      if (!cp) throw new Error('canvas')
      pintarCubierta(cp, compuesta, kp, pintar, { capas: true, texto: true })
      const png = new Blob([conPpi(new Uint8Array(await (await blobDe(lp, 'image/png')).arrayBuffer()), 150) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
      setPdf({ blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), png, de: compuesta, color })
    } catch (e) {
      setError(t.error(e instanceof Error ? e.message : String(e)))
    } finally {
      setPreparando(false)
    }
  }

  const m = compuesta?.medidas
  const avisos = useMemo(() => (compuesta ? avisosDeCubierta(compuesta.avisos) : []), [compuesta])
  const conTitulo = compuesta?.conTitulo ?? false
  const motivo = motivoIsbn(impreso.isbn, ui.impreso.creditos.isbnMal)
  const nombreCodigo = (ext: string): string => `isbn-${suelto?.cifras ?? ''}.${ext}`
  const tono = (que: QuePieza | 'sinopsis' | 'lomo'): Tono => c.tintas[que] ?? 'auto'

  return (
    <div className="pantalla pantalla-cubierta">
      <header className="impreso-cabecera">
        <h1>{t.titulo}</h1>
        <p className="ayuda">{t.intro}</p>
        <p className="alerta nivel-nota compacta">{color === 'cmyk' ? t.color.notaCmyk(f(limite * 100, 0)) : t.rgb}</p>
      </header>

      <div className="medida-en-vivo" role="status" aria-live="polite">
        {m && n !== null ? (
          <p className="medida-cifras">
            <strong>{t.medidas(t.hoja(`${f(m.ancho / 72, 2)} × ${f(m.alto / 72, 2)}`, `${f((m.ancho / 72) * 2.54, 2)} × ${f((m.alto / 72) * 2.54, 2)}`), f((m.lomo / 72) * 25.4, 1), n, t.papeles[impreso.papel])}</strong>
          </p>
        ) : (
          <p className="componiendo">{t.componiendo}</p>
        )}
        {error && <p className="alerta nivel-error compacta">{error}</p>}
      </div>

      <section>
        <h2>{t.estilos.titulo}</h2>
        <p className="ayuda">{t.estilos.ayuda}</p>
        <ul className="estilos-portada">
          {estilos.map(({ e, c: ce }) => (
            <li key={e}>
              <button type="button" className={`estilo-portada${c.estilo === e ? ' elegido' : ''}`} aria-pressed={c.estilo === e} onClick={() => cambiar({ estilo: e as EstiloId, titulo: null })}>
                <Lienzo c={ce} px={110} pintar={pintar} que={{ capas: true, texto: true, region: ce.medidas.portada }} etiqueta={t.estilos.nombres[e]} />
                <strong>{t.estilos.nombres[e]}</strong>
                <span className="ayuda">{t.estilos.descripciones[e]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {compuesta && (
        <section className="vista-cubierta">
          <h2>{t.vista.titulo}</h2>
          <label className="casilla">
            <input type="checkbox" checked={guias} onChange={(e) => setGuias(e.target.checked)} />
            {t.vista.guias}
          </label>
          <div className="vista-con-panel">
            <div>
              <div className="cubierta-entera">
                <VistaMovible c={compuesta} pintar={pintar} que={queVista} etiqueta={t.vista.titulo} nombres={t.mover.piezas} elegida={elegida} alElegir={setElegida} alMover={moverPieza} alAjustar={ajustarPieza} prueba={pruebaVista} />
              </div>
              {guias && <p className="ayuda">{t.vista.ayuda}</p>}
              {muestra.length > 0 && <p className="ayuda">{t.vista.muestra}</p>}
            </div>
            <aside className="panel-vista">
              {piezasMovibles.length > 0 && (
                <fieldset className="opciones-impreso mover-piezas">
                  <legend>{t.mover.titulo}</legend>
                  <p className="ayuda">{t.mover.ayuda}</p>
                  {(['portada', 'contraportada'] as const).map((lado) => {
                    const del = piezasMovibles.filter(({ que }) => esDeContra(que) === (lado === 'contraportada'))
                    if (del.length === 0) return null
                    return (
                      <div key={lado} className="fila-opciones" role="radiogroup" aria-label={t.mover.lados[lado]}>
                        <strong className="lado">{t.mover.lados[lado]}</strong>
                        {del.map(({ que }) => (
                          <label key={que} className="casilla">
                            <input type="radio" name={`${nombreFondo}-pieza`} checked={elegida === que} onChange={() => setElegida(que)} />
                            {t.mover.piezas[que]}
                            {estaMovida(que) && <span className="ayuda"> · {t.mover.movida}</span>}
                          </label>
                        ))}
                      </div>
                    )
                  })}
                  <div className="alinear" role="group" aria-label={t.mover.alinear.titulo}>
                    <span className="ayuda">{t.mover.alinear.titulo}</span>
                    {(['izquierda', 'centro', 'derecha', 'arriba', 'medio', 'abajo'] as const satisfies readonly Alineacion[]).map((como) => (
                      <button key={como} type="button" className="boton-secundario" disabled={!elegida} title={t.mover.alinear.ayudas[como]} onClick={() => elegida && moverPieza(elegida, alineada(compuesta, elegida, como))}>
                        <IconoAlinear como={como} />
                        <span>{t.mover.alinear.nombres[como]}</span>
                      </button>
                    ))}
                  </div>
                  {elegida && esDeContra(elegida) && (
                    <>
                      <NumeroConDeslizador
                        etiqueta={t.mover.tamano}
                        valor={Math.round(escalaDe(compuesta, elegida) * 100)}
                        min={ESCALAS[elegida].min * 100}
                        max={ESCALAS[elegida].max * 100}
                        paso={1}
                        unidad="%"
                        alCambiar={(v) => ajustarPieza(elegida, conTamano(compuesta, elegida, v / 100))}
                      />
                      {elegida === 'codigo' && <p className="ayuda">{t.mover.tamanoCodigo}</p>}
                    </>
                  )}
                  {!compuesta.codigoMovible && <p className="ayuda">{t.mover.codigoFijo}</p>}
                  <div className="flechas">
                    <button type="button" className="boton-secundario" disabled={!elegida || !estaMovida(elegida)} onClick={() => elegida && moverPieza(elegida, null)}>
                      {t.mover.aSuSitio}
                    </button>
                    <button type="button" className="boton-secundario" disabled={!hayMovidas} onClick={() => cambiar({ mover: { ...c.mover, [c.estilo]: {} }, contra: {} })}>
                      {t.mover.todas}
                    </button>
                  </div>
                </fieldset>
              )}
              <fieldset className="opciones-impreso">
                <legend>{t.encuadre.titulo}</legend>
                <p className="ayuda">{t.encuadre.ayuda}</p>
                {(['portada', 'contraportada'] as const)
                  .filter((rol) => compuesta.encuadres[rol])
                  .map((rol) => {
                    const valor = rol === 'portada' ? c.encuadre : c.encuadreContra
                    const libre = compuesta.encuadres[rol] as { x: boolean; y: boolean }
                    const poner = (eje: 'x' | 'y', v: number): void => cambiar(rol === 'portada' ? { encuadre: { ...c.encuadre, [eje]: v } } : { encuadreContra: { ...c.encuadreContra, [eje]: v } })
                    return (
                      <div key={rol} className="encuadre-dibujo">
                        <strong>{t.encuadre[rol]}</strong>
                        {(['x', 'y'] as const).map((eje) => (
                          <NumeroConDeslizador
                            key={eje}
                            etiqueta={eje === 'x' ? t.encuadre.horizontal : t.encuadre.vertical}
                            valor={Math.round(valor[eje] * 1000) / 10}
                            min={0}
                            max={100}
                            paso={0.1}
                            unidad="%"
                            desactivado={!libre[eje]}
                            alCambiar={(v) => poner(eje, v / 100)}
                          />
                        ))}
                        {!libre.x && !libre.y ? <p className="ayuda">{t.encuadre.cabeEntero}</p> : (!libre.x || !libre.y) && <p className="ayuda">{t.encuadre.cabe(!libre.x ? t.encuadre.horizontal : t.encuadre.vertical)}</p>}
                      </div>
                    )
                  })}
                {!compuesta.encuadres.portada && <p className="ayuda">{t.encuadre.sinDibujo}</p>}
              </fieldset>
            </aside>
          </div>
        </section>
      )}

      <div className="impreso-cuerpo">
        <div className="impreso-opciones">
          <fieldset className="opciones-impreso">
            <legend>{t.opciones.titulo}</legend>
            <label className="casilla">
              <input type="checkbox" checked={conTitulo} onChange={(e) => cambiar({ titulo: e.target.checked })} />
              {t.opciones.conTitulo}
            </label>
            <p className="ayuda">{t.opciones.conTituloAyuda}</p>
            <label className="casilla">
              <input type="checkbox" checked={c.autor} onChange={(e) => cambiar({ autor: e.target.checked })} />
              {t.opciones.conAutor}
            </label>
            <p className="ayuda">{t.opciones.conAutorAyuda}</p>
            <label className="casilla">
              <input type="checkbox" checked={c.sinopsis} onChange={(e) => cambiar({ sinopsis: e.target.checked })} />
              {t.opciones.sinopsis}
            </label>
            <p className="ayuda">{t.opciones.sinopsisAyuda}</p>
            <fieldset className="opciones-impreso">
              <legend>{t.opciones.codigo}</legend>
              {(['generar', 'kdp'] as const).map((v) => (
                <label key={v} className="casilla">
                  <input type="radio" name={`${nombreFondo}-codigo`} checked={c.codigo === v} onChange={() => cambiar({ codigo: v })} />
                  {t.opciones[v]}
                </label>
              ))}
              {c.codigo === 'generar' && !suelto && <p className="alerta nivel-aviso compacta">{motivo ?? t.opciones.sinIsbn}</p>}
              {suelto && (
                <>
                  <p className="ayuda">{t.opciones.suelto}</p>
                  <div className="descargas">
                    <button type="button" className="boton-secundario" onClick={() => descargar(new Blob([suelto.svg], { type: 'image/svg+xml' }), nombreCodigo('svg'), 'image/svg+xml')}>
                      {t.opciones.svg}
                    </button>
                    {pngCodigo && pngCodigo.de === suelto.cifras && (
                      <button type="button" className="boton-secundario" onClick={() => descargar(pngCodigo.blob, nombreCodigo('png'), 'image/png')}>
                        {t.opciones.png300}
                      </button>
                    )}
                  </div>
                </>
              )}
            </fieldset>
            <fieldset className="opciones-impreso">
              <legend>{t.opciones.lomo}</legend>
              {(['descendente', 'ascendente'] as const).map((v) => (
                <label key={v} className="casilla">
                  <input type="radio" name={`${nombreFondo}-lomo`} checked={c.lomo === v} onChange={() => cambiar({ lomo: v })} />
                  {t.opciones[v]}
                </label>
              ))}
            </fieldset>
            {impreso.destino !== 'kdp' && (
              <label className="campo">
                <span>{t.lomoManual}</span>
                <input type="number" inputMode="decimal" min={0} max={120} step={0.1} value={c.lomoManual} onChange={(e) => cambiar({ lomoManual: Number(e.target.value.replace(',', '.')) || 0 })} />
                <small>{t.lomoManualAyuda}</small>
              </label>
            )}
          </fieldset>


          <fieldset className="opciones-impreso">
            <legend>{t.opciones.fondo}</legend>
            <div className="fila-opciones">
              <input type="color" aria-label={t.opciones.fondo} value={c.fondo || datos?.bordePortada || '#1b2944'} onChange={(e) => cambiar({ fondo: e.target.value })} />
              <button type="button" className="boton-secundario" disabled={!c.fondo} onClick={() => cambiar({ fondo: '' })}>
                {t.opciones.fondoAuto}
              </button>
            </div>
          </fieldset>

          <fieldset className="opciones-impreso">
            <legend>{t.opciones.tintas}</legend>
            {(['titulo', 'autor', 'sello', 'sinopsis', 'lomo'] as const).map((que) => (
              <label key={que} className="campo campo-en-linea">
                <span>{t.opciones.piezas[que]}</span>
                <select value={tono(que)} onChange={(e) => cambiar({ tintas: { [que]: e.target.value as Tono } })}>
                  {(['auto', 'clara', 'oscura'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t.opciones.tinta[v]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="impreso-resultado">
          <section className="avisos-impreso">
            <h2>{t.avisos.titulo}</h2>
            {avisos.length === 0 ? (
              <p className="todo-bien">{t.avisos.todoBien}</p>
            ) : (
              <ul className="revision">
                {avisos.map(({ aviso, nivel }, i) => (
                  <li key={i} className={`nivel-${nivel}`}>
                    <Nivel nivel={nivel} />
                    <span className="revision-texto">{textoDeAviso(aviso, ui)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="pdf-impreso">
            <h2>{t.pdf.titulo}</h2>
            <p className="ayuda">{t.pdf.ayuda}</p>
            <fieldset className="opciones-impreso color-pdf">
              <legend>{t.color.titulo}</legend>
              {(['rgb', 'cmyk'] as const).map((v) => (
                <div key={v}>
                  <label className="casilla">
                    <input type="radio" name={`${nombreFondo}-color`} checked={color === v} onChange={() => cambiar({ color: v })} />
                    <strong>{t.color.nombres[v]}</strong>
                    {colorDe({ color: null }, impreso.destino) === v && <span className="ayuda"> · {t.color.recomendado(t.color.destinos[impreso.destino])}</span>}
                  </label>
                  <p className="ayuda">{v === 'rgb' ? t.color.ayudaRgb : t.color.ayudaCmyk(f(limite * 100, 0))}</p>
                </div>
              ))}
              {color === 'cmyk' && (
                <label className="casilla">
                  <input type="checkbox" checked={verPrueba} onChange={(e) => setVerPrueba(e.target.checked)} />
                  {t.color.prueba}
                </label>
              )}
              <p className="ayuda">{t.color.pantallas}</p>
            </fieldset>
            <div className="descargas">
              <button type="button" className="boton-principal" disabled={!compuesta || !pintar || preparando} onClick={() => void prepararPdf()}>
                {preparando ? (color === 'cmyk' ? t.color.preparando : t.pdf.preparando) : t.pdf.preparar}
              </button>
              {pdf && pdf.de === compuesta && pdf.color === color && (
                <button type="button" className="boton-descarga" onClick={() => descargar(pdf.blob, nombre('pdf'), 'application/pdf')}>
                  <strong>{t.pdf.descargar(ui.formato.tamano(pdf.blob.size))}</strong>
                  <span>{nombre('pdf')}</span>
                </button>
              )}
              {pdf && pdf.de === compuesta && pdf.color === color && (
                <button type="button" className="boton-secundario" onClick={() => descargar(pdf.png, nombre('png'), 'image/png')}>
                  {t.pdf.png}
                </button>
              )}
            </div>
            {pdf && (pdf.de !== compuesta || pdf.color !== color) && <p className="alerta nivel-aviso compacta">{t.pdf.desactualizado}</p>}
          </section>
          <section className="pdf-impreso">
            <h2>{t.ebook.titulo}</h2>
            <p className="ayuda">{t.ebook.ayuda}</p>
            <label className="casilla">
              <input type="checkbox" checked={c.enEpub} onChange={(e) => cambiar({ enEpub: e.target.checked })} />
              {t.ebook.enEpub}
            </label>
            <p className="ayuda">{t.ebook.enEpubAyuda}</p>
            <div className="descargas">
              <button type="button" className="boton-secundario" disabled={!compuesta || !pintar || preparandoEbook} onClick={() => void prepararEbook()}>
                {preparandoEbook ? t.ebook.preparando : compuesta ? t.ebook.preparar(medidasDelEbook(compuesta).ancho, medidasDelEbook(compuesta).alto) : t.ebook.preparar(0, 0)}
              </button>
              {ebook && ebook.de === compuesta && (
                <button type="button" className="boton-descarga" onClick={() => descargar(ebook.blob, nombreEbook, 'image/jpeg')}>
                  <strong>{t.ebook.descargar(ui.formato.tamano(ebook.blob.size))}</strong>
                  <span>{nombreEbook}</span>
                </button>
              )}
            </div>
            {ebook && ebook.de !== compuesta && <p className="alerta nivel-aviso compacta">{t.pdf.desactualizado}</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
