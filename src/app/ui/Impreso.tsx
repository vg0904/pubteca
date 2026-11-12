/**
 * «Libro impreso»: las opciones del interior, la medida en vivo, el plan de
 * paginas en pares y el PDF para imprenta.
 *
 * Se carga con import() (ver Libro.tsx): el compositor, los patrones de
 * particion y las letras solo los descarga quien entra aqui.
 *
 * Cada cambio recompone el libro entero en su hilo (ver impreso/hilo.ts) y la
 * vista previa pinta las MISMAS operaciones que luego escribe el PDF. El PDF
 * sale de la ultima composicion, la que el autor esta viendo.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { RANGOS, interlineaDe, type ConfigImpreso, type ExtraImpreso, type Margenes } from '../../core/impreso/config'
import { FAMILIAS } from '../../core/impreso/familias'
import { CORTES, DESTINOS } from '../../core/impreso/formatos'
import type { ImagenGris } from '../../core/impreso/pdf'
import type { Impreso, Pieza } from '../../core/impreso/plan'
import type { AvisoImpreso, Fuentes, PaginaCompuesta } from '../../core/impreso/tipos'
import { nombreSeguro } from '../../core/texto'
import { descargar } from '../copia'
import type { Estado } from '../estado'
import { motivoIsbn } from '../isbn'
import { agruparAvisos, type GrupoImpreso } from '../impreso/avisos'
import { bytesDeFamilia, fuentesDeFamilia } from '../impreso/fuentes'
import { imagenEnGris, pixelesDestino, tamanosImpresos } from '../impreso/grises'
import { ColaDeComposicion, pedirAlImpreso } from '../impreso/hilo'
import { cacheDeTrazos, pintarPagina, type ParaPintar } from '../impreso/lienzo'
import type { PedidoComponer } from '../impreso/motor'
import { configDe, extrasDelImpreso, prepararImpreso } from '../impreso/preparar'
import { textoDeTramos, type Extra, type Proyecto } from '../modelo'
import { useDespacho, useMedios, useTextos } from './contexto'

type Ui = ReturnType<typeof useTextos>

/** Un renglon de aviso: icono Y palabra, nunca solo color. */
function Nivel({ nivel }: { nivel: 'aviso' | 'nota' }) {
  const ui = useTextos()
  return (
    <span className={`nivel nivel-${nivel}`}>
      <span aria-hidden="true">{ui.niveles[nivel].icono}</span> {ui.niveles[nivel].palabra}
    </span>
  )
}

/** Un grupo de radios con su leyenda y, si la hay, su frase. */
function Opciones<T extends string>({ leyenda, valor, opciones, alCambiar, ayuda }: { leyenda: string; valor: T; opciones: readonly (readonly [T, string])[]; alCambiar: (v: T) => void; ayuda?: string }) {
  // Con nombre: las flechas recorren el grupo, como en cualquier formulario.
  const nombre = useId()
  return (
    <fieldset className="opciones-impreso">
      <legend>{leyenda}</legend>
      {opciones.map(([v, etiqueta]) => (
        <label key={v} className="casilla">
          <input type="radio" name={nombre} checked={valor === v} onChange={() => alCambiar(v)} />
          {etiqueta}
        </label>
      ))}
      {ayuda && <p className="ayuda">{ayuda}</p>}
    </fieldset>
  )
}

/** Un deslizador con su valor escrito al lado. */
function Deslizador({ etiqueta, valor, texto, min, max, paso, alCambiar, ayuda }: { etiqueta: string; valor: number; texto: string; min: number; max: number; paso: number; alCambiar: (v: number) => void; ayuda: string }) {
  return (
    <label className="campo">
      <span>
        {etiqueta} · <output>{texto}</output>
      </span>
      <input type="range" min={min} max={max} step={paso} value={valor} onChange={(e) => alCambiar(Number(e.target.value))} />
      <small>{ayuda}</small>
    </label>
  )
}

/** Un numero en milimetros. Lo vacio o lo que no es numero no se manda. */
function Milimetros({ etiqueta, valor, alCambiar, min = RANGOS.margen.min, max = RANGOS.margen.max }: { etiqueta: string; valor: number; alCambiar: (v: number) => void; min?: number; max?: number }) {
  const [texto, setTexto] = useState(String(valor))
  const [de, setDe] = useState(valor)
  // Si el valor cambia desde fuera (deshacer), el campo lo sigue.
  if (de !== valor) {
    setDe(valor)
    setTexto(String(valor))
  }
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={0.5}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          const v = Number(e.target.value.replace(',', '.'))
          if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) alCambiar(v)
        }}
      />
    </label>
  )
}

/** El nombre de un extra para el autor: su titulo, o lo que es. */
function nombreDeExtra(x: Extra, ui: Ui): string {
  if (x.tipo === 'dedicatoria') return ui.impreso.paginas.dedicatoria
  if (x.tipo === 'epigrafe') return ui.impreso.paginas.epigrafe
  return textoDeTramos(x.titulo) || x.nombreArchivo || ui.impreso.plan.clases.extra
}

/** Las paginas extra del impreso: si van, antes o despues, y su orden. */
function ExtrasDelImpreso({ p, cambiar }: { p: Proyecto; cambiar: (c: Partial<ConfigImpreso>) => void }) {
  const ui = useTextos()
  const t = ui.impreso.paginas
  const orden = extrasDelImpreso(p)
  const porId = new Map(p.extras.map((x) => [x.id, x]))
  if (orden.length === 0) return <p className="ayuda">{t.sinExtras}</p>
  const poner = (nuevo: readonly ExtraImpreso[]): void => cambiar({ extras: nuevo })
  const mover = (i: number, delta: -1 | 1): void => {
    const j = i + delta
    const a = orden[i]
    const b = orden[j]
    if (!a || !b || a.donde !== b.donde) return
    const n = [...orden]
    n[i] = b
    n[j] = a
    poner(n)
  }
  return (
    <ol className="extras-impreso">
      {orden.map((e, i) => {
        const x = porId.get(e.id)
        if (!x) return null
        const nombre = nombreDeExtra(x, ui)
        return (
          <li key={e.id} className={e.incluir ? '' : 'fuera'}>
            <label className="casilla">
              <input type="checkbox" checked={e.incluir} onChange={(ev) => poner(orden.map((y) => (y.id === e.id ? { ...y, incluir: ev.target.checked } : y)))} />
              <strong>{nombre}</strong>
            </label>
            <select
              aria-label={`${nombre}: ${t.antes} / ${t.despues}`}
              value={e.donde}
              disabled={!e.incluir}
              onChange={(ev) => {
                const donde = ev.target.value === 'final' ? 'final' : 'inicio'
                // Al cambiar de grupo va al final del nuevo: ordenDeExtras pone las de inicio delante.
                poner([...orden.filter((y) => y.id !== e.id), { ...e, donde }])
              }}
            >
              <option value="inicio">{t.antes}</option>
              <option value="final">{t.despues}</option>
            </select>
            <span className="mover">
              <button type="button" className="boton-icono" aria-label={`${t.subir}: ${nombre}`} title={t.subir} disabled={orden[i - 1]?.donde !== e.donde} onClick={() => mover(i, -1)}>
                ↑
              </button>
              <button type="button" className="boton-icono" aria-label={`${t.bajar}: ${nombre}`} title={t.bajar} disabled={orden[i + 1]?.donde !== e.donde} onClick={() => mover(i, 1)}>
                ↓
              </button>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Lo que dice cada grupo de avisos, en palabras. */
function textoDeGrupo(g: GrupoImpreso, ui: Ui, nombreImagen: (clave: string) => string): string {
  const t = ui.impreso.avisos
  const f = ui.formato.decimal
  const casos = g.casos as readonly AvisoImpreso[]
  const lista = (xs: readonly string[]): string => [...new Set(xs)].join(', ')
  const primero = casos[0] as AvisoImpreso
  switch (primero.codigo) {
    case 'faltanGlifos':
      return t.faltanGlifos(lista(casos.flatMap((a) => (a.codigo === 'faltanGlifos' ? [...a.caracteres] : []))))
    case 'adornoSinGlifo':
      return t.adornoSinGlifo(primero.adorno, primero.usado)
    case 'lineaDesbordada':
      return t.lineaDesbordada(lista(casos.map((a) => (a.codigo === 'lineaDesbordada' ? String(a.pagina) : ''))))
    case 'guionEnImpar':
      return t.guionEnImpar(lista(casos.map((a) => (a.codigo === 'guionEnImpar' ? String(a.pagina) : ''))))
    case 'ilustracionPerdida':
      return t.ilustracionPerdida(lista(casos.map((a) => (a.codigo === 'ilustracionPerdida' ? a.nombre : ''))))
    case 'sinParticion':
      return t.sinParticion(ui.descargar.idiomas[primero.idioma] ?? primero.idioma)
    case 'resolucionBaja':
      return t.resolucionBaja(lista(casos.map((a) => (a.codigo === 'resolucionBaja' ? t.ppi(nombreImagen(a.nombre), a.ppi) : ''))))
    case 'margenSubido':
      return t.margenSubido(
        lista(casos.map((a) => (a.codigo === 'margenSubido' ? t.margen(ui.impreso.margenes[a.lado], f(a.elegido), f(a.usado), t.porque[a.porque]) : ''))),
      )
    case 'paginasFueraDeRango':
      return t.paginasFueraDeRango(primero.paginas, primero.min, primero.max)
    case 'medidaFuera':
      return t.medidaFuera(primero.caracteres)
    case 'mediosFuera':
      return t.mediosFuera(primero.medios)
    case 'laminasOmitidas':
      return t.laminasOmitidas(primero.laminas)
    case 'isbnNoValido':
      return t.isbnNoValido(primero.isbn, motivoIsbn(primero.isbn, ui.impreso.creditos.isbnMal) ?? '')
    case 'sinIsbn':
      return t.sinIsbn
    case 'blancasSeguidas':
      return t.blancasSeguidas(primero.cuantas, primero.desde)
  }
}

/** Una pagina pintada en un lienzo, cuando entra en pantalla (con 300 paginas no se pintan todas de golpe). */
function Lienzo({ pagina, ancho, alto, px, pintar, etiqueta }: { pagina: PaginaCompuesta; ancho: number; alto: number; px: number; pintar: ParaPintar | null; etiqueta: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // Sin IntersectionObserver (un navegador viejo) se pinta todo de una vez.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver !== 'function')
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return undefined
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  const altoPx = Math.round((px * alto) / ancho)
  useEffect(() => {
    const el = ref.current
    if (!visible || !pintar || !el) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    el.width = Math.round(px * dpr)
    el.height = Math.round(altoPx * dpr)
    const ctx = el.getContext('2d')
    if (ctx) pintarPagina(ctx, pagina, ancho, alto, el.width / ancho, pintar)
  }, [visible, pintar, pagina, ancho, alto, px, altoPx])
  return <canvas ref={ref} className="pagina-impresa" style={{ width: px, height: altoPx }} role="img" aria-label={etiqueta} />
}

/** Como se llama una pagina en el plan: «Capítulo 3», «Créditos», «en blanco». */
function etiquetaDe(p: PaginaCompuesta, piezas: readonly Pieza[], ui: Ui): string {
  const t = ui.impreso.plan
  if (p.tipo === 'blanca') return t.blanca
  const pz = piezas[p.seccion]
  if (!pz) return t.pagina(p.numero)
  if (pz.clase === 'capitulo') return pz.numero ?? (pz.titulo || t.clases.capitulo)
  if (pz.clase === 'extra' || pz.clase === 'lamina') return pz.titulo || t.clases[pz.clase]
  return t.clases[pz.clase]
}

/** Las paginas en pares, como el libro abierto: la 1 sola a la derecha. */
function pliegos(paginas: readonly PaginaCompuesta[]): (PaginaCompuesta | null)[][] {
  const r: (PaginaCompuesta | null)[][] = [[null, paginas[0] ?? null]]
  for (let i = 1; i < paginas.length; i += 2) r.push([paginas[i] ?? null, paginas[i + 1] ?? null])
  return r
}

function VerPagina({ impreso, i, pintar, alCambiar, alCerrar }: { impreso: Impreso; i: number; pintar: ParaPintar | null; alCambiar: (i: number) => void; alCerrar: () => void }) {
  const ui = useTextos()
  const t = ui.impreso.plan
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal?.()
  }, [])
  const p = impreso.paginas[i] as PaginaCompuesta
  const { ancho, alto } = impreso.formato
  const px = Math.min(520, (typeof window === 'undefined' ? 520 : window.innerWidth) - 64, Math.round(((typeof window === 'undefined' ? 800 : window.innerHeight) - 170) * (ancho / alto)))
  return (
    <dialog
      ref={ref}
      className="ajustar ver-pagina"
      onClose={alCerrar}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' && i > 0) alCambiar(i - 1)
        if (e.key === 'ArrowRight' && i < impreso.paginas.length - 1) alCambiar(i + 1)
      }}
    >
      <header>
        <h2>
          {t.pagina(p.numero)} · {etiquetaDe(p, impreso.piezas, ui)}
          {p.folio && <span className="ayuda"> · {t.folio(p.folio)}</span>}
        </h2>
        <button type="button" className="cerrar" aria-label={ui.cerrar} onClick={() => ref.current?.close()}>
          ×
        </button>
      </header>
      <div className="ver-pagina-hoja">
        <Lienzo pagina={p} ancho={ancho} alto={alto} px={Math.max(160, px)} pintar={pintar} etiqueta={`${t.pagina(p.numero)} · ${etiquetaDe(p, impreso.piezas, ui)}`} />
      </div>
      <div className="ver-pagina-mandos">
        <button type="button" className="boton-secundario" disabled={i === 0} onClick={() => alCambiar(i - 1)}>
          ← {t.anterior}
        </button>
        <button type="button" className="boton-secundario" disabled={i >= impreso.paginas.length - 1} onClick={() => alCambiar(i + 1)}>
          {t.siguiente} →
        </button>
      </div>
    </dialog>
  )
}

function PlanDePaginas({ impreso, pintar }: { impreso: Impreso; pintar: ParaPintar | null }) {
  const ui = useTextos()
  const t = ui.impreso.plan
  const [viendo, setViendo] = useState<number | null>(null)
  const { ancho, alto } = impreso.formato
  const px = 84
  return (
    <section className="plan-de-paginas">
      <h2>{t.titulo}</h2>
      <p className="ayuda">{t.ayuda}</p>
      <ol className="pliegos">
        {pliegos(impreso.paginas).map((par, k) => (
          <li key={k} className="pliego">
            {par.map((p, lado) =>
              p ? (
                <button key={p.numero} type="button" className={`hoja hoja-${p.numero % 2 === 1 ? 'impar' : 'par'}${p.tipo === 'blanca' ? ' en-blanco' : ''}`} onClick={() => setViendo(p.numero - 1)} title={`${t.pagina(p.numero)} · ${etiquetaDe(p, impreso.piezas, ui)}`}>
                  <Lienzo pagina={p} ancho={ancho} alto={alto} px={px} pintar={pintar} etiqueta={`${t.pagina(p.numero)} · ${etiquetaDe(p, impreso.piezas, ui)}`} />
                  <span className="hoja-pie">
                    <span className="hoja-numero">{p.numero}</span> {etiquetaDe(p, impreso.piezas, ui)}
                  </span>
                </button>
              ) : (
                <span key={`vacio-${lado}`} className="hoja hoja-vacia" style={{ width: px }} aria-hidden="true" />
              ),
            )}
          </li>
        ))}
      </ol>
      {viendo !== null && impreso.paginas[viendo] && <VerPagina impreso={impreso} i={viendo} pintar={pintar} alCambiar={setViendo} alCerrar={() => setViendo(null)} />}
    </section>
  )
}

interface Compuesto {
  readonly pedido: PedidoComponer
  readonly impreso: Impreso
}

export default function PantallaImpreso({ estado }: { estado: Estado }) {
  const ui = useTextos()
  const t = ui.impreso
  const despachar = useDespacho()
  const { repo } = useMedios()
  const p = estado.proyecto as Proyecto
  const c = configDe(p)
  const cambiar = useCallback((cambios: Partial<ConfigImpreso>) => despachar({ tipo: 'impreso', cambios, ahora: Date.now() }), [despachar])
  const f = ui.formato.decimal

  // -- componer, en su hilo, cada vez que cambia algo ---------------------------
  // El año de los creditos: el de cuando se abrio la pantalla.
  const [anio] = useState(() => new Date().getFullYear())
  const preparado = useMemo(() => prepararImpreso(p, estado.imagenes, anio), [p, estado.imagenes, anio])
  const cola = useMemo(() => new ColaDeComposicion(), [])
  const siguienteId = useRef(0)
  const [compuesto, setCompuesto] = useState<Compuesto | null>(null)
  const [error, setError] = useState<{ para: unknown; texto: string } | null>(null)
  useEffect(() => {
    let vivo = true
    const espera = setTimeout(() => {
      void (async () => {
        try {
          const caras = await bytesDeFamilia(preparado.config.fuente)
          const pedido: PedidoComponer = { tipo: 'componer', id: ++siguienteId.current, contenido: preparado.contenido, config: preparado.config, imagenes: preparado.imagenes, fuente: { id: preparado.config.fuente, caras } }
          const r = await cola.componer(pedido)
          if (!vivo || !r) return
          if (r.tipo === 'componer') {
            setCompuesto({ pedido, impreso: r.impreso })
            setError(null)
          } else if (r.tipo === 'error') setError({ para: preparado, texto: t.error(r.error) })
        } catch {
          if (vivo) setError({ para: preparado, texto: t.sinFuentes })
        }
      })()
    }, 220)
    return () => {
      vivo = false
      clearTimeout(espera)
    }
  }, [preparado, cola, t])
  const impreso = compuesto?.impreso ?? null
  const componiendo = compuesto === null || compuesto.pedido.contenido !== preparado.contenido || compuesto.pedido.config !== preparado.config

  // -- pintar: la letra para los contornos, y las imagenes del libro ------------
  const [fuentes, setFuentes] = useState<{ id: string; f: Fuentes } | null>(null)
  useEffect(() => {
    let vivo = true
    fuentesDeFamilia(c.fuente).then(
      (x) => vivo && setFuentes({ id: c.fuente, f: x }),
      () => undefined,
    )
    return () => {
      vivo = false
    }
  }, [c.fuente])
  const [bitmaps, setBitmaps] = useState<ReadonlyMap<string, ImageBitmap>>(new Map())
  useEffect(() => {
    if (!impreso || !repo || typeof createImageBitmap !== 'function') return undefined
    let vivo = true
    const faltan = [...tamanosImpresos(impreso.paginas).keys()].filter((k) => !bitmaps.has(k))
    if (faltan.length === 0) return undefined
    void (async () => {
      const nuevas = new Map(bitmaps)
      for (const k of faltan) {
        const id = preparado.idDeClave.get(k)
        const blob = id ? repo.blob(id) : undefined
        if (!blob) continue
        try {
          nuevas.set(k, await createImageBitmap(blob))
        } catch {
          // Sin decodificar se pinta un recuadro gris: la vista previa no se rompe por una imagen.
        }
      }
      if (vivo) setBitmaps(nuevas)
    })()
    return () => {
      vivo = false
    }
  }, [impreso, repo, preparado, bitmaps])
  const pintar = useMemo<ParaPintar | null>(() => {
    // La letra que se pinta tiene que ser la de la composicion que se ve.
    if (!fuentes || !compuesto || fuentes.id !== compuesto.pedido.fuente.id) return null
    return { fuentes: fuentes.f, trazo: cacheDeTrazos(fuentes.f), imagen: (k) => bitmaps.get(k) ?? null }
  }, [fuentes, compuesto, bitmaps])

  // -- el PDF -----------------------------------------------------------------------
  const [pdf, setPdf] = useState<{ blob: Blob; id: number } | null>(null)
  const [preparando, setPreparando] = useState(false)
  const [faltaron, setFaltaron] = useState<readonly string[]>([])
  const nombreImagen = useCallback(
    (clave: string): string => {
      const id = preparado.idDeClave.get(clave)
      return (id && estado.imagenes.get(id)?.nombreOriginal) || clave
    },
    [preparado, estado.imagenes],
  )
  const prepararPdf = async (): Promise<void> => {
    if (!compuesto || !repo) return
    setPreparando(true)
    try {
      const pixeles: Record<string, ImagenGris> = {}
      const sin: string[] = []
      for (const [clave, tam] of tamanosImpresos(compuesto.impreso.paginas)) {
        const id = preparado.idDeClave.get(clave)
        const img = id ? estado.imagenes.get(id) : undefined
        const blob = id ? repo.blob(id) : undefined
        try {
          if (!img || !blob) throw new Error(clave)
          pixeles[clave] = await imagenEnGris(blob, pixelesDestino(img, tam))
        } catch {
          // Una imagen que no se lee sale gris lisa, del tamaño que le toca, y se dice.
          sin.push(nombreImagen(clave))
          pixeles[clave] = { ancho: 1, alto: 1, pixeles: new Uint8Array([200]) }
        }
      }
      setFaltaron(sin)
      const r = await pedirAlImpreso(
        { tipo: 'pdf', componer: compuesto.pedido, pixeles, titulo: p.datos.titulo, autor: p.datos.autor, fecha: Date.now() },
        Object.values(pixeles).flatMap((g) => (g.pixeles.buffer instanceof ArrayBuffer ? [g.pixeles.buffer] : [])),
      )
      if (r.tipo === 'pdf') setPdf({ blob: new Blob([r.pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), id: compuesto.pedido.id })
      else if (r.tipo === 'error') setError({ para: preparado, texto: t.error(r.error) })
    } finally {
      setPreparando(false)
    }
  }
  const pdfViejo = pdf !== null && (componiendo || pdf.id !== compuesto?.pedido.id)
  const nombrePdf = (): string => {
    const corte = c.corte === 'personalizado' ? `${f(c.personalizado.ancho)}x${f(c.personalizado.alto)}mm` : c.corte
    return `${nombreSeguro(p.datos.titulo) || 'libro'}-interior-${corte}.pdf`
  }

  const grupos = useMemo(() => (impreso ? agruparAvisos(impreso.avisos) : []), [impreso])
  const sinCapitulos = preparado.contenido.capitulos.length === 0
  const margen = (lado: keyof Margenes, v: number): void => cambiar({ margenes: { ...c.margenes, [lado]: v } })
  const corteNombre = (ancho: number, alto: number): string => t.formato.corteNombre(`${f(ancho, 2)} × ${f(alto, 2)}`, `${f(ancho * 2.54, 2)} × ${f(alto * 2.54, 2)}`)

  return (
    <div className="pantalla pantalla-impreso">
      <header className="impreso-cabecera">
        <h1>{t.titulo}</h1>
        <p className="ayuda">{t.intro}</p>
        <p className="alerta nivel-nota compacta">{t.cubierta}</p>
      </header>

      <div className="impreso-cuerpo">
        <div className="impreso-opciones">
          <Opciones
            leyenda={t.destino.titulo}
            valor={c.destino}
            opciones={DESTINOS.map((d) => [d, t.destino[d]] as const)}
            alCambiar={(destino) => cambiar({ destino })}
            ayuda={t.destino.ayuda[c.destino]}
          />

          <fieldset className="opciones-impreso">
            <legend>{t.formato.titulo}</legend>
            <label className="campo">
              <span>{t.formato.corte}</span>
              <select value={c.corte} onChange={(e) => cambiar({ corte: e.target.value })}>
                {CORTES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {corteNombre(x.ancho, x.alto)}
                  </option>
                ))}
                <option value="personalizado">{t.formato.personalizado}</option>
              </select>
              <small>{c.corte === 'personalizado' ? t.formato.personalizadoAyuda : t.formato.corteAyuda}</small>
            </label>
            {c.corte === 'personalizado' && (
              <div className="rejilla-campos">
                <Milimetros etiqueta={t.formato.ancho} valor={c.personalizado.ancho} min={RANGOS.ladoPersonalizado.min} max={RANGOS.ladoPersonalizado.max} alCambiar={(ancho) => cambiar({ personalizado: { ...c.personalizado, ancho } })} />
                <Milimetros etiqueta={t.formato.alto} valor={c.personalizado.alto} min={RANGOS.ladoPersonalizado.min} max={RANGOS.ladoPersonalizado.max} alCambiar={(alto) => cambiar({ personalizado: { ...c.personalizado, alto } })} />
              </div>
            )}
            <div className="fila-opciones">
              <span className="rotulo">{t.formato.papel}</span>
              {(['crema', 'blanco'] as const).map((v) => (
                <label key={v} className="casilla">
                  <input type="radio" name="impreso-papel" checked={c.papel === v} onChange={() => cambiar({ papel: v })} />
                  {t.formato[v]}
                </label>
              ))}
            </div>
            <p className="ayuda">{t.formato.papelAyuda}</p>
            <div className="fila-opciones">
              <span className="rotulo">{t.formato.tinta}</span>
              <label className="casilla">
                <input type="radio" name="impreso-tinta" checked readOnly />
                {t.formato.bn}
              </label>
            </div>
            <p className="ayuda">{t.formato.color}</p>
          </fieldset>

          <fieldset className="opciones-impreso">
            <legend>{t.letra.titulo}</legend>
            <label className="campo">
              <span>{t.letra.fuente}</span>
              <select value={c.fuente} onChange={(e) => cambiar({ fuente: e.target.value })}>
                {FAMILIAS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </select>
              <small>{t.letra.fuenteAyuda}</small>
            </label>
            <Deslizador etiqueta={t.letra.cuerpo} valor={c.cuerpo} texto={t.letra.puntos(f(c.cuerpo))} min={8} max={14} paso={RANGOS.cuerpo.paso} alCambiar={(cuerpo) => cambiar({ cuerpo })} ayuda={t.letra.cuerpoAyuda} />
            <Deslizador
              etiqueta={t.letra.interlineado}
              valor={c.interlineado}
              texto={t.letra.porcentaje(c.interlineado, f(interlineaDe(c)))}
              min={115}
              max={160}
              paso={1}
              alCambiar={(interlineado) => cambiar({ interlineado })}
              ayuda={t.letra.interlineadoAyuda}
            />
            <Deslizador etiqueta={t.letra.sangria} valor={c.sangria} texto={t.letra.em(f(c.sangria))} min={0} max={RANGOS.sangria.max} paso={RANGOS.sangria.paso} alCambiar={(sangria) => cambiar({ sangria })} ayuda={t.letra.sangriaAyuda} />
            <Opciones
              leyenda={t.letra.alineacion}
              valor={c.alineacion}
              opciones={[
                ['justificado', t.letra.justificado],
                ['bandera', t.letra.bandera],
              ]}
              alCambiar={(alineacion) => cambiar({ alineacion })}
            />
          </fieldset>

          <fieldset className="opciones-impreso">
            <legend>{t.margenes.titulo}</legend>
            <div className="rejilla-campos">
              {(['interior', 'exterior', 'superior', 'inferior'] as const).map((lado) => (
                <Milimetros key={lado} etiqueta={t.margenes[lado]} valor={c.margenes[lado]} alCambiar={(v) => margen(lado, v)} />
              ))}
            </div>
            <p className="ayuda">{t.margenes.ayuda}</p>
            {impreso && impreso.medianilMinimo > 0 && (
              <p className="ayuda">
                {t.margenes.medianil(f(impreso.medianilMinimo), impreso.paginas.length)} {t.margenes.usado(f(impreso.margenes.interior))}
              </p>
            )}
          </fieldset>

          <fieldset className="opciones-impreso">
            <legend>{t.capitulos.titulo}</legend>
            <label className="casilla">
              <input type="checkbox" checked={c.capituloEnImpar} onChange={(e) => cambiar({ capituloEnImpar: e.target.checked })} />
              {t.capitulos.impar}
            </label>
            <p className="ayuda">{t.capitulos.imparAyuda}</p>
            <Opciones
              leyenda={t.capitulos.caida}
              valor={c.caida}
              opciones={[
                ['alta', t.capitulos.alta],
                ['media', t.capitulos.media],
                ['baja', t.capitulos.baja],
              ]}
              alCambiar={(caida) => cambiar({ caida })}
            />
            <Opciones
              leyenda={t.capitulos.escena}
              valor={c.escena}
              opciones={[
                ['adorno', t.capitulos.adorno(p.datos.separadorDeEscena || '* * *')],
                ['blanco', t.capitulos.blanco],
              ]}
              alCambiar={(escena) => cambiar({ escena })}
            />
          </fieldset>

          <fieldset className="opciones-impreso">
            <legend>{t.paginacion.titulo}</legend>
            <Opciones
              leyenda={t.paginacion.cabecera}
              valor={c.cabecera}
              opciones={[
                ['titulo', t.paginacion.cabeceraTitulo],
                ['autor', t.paginacion.cabeceraAutor],
                ['ninguna', t.paginacion.cabeceraNinguna],
              ]}
              alCambiar={(cabecera) => cambiar({ cabecera })}
              ayuda={t.paginacion.cabeceraAyuda}
            />
            <Opciones
              leyenda={t.paginacion.folio}
              valor={c.folio}
              opciones={[
                ['arriba', t.paginacion.arriba],
                ['abajo', t.paginacion.abajo],
              ]}
              alCambiar={(folio) => cambiar({ folio })}
            />
            <Opciones
              leyenda={t.paginacion.preliminares}
              valor={c.preliminares}
              opciones={[
                ['sin', t.paginacion.sin],
                ['romanos', t.paginacion.romanos],
              ]}
              alCambiar={(preliminares) => cambiar({ preliminares })}
            />
          </fieldset>

          <fieldset className="opciones-impreso">
            <legend>{t.paginas.titulo}</legend>
            <p className="ayuda">{t.paginas.ayuda}</p>
            <label className="casilla">
              <input type="checkbox" checked={c.anteportada} onChange={(e) => cambiar({ anteportada: e.target.checked })} />
              {t.paginas.anteportada}
            </label>
            <label className="casilla">
              <input type="checkbox" checked={c.indice} onChange={(e) => cambiar({ indice: e.target.checked })} />
              {t.paginas.indice}
            </label>
            <label className="casilla">
              <input type="checkbox" checked={c.colofon} onChange={(e) => cambiar({ colofon: e.target.checked })} />
              {t.paginas.colofon}
            </label>
            <h3>{t.paginas.extras}</h3>
            <p className="ayuda">{t.paginas.extrasAyuda}</p>
            <ExtrasDelImpreso p={p} cambiar={cambiar} />
            {p.laminas.length > 0 && (
              <Opciones
                leyenda={t.paginas.laminas(p.laminas.length)}
                valor={c.laminas}
                opciones={[
                  ['grises', t.paginas.grises],
                  ['omitir', t.paginas.omitir],
                ]}
                alCambiar={(laminas) => cambiar({ laminas })}
                ayuda={t.paginas.laminasAyuda}
              />
            )}
          </fieldset>

          <fieldset className="opciones-impreso">
            <legend>{t.creditos.titulo}</legend>
            <Isbn valor={c.isbn} alCambiar={(isbn) => cambiar({ isbn })} />
            <p className="ayuda">{t.creditos.edicion}</p>
          </fieldset>
        </div>

        <div className="impreso-resultado">
          <div className="medida-en-vivo" role="status" aria-live="polite">
            {sinCapitulos ? (
              <p>{t.sinCapitulos}</p>
            ) : impreso ? (
              <>
                <p className="medida-cifras">
                  <strong className={impreso.caracteres < 45 || impreso.caracteres > 75 ? 'fuera-de-rango' : ''}>{t.medida.caracteres(impreso.caracteres)}</strong>
                  <span>{t.medida.lineas(impreso.lineasPorPagina)}</span>
                  <span>{t.medida.paginas(impreso.paginas.length)}</span>
                  {componiendo && <span className="componiendo">{t.medida.componiendo}</span>}
                </p>
                <p className="ayuda">{t.medida.ayuda}</p>
              </>
            ) : (
              <p className="componiendo">{t.medida.componiendo}</p>
            )}
            {error && error.para === preparado && <p className="alerta nivel-error compacta">{error.texto}</p>}
          </div>

          {impreso && !sinCapitulos && (
            <>
              <section className="avisos-impreso">
                <h2>{t.avisos.titulo}</h2>
                {grupos.length === 0 ? (
                  <p className="todo-bien">{t.avisos.todoBien}</p>
                ) : (
                  <ul className="revision">
                    {grupos.map((g) => (
                      <li key={g.codigo} className={`nivel-${g.nivel}`}>
                        <Nivel nivel={g.nivel} />
                        <span className="revision-texto">{textoDeGrupo(g, ui, nombreImagen)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="pdf-impreso">
                <h2>{t.pdf.titulo}</h2>
                <p className="ayuda">{t.pdf.ayuda}</p>
                <div className="descargas">
                  <button type="button" className="boton-principal" disabled={preparando || componiendo || !repo} onClick={() => void prepararPdf()}>
                    {preparando ? t.pdf.preparando : t.pdf.preparar}
                  </button>
                  {pdf && !pdfViejo && (
                    <button type="button" className="boton-descarga" onClick={() => descargar(pdf.blob, nombrePdf(), 'application/pdf')}>
                      <strong>{t.pdf.descargar(ui.formato.tamano(pdf.blob.size))}</strong>
                      <span>{nombrePdf()}</span>
                    </button>
                  )}
                </div>
                {pdfViejo && <p className="alerta nivel-aviso compacta">{t.pdf.desactualizado}</p>}
                {pdf && !pdfViejo && faltaron.map((n) => <p key={n} className="alerta nivel-aviso compacta">{t.pdf.sinImagen(n)}</p>)}
              </section>

              <PlanDePaginas impreso={impreso} pintar={pintar} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** El ISBN del impreso, con su digito de control comprobado al escribirlo. */
function Isbn({ valor, alCambiar }: { valor: string; alCambiar: (v: string) => void }) {
  const ui = useTextos()
  const t = ui.impreso.creditos
  const motivo = motivoIsbn(valor, t.isbnMal)
  const malo = motivo !== null
  return (
    <label className={`campo${malo ? ' falta' : ''}`}>
      <span>{t.isbn}</span>
      <input type="text" inputMode="numeric" autoComplete="off" value={valor} onChange={(e) => alCambiar(e.target.value)} aria-invalid={malo} />
      <small>{motivo ?? t.isbnAyuda}</small>
    </label>
  )
}
