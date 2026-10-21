import type { ReactNode } from 'react'
import { ui } from '../../i18n/es'
import type { Bloque, Capitulo, Tramo } from '../modelo'

/** Unos tramos como elementos de React: sin innerHTML, el texto nunca se interpreta. */
export function Tramos({ tramos }: { tramos: readonly Tramo[] }) {
  return (
    <>
      {tramos.map((t, i) => {
        let n: ReactNode = t.texto
        if (t.marcas.includes('cursiva')) n = <em>{n}</em>
        if (t.marcas.includes('negrita')) n = <strong>{n}</strong>
        return <span key={i}>{n}</span>
      })}
    </>
  )
}

function Ilustracion({ imagenId, alt, url }: { imagenId: string; alt: string; url: (id: string) => string | undefined }) {
  const u = url(imagenId)
  return (
    <figure className="vista-ilus">
      <p className="pagina-propia" aria-hidden="true">
        {ui.ilustracion.paginaPropia}
      </p>
      {u ? <img src={u} alt={alt} /> : <p className="ilus-falta">{ui.ilustracion.falta(imagenId)}</p>}
      {alt && <figcaption>{alt}</figcaption>}
    </figure>
  )
}

function VistaBloque({ b, primero, separador, url }: { b: Bloque; primero: boolean; separador: string; url: (id: string) => string | undefined }) {
  switch (b.tipo) {
    case 'parrafo':
      return (
        <p className={primero ? 'primero' : undefined}>
          <Tramos tramos={b.tramos} />
        </p>
      )
    case 'subtitulo':
      return (
        <h3 className="subtitulo">
          <Tramos tramos={b.tramos} />
        </h3>
      )
    case 'escena':
      return <p className="escena">{separador}</p>
    case 'versos':
      return (
        <div className="versos">
          {b.estrofas.map((e, i) => (
            <div className="estrofa" key={i}>
              {e.map((v, k) => (
                <p key={k}>
                  <Tramos tramos={[v]} />
                </p>
              ))}
            </div>
          ))}
        </div>
      )
    case 'ilustracion':
      return <Ilustracion imagenId={b.imagenId} alt={b.alt} url={url} />
  }
}

/**
 * Un capitulo pintado como en el libro: la etiqueta encima del titulo, el
 * primer parrafo sin sangria y cada ilustracion en su pagina.
 */
export function VistaCapitulo({
  capitulo,
  separador,
  url,
}: {
  capitulo: Capitulo
  separador: string
  url: (id: string) => string | undefined
}) {
  // Sin sangria el primer parrafo tras la cabecera, una escena, un subtitulo o
  // unos versos: lo mismo que decide secuencia() en el motor.
  const sinSangria = capitulo.bloques.reduce<{ previo: boolean; marcas: boolean[] }>(
    (acc, b) => ({
      previo: b.tipo === 'parrafo' ? false : b.tipo === 'ilustracion' ? acc.previo : true,
      marcas: [...acc.marcas, b.tipo === 'parrafo' && acc.previo],
    }),
    { previo: true, marcas: [] },
  ).marcas
  return (
    <div className="vista-capitulo">
      {capitulo.aperturas.map((a, i) => (
        <Ilustracion key={i} imagenId={a.imagenId} alt={a.alt} url={url} />
      ))}
      <div className="vista-cabecera">
        {capitulo.etiqueta && <p className="num-capitulo">{capitulo.etiqueta}</p>}
        <h2 className="titulo-capitulo">
          <Tramos tramos={capitulo.titulo} />
        </h2>
      </div>
      {capitulo.bloques.map((b, i) => (
        <VistaBloque key={b.id} b={b} primero={sinSangria[i] ?? false} separador={separador} url={url} />
      ))}
    </div>
  )
}
