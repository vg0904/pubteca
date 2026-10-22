import { useEffect, useMemo, useState } from 'react'
import { ui } from '../../i18n/es'
import type { LibroGenerado } from '../motor'
import { abrirEpub, documentoDePagina, tipoDe, type Tema } from '../vista-previa'

/**
 * El EPUB generado, pagina a pagina, en un iframe aislado: el XHTML y el CSS
 * de verdad, los mismos bytes que se descargan. Ver vista-previa.ts.
 *
 * El iframe no ejecuta nada (`sandbox` sin `allow-scripts`); `allow-same-origin`
 * solo hace falta para que pueda cargar las imagenes y las fuentes por sus URL
 * `blob:`, que son de esta pagina.
 */
export function VistaPrevia({ resultados }: { resultados: readonly LibroGenerado[] }) {
  const [tienda, setTienda] = useState<LibroGenerado['tienda']>('AppleBooks')
  const [tema, setTema] = useState<Tema>('claro')
  const [indice, setIndice] = useState(0)

  const bytes = resultados.find((r) => r.tienda === tienda)?.bytes
  const epub = useMemo(() => (bytes ? abrirEpub(bytes) : null), [bytes])
  const total = epub?.paginas.length ?? 0
  const i = Math.min(indice, Math.max(0, total - 1))
  const pagina = epub?.paginas[i]

  // Cada documento crea las URL `blob:` de lo que necesita (la hoja ya va
  // dentro; las imagenes y las fuentes no), y se sueltan cuando el documento
  // cambia: despues de pintar el nuevo, que ya usa las suyas.
  const previa = useMemo(() => {
    if (!epub || !pagina) return null
    const creadas = new Map<string, string>()
    const url = (ruta: string): string => {
      const ya = creadas.get(ruta)
      if (ya) return ya
      const datos = epub.archivos.get(ruta)
      const u = datos ? URL.createObjectURL(new Blob([datos as Uint8Array<ArrayBuffer>], { type: tipoDe(ruta) })) : ''
      creadas.set(ruta, u)
      return u
    }
    return { documento: documentoDePagina(epub, pagina.ruta, url, tema), urls: [...creadas.values()] }
  }, [epub, pagina, tema])
  useEffect(
    () => () => {
      for (const u of previa?.urls ?? []) if (u) URL.revokeObjectURL(u)
    },
    [previa],
  )

  if (!epub || !pagina || !previa) return null

  return (
    <section className="vista-previa" aria-label={ui.vistaPrevia.titulo}>
      <h2>{ui.vistaPrevia.titulo}</h2>
      <p className="ayuda">{ui.vistaPrevia.ayuda}</p>
      <div className="vista-controles">
        <label>
          <span>{ui.vistaPrevia.tienda}</span>
          <select value={tienda} onChange={(e) => setTienda(e.target.value as LibroGenerado['tienda'])}>
            <option value="AppleBooks">{ui.descargar.apple}</option>
            <option value="Kindle">{ui.descargar.kindle}</option>
          </select>
        </label>
        <label>
          <span>{ui.vistaPrevia.tema}</span>
          <select value={tema} onChange={(e) => setTema(e.target.value as Tema)}>
            {(Object.keys(ui.vistaPrevia.temas) as Tema[]).map((t) => (
              <option key={t} value={t}>
                {ui.vistaPrevia.temas[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="vista-pagina">
          <span>{ui.vistaPrevia.pagina(i + 1, total)}</span>
          <select value={i} onChange={(e) => setIndice(Number(e.target.value))}>
            {epub.paginas.map((p, k) => (
              <option key={p.ruta} value={k}>
                {p.titulo}
              </option>
            ))}
          </select>
        </label>
        <div className="vista-pasos">
          <button type="button" className="boton-secundario" disabled={i === 0} onClick={() => setIndice(i - 1)}>
            {ui.vistaPrevia.anterior}
          </button>
          <button type="button" className="boton-secundario" disabled={i === total - 1} onClick={() => setIndice(i + 1)}>
            {ui.vistaPrevia.siguiente}
          </button>
        </div>
      </div>
      <iframe
        className={`vista-marco tema-${tema}`}
        title={ui.vistaPrevia.marco(pagina.titulo)}
        sandbox="allow-same-origin"
        srcDoc={previa.documento}
        // Con el tema oscuro, el libro ve `prefers-color-scheme: dark`: asi se
        // comprueba el logo blanco de Apple Books.
        style={{ colorScheme: tema === 'oscuro' ? 'dark' : 'light' }}
      />
    </section>
  )
}
