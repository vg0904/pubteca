import { useEffect, useMemo, useRef } from 'react'
import { RE_TITULO } from '../../core/parser'
import { pareceTitulo } from '../importar/docx'
import {
  capitulosVacios,
  corteEn,
  esLineaDeTitulo,
  usaLineaSiguiente,
  vistaImportacion,
  type Corte,
  type ImagenImportada,
  type Importacion,
} from '../importacion'
import { textoDeTramos, type Bloque } from '../modelo'
import { useDespacho, useTextos } from './contexto'
import { Tramos, VistaCapitulo } from './VistaCapitulo'

/** URL de las imagenes de la importacion, para la vista previa. Se sueltan al salir. */
function useUrls(imagenes: readonly ImagenImportada[]): (id: string) => string | undefined {
  const urls = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of imagenes) {
      if (i.info.tipo === null) continue
      const tipo = i.info.tipo === 'png' ? 'image/png' : 'image/jpeg'
      m.set(i.id, URL.createObjectURL(new Blob([i.bytes as Uint8Array<ArrayBuffer>], { type: tipo })))
    }
    return m
  }, [imagenes])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return (id) => urls.get(id)
}

const nombreDeCorte = (c: Corte): string => [c.etiqueta, c.titulo].filter(Boolean).join(': ') || c.titulo

/** Una linea del documento, resumida. */
function Extracto({ b, url }: { b: Bloque; url: (id: string) => string | undefined }) {
  const ui = useTextos()
  switch (b.tipo) {
    case 'parrafo':
    case 'subtitulo':
      return (
        <p className={`extracto${b.tipo === 'subtitulo' ? ' subtitulo' : ''}`}>
          <Tramos tramos={b.tramos} />
        </p>
      )
    case 'escena':
      return <p className="extracto escena">* * *</p>
    case 'versos':
      return (
        <p className="extracto versos">
          {ui.importar.versos}: {b.estrofas.flat().map((v) => v.texto).join(' / ')}
        </p>
      )
    case 'ilustracion': {
      const u = url(b.imagenId)
      return (
        <p className="extracto ilustracion">
          {u && <img src={u} alt="" />}
          {ui.importar.ilustracion}
          {b.alt ? `: ${b.alt}` : ''}
        </p>
      )
    }
  }
}

function TarjetaDeCorte({ corte, numeroCap, bloques }: { corte: Corte; numeroCap: number; bloques: readonly Bloque[] }) {
  const ui = useTextos()
  const despachar = useDespacho()
  const enviar = (accion: Parameters<typeof despachar>[0]): void => despachar(accion)
  const dosLineas = usaLineaSiguiente(corte)
  const siguiente = bloques[corte.indice + 1]
  // Solo se ofrece cuando la linea es una etiqueta sola («CAPÍTULO 3») y la
  // siguiente tiene pinta de titulo: ofrecerlo siempre invitaba a convertir el
  // primer parrafo en titulo de un clic.
  const puedeDosLineas =
    !dosLineas &&
    corte.etiqueta === '' &&
    RE_TITULO.test(corte.titulo) &&
    (siguiente?.tipo === 'parrafo' || siguiente?.tipo === 'subtitulo') &&
    pareceTitulo(textoDeTramos(siguiente.tramos))
  return (
    <div className="corte marcado" id={`corte-${corte.indice}`}>
      <div className="corte-cabeza">
        <span className="corte-num">{numeroCap}</span>
        <div className="corte-texto">
          <p className="corte-nombre">{nombreDeCorte(corte)}</p>
          <p className="corte-motivo">{ui.importar.motivos[corte.motivo]}</p>
        </div>
        <button
          type="button"
          className="boton-secundario"
          onClick={() => enviar({ tipo: 'importacion', accion: { tipo: 'marcar', indice: corte.indice, marcado: false } })}
        >
          {ui.importar.noCortar}
        </button>
      </div>
      {corte.motivo === 'archivo' ? null : dosLineas ? (
        <p className="corte-linea">
          {ui.importar.lineaSiguiente}{' '}
          <button
            type="button"
            className="enlace"
            onClick={() => enviar({ tipo: 'importacion', accion: { tipo: 'lineaSiguiente', indice: corte.indice, usar: false } })}
          >
            {ui.importar.esTexto}
          </button>
        </p>
      ) : (
        puedeDosLineas && (
          <p className="corte-linea">
            <button
              type="button"
              className="enlace"
              onClick={() => enviar({ tipo: 'importacion', accion: { tipo: 'lineaSiguiente', indice: corte.indice, usar: true } })}
            >
              {ui.importar.usarLineaSiguiente}
            </button>
          </p>
        )
      )}
    </div>
  )
}

export function PantallaImportar({
  imp,
  tieneDedicatoria,
  ocupado,
  alConfirmar,
}: {
  imp: Importacion
  tieneDedicatoria: boolean
  ocupado: boolean
  alConfirmar: () => void
}) {
  const ui = useTextos()
  const despachar = useDespacho()
  const vista = useMemo(() => vistaImportacion(imp), [imp])
  const vacios = useMemo(() => capitulosVacios(imp), [imp])
  const url = useUrls(imp.imagenes)
  const documento = useRef<HTMLDivElement>(null)

  const marcados = imp.cortes.filter((c) => c.marcado)
  const numeroDe = new Map(marcados.map((c, i) => [c.indice, i + 1]))
  const nHuerfanos = vista.huerfanos.length
  const viendo = Math.min(imp.viendo, Math.max(0, vista.capitulos.length - 1))
  const capitulo = vista.capitulos[viendo]
  const r = vista.resumen
  const descartados = imp.descartado.reduce((n, d) => n + d.cuantos, 0)
  const inservibles = imp.imagenes.filter((i) => i.info.tipo === null)

  const ver = (i: number): void => {
    despachar({ tipo: 'importacion', accion: { tipo: 'ver', capitulo: i } })
    const indice = vista.indices[i]
    document.getElementById(`corte-${indice}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const partes = [
    r.capitulos === 1 ? ui.importar.resumen.capitulo : ui.importar.resumen.capitulos(ui.formato.numero(r.capitulos)),
    ui.importar.resumen.parrafos(ui.formato.numero(r.parrafos)),
    r.enfasis > 0 && ui.importar.resumen.enfasis(ui.formato.numero(r.enfasis)),
    r.escenas > 0 && ui.importar.resumen.escenas(ui.formato.numero(r.escenas)),
    r.versos > 0 && ui.importar.resumen.versos(ui.formato.numero(r.versos)),
    r.ilustraciones > 0 && ui.importar.resumen.ilustraciones(ui.formato.numero(r.ilustraciones)),
    descartados > 0 && ui.importar.resumen.descartados(ui.formato.numero(descartados)),
  ].filter(Boolean)

  return (
    <div className="importar">
      <header className="importar-cabeza">
        <h1>{ui.importar.revisa}</h1>
        <p className="ayuda">
          <strong>{imp.nombre}</strong> · {ui.importar.revisaAyuda}
        </p>
      </header>

      <div className="importar-cuerpo">
        <section className="documento" ref={documento} aria-label={imp.nombre}>
          {nHuerfanos > 0 && (
            <fieldset className="huerfanos">
              <legend>{ui.importar.antes}</legend>
              <label>
                <input
                  type="radio"
                  name="huerfanos"
                  checked={imp.huerfanos === 'dedicatoria'}
                  disabled={tieneDedicatoria}
                  onChange={() => despachar({ tipo: 'importacion', accion: { tipo: 'huerfanos', destino: 'dedicatoria' } })}
                />
                {ui.importar.huerfanos.dedicatoria}
                {tieneDedicatoria && ` (${ui.importar.huerfanos.yaHay})`}
              </label>
              <label>
                <input
                  type="radio"
                  name="huerfanos"
                  checked={imp.huerfanos === 'fuera'}
                  onChange={() => despachar({ tipo: 'importacion', accion: { tipo: 'huerfanos', destino: 'fuera' } })}
                />
                {ui.importar.huerfanos.fuera}
              </label>
              <p className="ayuda">{ui.importar.huerfanos.primerCapitulo}</p>
              {vista.huerfanos.some((b) => b.tipo === 'ilustracion') && imp.huerfanos === 'dedicatoria' && (
                <p className="ayuda">{ui.importar.huerfanos.imagenes}</p>
              )}
            </fieldset>
          )}

          {imp.bloques.map((b, i) => {
            const corte = corteEn(imp, i)
            const esTitulo = esLineaDeTitulo(imp, i)
            const deTexto = b.tipo === 'parrafo' || b.tipo === 'subtitulo'
            const huerfano = i < nHuerfanos
            return (
              <div
                key={b.id}
                className={`fila${huerfano ? ' es-huerfano' : ''}${esTitulo || corte?.marcado ? ' es-titulo' : ''}`}
              >
                {corte?.marcado && <TarjetaDeCorte corte={corte} numeroCap={numeroDe.get(i) ?? 0} bloques={imp.bloques} />}
                {corte && !corte.marcado && (
                  <div className="corte sugerido" id={`corte-${i}`}>
                    <span>{ui.importar.sugerido}</span>
                    <button
                      type="button"
                      className="boton-secundario"
                      onClick={() => despachar({ tipo: 'importacion', accion: { tipo: 'marcar', indice: i, marcado: true } })}
                    >
                      ✂ {ui.importar.cortarAqui}
                    </button>
                  </div>
                )}
                <div className="fila-linea">
                  {deTexto && !corte?.marcado && !esTitulo ? (
                    <button
                      type="button"
                      className="cortar"
                      onClick={() => despachar({ tipo: 'importacion', accion: { tipo: 'cortarAqui', indice: i } })}
                    >
                      ✂ <span>{ui.importar.cortarAqui}</span>
                    </button>
                  ) : (
                    <span className="cortar-hueco" />
                  )}
                  <Extracto b={b} url={url} />
                </div>
              </div>
            )
          })}
        </section>

        <aside className="asi-queda" aria-label={ui.importar.asiQueda}>
          <h2>{ui.importar.asiQueda}</h2>
          <p className="recuento">{partes.join(' · ')}</p>

          {vacios.length > 0 && (
            <div className="alerta nivel-aviso">
              <p>{ui.importar.vacios(vacios.length)}</p>
              <button type="button" onClick={() => despachar({ tipo: 'importacion', accion: { tipo: 'quitarVacios' } })}>
                {ui.importar.quitarVacios}
              </button>
            </div>
          )}

          {imp.descartado.length > 0 && (
            <div className="alerta nivel-nota">
              <p>
                <strong>{ui.importar.descartado}:</strong>
              </p>
              <ul>
                {imp.descartado.map((d) => (
                  <li key={d.que}>
                    {ui.importar.descartadoQue[d.que] ?? d.que} ({ui.formato.numero(d.cuantos)}): {d.porque}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {imp.faltan.length > 0 && (
            <div className="alerta nivel-aviso">
              <p>{ui.importar.faltan(imp.faltan.length)}</p>
              <p className="lista-nombres">{imp.faltan.join(', ')}</p>
              <p className="ayuda">{ui.importar.faltanAyuda}</p>
            </div>
          )}

          {imp.sobrantes.length > 0 && (
            <div className="alerta nivel-nota">
              <p>{ui.importar.sobrantes(imp.sobrantes.length)}</p>
              <p className="lista-nombres">{imp.sobrantes.join(', ')}</p>
              <p className="ayuda">{ui.importar.sobrantesAyuda}</p>
            </div>
          )}

          {inservibles.length > 0 && (
            <div className="alerta nivel-aviso">
              <p>{ui.importar.inservibles(inservibles.length)}</p>
              <p className="lista-nombres">{inservibles.map((i) => i.nombreOriginal).join(', ')}</p>
              <p className="ayuda">{ui.importar.inserviblesAyuda}</p>
            </div>
          )}

          {vista.capitulos.length === 0 ? (
            <p className="alerta nivel-aviso">{ui.importar.sinCortes}</p>
          ) : (
            <ol className="lista-importados">
              {vista.capitulos.map((c, i) => (
                <li key={c.id}>
                  <button type="button" className={i === viendo ? 'activo' : ''} onClick={() => ver(i)}>
                    {[c.etiqueta, textoDeTramos(c.titulo)].filter(Boolean).join(': ')}
                    <span className="contador">{ui.formato.numero(c.bloques.filter((b) => b.tipo === 'parrafo').length)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {capitulo && (
            <div className="vista-previa">
              <p className="rotulo">
                {ui.importar.vistaPrevia} · {viendo + 1}/{vista.capitulos.length}
              </p>
              <VistaCapitulo capitulo={capitulo} separador="* * *" url={url} />
            </div>
          )}

          <div className="importar-acciones">
            <button
              type="button"
              className="boton-principal"
              disabled={vista.capitulos.length === 0 || ocupado}
              onClick={alConfirmar}
            >
              {ocupado ? ui.importar.importando : ui.importar.confirmar(vista.capitulos.length)}
            </button>
            <button type="button" className="boton-secundario" disabled={ocupado} onClick={() => despachar({ tipo: 'cancelarImportacion' })}>
              {ui.importar.descartar}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
