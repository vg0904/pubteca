import { useEffect, useMemo, useState } from 'react'
import { TARIFA_POR_MB } from '../../core/reporte'
import { agrupar, cuentas, type Grupo } from '../avisos'
import { descargar } from '../copia'
import { ajusteKindle, entregaKindle, imagenesDeKindle, muestrasPara } from '../entrega'
import type { Estado } from '../estado'
import { conLienzo, generarLibros, type Generado } from '../generar'
import { ajusteEnLote, bppJpeg, bppMedido, conSufijo, pesoTotalEstimado, sinCambios } from '../imagen-ajuste'
import { ajustarImagen } from '../imagen-canvas'
import { idsDeImagenes, type DatosLibro, type EntregaKindle, type Imagen, type Proyecto } from '../modelo'
import type { Repositorio } from '../repositorio'
import {
  bloquea,
  cambioDeIdentidad,
  imagenesDelLote,
  nombresLegibles,
  pendientesDeImagenes,
  pendientesDeKindle,
  revisar,
  type Problema,
} from '../revision'
import { useAvisar, useDespacho, useMedios, useTextos } from './contexto'
import { VistaPrevia } from './VistaPrevia'

type CampoTexto = Exclude<keyof DatosLibro, 'incluirContraportada'>

function Campo({
  campo,
  datos,
  ayuda,
  tipo = 'text',
  requerido = false,
}: {
  campo: CampoTexto
  datos: DatosLibro
  ayuda?: string
  tipo?: 'text' | 'date'
  requerido?: boolean
}) {
  const ui = useTextos()
  const despachar = useDespacho()
  const etiqueta = ui.descargar.campos[campo as keyof typeof ui.descargar.campos] ?? campo
  return (
    <label className={`campo${requerido && !datos[campo].trim() ? ' falta' : ''}`}>
      <span>
        {etiqueta}
        {requerido && ' *'}
      </span>
      <input
        type={tipo}
        value={datos[campo]}
        required={requerido}
        onChange={(e) => despachar({ tipo: 'dato', campo, valor: e.target.value, ahora: Date.now() })}
      />
      {ayuda && <small>{ayuda}</small>}
    </label>
  )
}

/** Un renglon de la revision, con icono Y palabra: nunca solo color. */
function Nivel({ nivel }: { nivel: 'bloquea' | 'error' | 'aviso' | 'nota' }) {
  const ui = useTextos()
  return (
    <span className={`nivel nivel-${nivel}`}>
      <span aria-hidden="true">{ui.niveles[nivel].icono}</span> {ui.niveles[nivel].palabra}
    </span>
  )
}

function Problemas({ problemas }: { problemas: readonly Problema[] }) {
  const ui = useTextos()
  const despachar = useDespacho()
  if (problemas.length === 0) return <p className="todo-bien">{ui.descargar.todoBien}</p>
  return (
    <ul className="revision">
      {problemas.map((x, i) => (
        <li key={i} className={`nivel-${x.nivel}`}>
          <Nivel nivel={x.nivel} />
          <span className="revision-texto">
            {ui.problemas[x.clave]} {x.ir && <em>{x.que}</em>}
          </span>
          {x.ir && (
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                const ir = x.ir
                if (!ir) return
                if ('capitulo' in ir) despachar({ tipo: 'abrirCapitulo', id: ir.capitulo })
                else if ('extra' in ir) despachar({ tipo: 'abrirExtra', id: ir.extra })
                else despachar({ tipo: 'irA', seccion: ir.seccion })
              }}
            >
              {ui.descargar.ir}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function Grupos({ grupos, nombres }: { grupos: readonly Grupo[]; nombres: ReadonlyMap<string, string> }) {
  const ui = useTextos()
  const c = cuentas(grupos)
  return (
    <div className="grupos">
      {c.mensajes > c.grupos && <p className="ayuda">{ui.descargar.resultadoResumen(c.mensajes, c.grupos)}</p>}
      <ul className="revision">
        {grupos.map((g, i) => {
          const t = ui.grupos[g.clave]
          return (
            <li key={i} className={`nivel-${g.nivel}`}>
              <Nivel nivel={g.nivel} />
              <div className="revision-texto">
                <p>
                  <strong>{g.clave === 'otro' ? g.mensajes[0] : t.titulo}</strong>
                  {g.elementos.length > 0 && ` · ${ui.descargar.afectadas(g.elementos.length)}`}
                </p>
                {t.consejo && <p className="ayuda">{t.consejo}</p>}
                {g.elementos.length > 0 && (
                  <details>
                    <summary>{g.elementos.slice(0, 3).map((e) => nombres.get(e) ?? e).join(' · ')}{g.elementos.length > 3 ? ' …' : ''}</summary>
                    <ul className="afectadas">
                      {g.elementos.map((e) => (
                        <li key={e}>{nombres.get(e) ?? e}</li>
                      ))}
                    </ul>
                    <p className="rotulo">{ui.descargar.verDetalle}</p>
                    <ul className="originales">
                      {g.mensajes.map((m, k) => (
                        <li key={k}>{m}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Lo que identifica el contenido del libro, sin los hechos (descargado, copia). */
function huella(p: Proyecto): readonly unknown[] {
  // `kindle` entra aqui: mover el deslizador cambia el EPUB de Kindle, asi que
  // el que ya estaba preparado queda desactualizado como con cualquier edicion.
  return [p.datos, p.capitulos, p.extras, p.laminas, p.portada, p.kindle]
}
const mismaHuella = (a: readonly unknown[], b: readonly unknown[]): boolean => a.every((x, i) => x === b[i])

/**
 * Las imagenes en cada tienda.
 *
 * Esto va AQUI y no en el cuadro de ajustar una imagen porque es una decision
 * de entrega: vale igual para las treinta ilustraciones del libro, y pedirsela
 * al autor imagen por imagen seria treinta veces el mismo gesto. Lo que si se
 * decide imagen por imagen (que trozo se ve, a que resolucion) esta alli.
 *
 * El peso que se ensena no es una tabla: se codifican de verdad las dos o tres
 * imagenes mas grandes del libro con la calidad elegida y se extrapola por
 * pixeles. Los bytes por pixel de un JPEG dependen del dibujo mucho mas que de
 * la calidad — una acuarela y una linea plana se llevan un factor de cinco —,
 * asi que un numero de tabla puede estar al doble del real, y un numero
 * equivocado en la pantalla de descarga es peor que no dar ninguno.
 */
function ImagenesPorTienda({ p, imagenes }: { p: Proyecto; imagenes: ReadonlyMap<string, Imagen> }) {
  const ui = useTextos()
  const despachar = useDespacho()
  const { repo } = useMedios()
  const k = entregaKindle(p)
  // Las de Kindle y TODAS: no son las mismas, y cada renglon tiene que contar
  // las suyas. La portada y el logo van en el EPUB de Apple Books y no en el
  // de Kindle, asi que contarlas en el renglon de Kindle enganaria con el
  // numero que mas le importa al autor, el que paga la tarifa de Amazon.
  const suyas = useMemo(() => imagenesDeKindle(p, imagenes), [p, imagenes])
  const todas = useMemo(
    () => [...idsDeImagenes(p)].flatMap((id) => (imagenes.get(id) ? [imagenes.get(id) as Imagen] : [])),
    [p, imagenes],
  )
  const pesoApple = todas.reduce((n, i) => n + i.bytes, 0)
  const pesoOriginal = suyas.reduce((n, i) => n + i.bytes, 0)

  // La medida que hay, con la etiqueta de PARA QUE ajustes se tomo. Asi
  // «estamos midiendo» se deriva al pintar (la medida es de otros ajustes) en
  // vez de ponerse a mano dentro del efecto, que dispararia otro render.
  const clave = `${k.calidad}|${k.grises}|${suyas.map((i) => `${i.id}:${i.bytes}`).join(',')}`
  const [medida, setMedida] = useState<{ clave: string; bpp: number | null } | null>(null)
  const alDia = medida?.clave === clave
  const midiendo = k.comprimir && suyas.length > 0 && !alDia

  // Se mide con retraso: el deslizador manda un valor por pixel de recorrido y
  // codificar en todos dejaria la pagina pegada.
  useEffect(() => {
    if (!k.comprimir || !repo || suyas.length === 0 || alDia) return undefined
    let vivo = true
    const t = setTimeout(() => {
      void (async () => {
        const bpp = await medirKindle(suyas, repo, k)
        if (vivo) setMedida({ clave, bpp })
      })()
    }, 400)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [alDia, clave, k, repo, suyas])

  const bpp = alDia ? medida.bpp : null
  const noSePudo = alDia && medida.bpp === null
  const estimado = pesoTotalEstimado(suyas, bpp ?? bppJpeg(k.calidad, k.grises))
  // Comprimir nunca puede dar un libro mas gordo: si sale asi, se queda el
  // original imagen por imagen (ver `paraKindle`), y eso es lo que se dice.
  const conKindle = Math.min(estimado, pesoOriginal)
  const cambiar = (cambios: Partial<EntregaKindle>): void =>
    despachar({ tipo: 'entregaKindle', cambios, ahora: Date.now() })

  return (
    <section className="por-tienda">
      <h2>{ui.descargar.imagenes.titulo}</h2>
      <p className="ayuda">{ui.descargar.imagenes.ayuda}</p>
      {todas.length === 0 ? (
        <p className="ayuda">{ui.descargar.imagenes.sinImagenes}</p>
      ) : (
        <>
          <p className="tienda-apple">
            <strong>{ui.descargar.imagenes.apple}</strong>{' '}
            <span className="ayuda">
              {ui.descargar.imagenes.appleDetalle(todas.length, ui.formato.tamano(pesoApple))}
            </span>
          </p>
          <fieldset className="tienda-kindle">
            <legend>
              {ui.descargar.imagenes.kindle}{' '}
              <span className="ayuda">{ui.descargar.imagenes.kindleDetalle(suyas.length, ui.formato.tamano(pesoOriginal))}</span>
            </legend>
            <label className="casilla">
              <input type="checkbox" checked={k.comprimir} onChange={(e) => cambiar({ comprimir: e.target.checked })} />
              {ui.descargar.imagenes.comprimir}
            </label>
            {k.comprimir && (
              <div className="mandos-kindle">
                <label className="campo">
                  <span>
                    {ui.descargar.imagenes.calidad} · {k.calidad}
                  </span>
                  <input
                    type="range"
                    min={40}
                    max={95}
                    step={1}
                    value={k.calidad}
                    onChange={(e) => cambiar({ calidad: Number(e.target.value) })}
                  />
                  <small>{ui.descargar.imagenes.calidadAyuda}</small>
                </label>
                <label className="casilla">
                  <input type="checkbox" checked={k.grises} onChange={(e) => cambiar({ grises: e.target.checked })} />
                  {ui.descargar.imagenes.grises}
                </label>
                <p className="ayuda">{ui.descargar.imagenes.grisesAyuda}</p>
                <p className="estimado">
                  {midiendo ? (
                    ui.descargar.imagenes.calculando
                  ) : conKindle >= pesoOriginal ? (
                    // Comprimir no siempre adelgaza: un dibujo de linea plana
                    // lo guarda mejor el PNG. Decirlo es mas util que ensenar
                    // «105 kB → 105 kB» y dejar al autor pensando.
                    <span className="ayuda">{ui.descargar.imagenes.sinAhorro}</span>
                  ) : (
                    <>
                      <strong>{ui.descargar.imagenes.estimado(ui.formato.tamano(conKindle))}</strong>{' '}
                      <span className="ayuda">
                        {ui.descargar.imagenes.ahorro(ui.formato.tamano(pesoOriginal), ui.formato.tamano(conKindle))}
                      </span>
                    </>
                  )}
                </p>
                {noSePudo && <p className="alerta nivel-nota">{ui.descargar.imagenes.noSePudo}</p>}
                {suyas.some((i) => i.alfa) && <p className="alerta nivel-nota">{ui.descargar.imagenes.transparencia}</p>}
                <p className="ayuda">{ui.descargar.imagenes.soloKindle}</p>
              </div>
            )}
          </fieldset>
        </>
      )}
    </section>
  )
}

/** Cuantos nombres de imagen se escriben antes de cortar la lista. */
const MAX_NOMBRES = 6

/**
 * El recordatorio de lo que les queda a las imagenes, antes de descargar.
 *
 * RECUERDA, NO BLOQUEA. Un libro con las imagenes sin optimizar se publica
 * igual: solo sale mas caro de entregar en Amazon y se ve peor en pantallas
 * grandes. Lo que no se puede es enterarse DESPUES de subirlo a KDP, que es
 * donde esto acababa hoy, porque los avisos solo salian en la tarjeta de cada
 * imagen y hay que ir capitulo por capitulo a verlos.
 *
 * El boton arregla de una vez lo que tiene una sola respuesta correcta
 * (reducir lo que se pasa de grande o de pesado, y de paso dejarlo en sRGB).
 * Lo que se arregla RECORTANDO no entra: en lote cortaria cabezas. Ver
 * `ARREGLABLES_EN_LOTE`.
 */
function AntesDeDescargar({ p, imagenes }: { p: Proyecto; imagenes: ReadonlyMap<string, Imagen> }) {
  const ui = useTextos()
  const despachar = useDespacho()
  const avisar = useAvisar()
  const { repo, subir } = useMedios()
  const [ocupado, setOcupado] = useState(false)

  const k = entregaKindle(p)
  const pendientes = useMemo(() => pendientesDeImagenes(p, imagenes), [p, imagenes])
  const paraKindle = useMemo(() => pendientesDeKindle(pendientes), [pendientes])
  // Lo que solo le pasa a Kindle lo contesta entero la casilla de comprimir,
  // que esta aqui mismo; con la casilla ya puesta deja de estar pendiente, y
  // seguir diciendolo seria mandar al autor a arreglar lo que ya esta hecho.
  const faltaComprimir = paraKindle.length > 0 && !k.comprimir
  const visibles = useMemo(
    () => (k.comprimir ? pendientes.filter((x) => !paraKindle.includes(x)) : pendientes),
    [k.comprimir, paraKindle, pendientes],
  )
  // El lote sale de lo que SIGUE a la vista: ofrecer arreglar un renglon que ya
  // no esta seria arreglar algo que el autor no ve.
  const delLote = useMemo(() => imagenesDelLote(visibles), [visibles])

  if (visibles.length === 0) return null

  const nombre = (id: string): string => imagenes.get(id)?.nombreOriginal ?? id

  /** Los nombres de las afectadas, cortando la lista: con treinta no se lee. */
  const cuales = (ids: readonly string[]): string => {
    const lista = ids.slice(0, MAX_NOMBRES).map(nombre).join(', ')
    return ui.descargar.antes.cuales(ids.length, ids.length > MAX_NOMBRES ? `${lista}…` : lista)
  }

  const arreglarTodas = async (): Promise<void> => {
    if (!repo || ocupado) return
    setOcupado(true)
    let hechas = 0
    try {
      for (const id of delLote) {
        const imagen = imagenes.get(id)
        const origen = imagen ? repo.blob(id) : undefined
        if (!imagen || !origen) continue
        const ajuste = ajusteEnLote(imagen)
        if (sinCambios(ajuste, imagen)) continue
        try {
          const salida = await ajustarImagen(origen, ajuste)
          const [nueva] = await subir([
            new File([salida.blob], conSufijo(imagen.nombreOriginal, salida.tipo), { type: salida.blob.type }),
          ])
          if (!nueva) continue
          despachar({ tipo: 'sustituirImagen', viejo: id, nuevo: nueva.id })
          hechas++
        } catch {
          // Una imagen que este navegador no sabe codificar no para a las
          // demas: se queda como estaba y sigue saliendo en el recordatorio.
        }
      }
      // Y lo que solo le pasa a Kindle se resuelve con la casilla de comprimir.
      if (faltaComprimir) despachar({ tipo: 'entregaKindle', cambios: { comprimir: true }, ahora: Date.now() })
      // Lo que se diga tiene que ser lo que de verdad paso: tocar la casilla de
      // comprimir no es haber arreglado ninguna imagen.
      const dicho =
        hechas > 0
          ? ui.descargar.antes.hecho(hechas)
          : faltaComprimir
            ? ui.descargar.antes.comprimirPuesto
            : ui.descargar.antes.nadaQueHacer
      avisar(dicho, { deshacer: hechas > 0 || faltaComprimir })
    } finally {
      setOcupado(false)
    }
  }

  // El boton dice lo que va a hacer. Sin imagenes que tocar, lo unico que hace
  // es encender la casilla de comprimir, y llamar a eso «1 imagen» seria mentir.
  const etiqueta = delLote.length > 0 ? ui.descargar.antes.arreglar(delLote.length) : ui.descargar.antes.soloComprimir
  const hayAlgoQueHacer = delLote.length > 0 || faltaComprimir

  return (
    <section className="antes-de-descargar">
      <h2>{ui.descargar.antes.titulo}</h2>
      <p className="ayuda">{ui.descargar.antes.ayuda}</p>
      <ul className="avisos-imagen">
        {visibles.map((x) => (
          <li key={x.clave} className={`nivel-${x.nivel}`}>
            <span className="nivel-icono" aria-hidden="true">
              {ui.niveles[x.nivel].icono}
            </span>
            <span className="sr">{ui.niveles[x.nivel].palabra}: </span>
            <span>
              <strong>{x.tiendas.map((s) => ui.tiendas[s]).join(' · ')}</strong> — {ui.grupos[x.clave].titulo}{' '}
              <span className="ayuda">{cuales(x.imagenes)}</span>
              {!x.enLote && (
                <span className="ayuda"> {x.clave === 'transparencia' ? ui.descargar.antes.conComprimir : ui.grupos[x.clave].consejo}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hayAlgoQueHacer && (
        <button type="button" className="boton-secundario" disabled={ocupado || !repo} onClick={() => void arreglarTodas()}>
          {ocupado ? ui.descargar.antes.arreglando : etiqueta}
        </button>
      )}
      <p className="ayuda">{ui.descargar.antes.noBloquea}</p>
    </section>
  )
}

/**
 * Codifica de verdad una muestra de las imagenes y devuelve sus bytes por
 * pixel, o `null` si el navegador no pudo con ninguna.
 */
async function medirKindle(
  suyas: readonly Imagen[],
  repo: Repositorio,
  k: EntregaKindle,
): Promise<number | null> {
  const muestras: { bytes: number; pixeles: number }[] = []
  for (const imagen of muestrasPara(suyas)) {
    const origen = await repo.bytes(imagen.id)
    if (!origen) continue
    try {
      const c = await conLienzo(origen, imagen, ajusteKindle(imagen, k))
      muestras.push({ bytes: c.bytes.length, pixeles: c.ancho * c.alto })
    } catch {
      // Una imagen que el lienzo no abre no estropea la medida de las otras.
    }
  }
  return bppMedido(muestras)
}

export function PantallaDescargar({ estado }: { estado: Estado }) {
  const ui = useTextos()
  const despachar = useDespacho()
  const avisar = useAvisar()
  const { repo } = useMedios()
  const p = estado.proyecto as Proyecto
  const [generado, setGenerado] = useState<{ g: Generado; huella: readonly unknown[]; ahora: Date } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const problemas = useMemo(() => revisar(p, estado.imagenes), [p, estado.imagenes])
  const identidad = cambioDeIdentidad(p)
  const viejo = generado !== null && !mismaHuella(generado.huella, huella(p))

  const generar = async (): Promise<void> => {
    if (!repo) return
    setOcupado(true)
    try {
      const ahora = new Date()
      const g = await generarLibros(p, estado.imagenes, repo, ahora)
      setGenerado({ g, huella: huella(p), ahora })
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
    } finally {
      setOcupado(false)
    }
  }

  const c = generado?.g.motor
  const grupos = useMemo(() => (c ? agrupar(c.diagnosticos) : []), [c])
  const nombres = useMemo(
    () => (generado ? nombresLegibles(p, estado.imagenes, generado.g.exportado.nombres) : new Map<string, string>()),
    [generado, p, estado.imagenes],
  )

  const bajar = (tienda: 'Kindle' | 'AppleBooks'): void => {
    const r = c?.resultados.find((x) => x.tienda === tienda)
    if (!r || !c) return
    // Dentro del clic: Safari descarta las descargas sin activacion del usuario.
    descargar(r.bytes, r.nombreArchivo, 'application/epub+zip')
    despachar({ tipo: 'descargado', uid: c.uid, cuando: Date.now() })
  }

  const kindle = c?.resultados.find((r) => r.tienda === 'Kindle')
  const apple = c?.resultados.find((r) => r.tienda === 'AppleBooks')

  return (
    <div className="pantalla pantalla-descargar">
      <h1>{ui.descargar.titulo}</h1>

      <section className="datos">
        <h2>{ui.descargar.datos}</h2>
        <p className="ayuda">{ui.descargar.datosAyuda}</p>
        <div className="rejilla-campos">
          <Campo campo="titulo" datos={p.datos} requerido />
          <Campo campo="autor" datos={p.datos} />
          <Campo campo="subtitulo" datos={p.datos} />
          <Campo campo="sello" datos={p.datos} />
          <Campo campo="isbn" datos={p.datos} ayuda={ui.descargar.campos.isbnAyuda} />
          <Campo campo="fechaPublicacion" datos={p.datos} tipo="date" />
          <label className="campo">
            <span>{ui.descargar.campos.idioma}</span>
            <select
              value={p.datos.idioma}
              onChange={(e) => despachar({ tipo: 'dato', campo: 'idioma', valor: e.target.value, ahora: Date.now() })}
            >
              {Object.entries(ui.descargar.idiomas).map(([cod, nombre]) => (
                <option key={cod} value={cod}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
          <Campo campo="derechos" datos={p.datos} ayuda={ui.descargar.campos.derechosAyuda} />
        </div>
        <label className="campo ancho">
          <span>{ui.descargar.campos.descripcion}</span>
          <textarea
            rows={3}
            value={p.datos.descripcion}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            onChange={(e) => despachar({ tipo: 'dato', campo: 'descripcion', valor: e.target.value, ahora: Date.now() })}
          />
        </label>
        {identidad && (
          <p className="alerta nivel-aviso">
            <Nivel nivel="aviso" /> {ui.descargar.identidad(identidad.antes.titulo, identidad.antes.autor)}
          </p>
        )}
      </section>

      <ImagenesPorTienda p={p} imagenes={estado.imagenes} />

      <AntesDeDescargar p={p} imagenes={estado.imagenes} />

      <section>
        <h2>{ui.descargar.revision}</h2>
        <Problemas problemas={problemas} />
        <button type="button" className="boton-principal" disabled={ocupado || bloquea(problemas) || !repo} onClick={() => void generar()}>
          {ocupado ? ui.descargar.generando : generado ? ui.descargar.regenerar : ui.descargar.generar}
        </button>
        {bloquea(problemas) && <p className="ayuda">{ui.descargar.bloqueado}</p>}
        {ocupado && <div className="progreso" role="progressbar" aria-label={ui.descargar.generando} />}
      </section>

      {c && (
        <section className="resultado">
          {c.bloqueado ? (
            <p className="alerta nivel-bloquea">
              <Nivel nivel="bloquea" /> {c.bloqueado}
            </p>
          ) : (
            <>
              {viejo ? <p className="alerta nivel-aviso">{ui.descargar.desactualizado}</p> : <p>{ui.descargar.listos}</p>}
              <div className="descargas">
                {kindle && (
                  <button type="button" className="boton-descarga" disabled={viejo} onClick={() => bajar('Kindle')}>
                    <strong>{ui.descargar.kindle}</strong>
                    <span>
                      {ui.formato.tamano(kindle.bytes.length)} · {ui.descargar.tarifa(ui.formato.dolares((kindle.bytes.length / 1e6) * TARIFA_POR_MB))}
                    </span>
                  </button>
                )}
                {apple && (
                  <button type="button" className="boton-descarga" disabled={viejo} onClick={() => bajar('AppleBooks')}>
                    <strong>{ui.descargar.apple}</strong>
                    <span>{ui.formato.tamano(apple.bytes.length)}</span>
                  </button>
                )}
              </div>
              <p className="ayuda">{ui.descargar.tarifaAyuda}</p>
              {/* Lo que se ahorro DE VERDAD, no lo que se estimo antes de generar. */}
              {generado?.g.kindle && generado.g.kindle.ahora < generado.g.kindle.antes && (
                <p className="ayuda">
                  {ui.descargar.imagenes.comprimidas(
                    ui.formato.tamano(generado.g.kindle.antes),
                    ui.formato.tamano(generado.g.kindle.ahora),
                  )}
                </p>
              )}
              {generado?.g.sinFuentes && <p className="alerta nivel-nota">{ui.descargar.sinFuentes}</p>}
              {/* Desactualizada no: enseñaria un libro que ya no es el que hay. */}
              {!viejo && <VistaPrevia resultados={c.resultados} />}
            </>
          )}
          {(grupos.length > 0 || (generado?.g.exportado.avisos.length ?? 0) > 0) && (
            <>
              <h2>{ui.descargar.resultado}</h2>
              <Grupos grupos={grupos} nombres={nombres} />
              {generado && generado.g.exportado.avisos.length > 0 && (
                <ul className="revision">
                  {generado.g.exportado.avisos.map((a, i) => (
                    <li key={i} className="nivel-aviso">
                      <Nivel nivel="aviso" />
                      <div className="revision-texto">
                        <p>
                          <strong>{a.que}</strong>
                        </p>
                        <p>{a.porque}</p>
                        <p className="ayuda">{a.sugerencia}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {generado && (
            <button
              type="button"
              className="enlace"
              onClick={() =>
                descargar(new TextEncoder().encode(generado.g.motor.reporte), 'reporte.txt', 'text/plain;charset=utf-8')
              }
            >
              {ui.descargar.reporte}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
