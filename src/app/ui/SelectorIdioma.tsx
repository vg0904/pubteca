/**
 * El idioma de la INTERFAZ.
 *
 * No es el idioma del libro, que se elige en «Descargar EPUB» y decide el
 * `lang` del EPUB y sus textos internos. Aqui solo se cambia en que idioma
 * habla Pubteca, y se recuerda en este navegador.
 *
 * Cada idioma se nombra en si mismo («English», no «Inglés»): quien busca su
 * idioma en un menu que no entiende no sabe que palabra buscar.
 */
import { IDIOMAS, NOMBRES, esIdioma } from '../../i18n'
import { useLengua, useTextos } from './contexto'

export function SelectorIdioma({ className = '' }: { className?: string }) {
  const ui = useTextos()
  const { idioma, cambiar } = useLengua()
  return (
    <label className={`selector-idioma ${className}`.trim()}>
      <span className="sr">{ui.idiomaUi}</span>
      <select
        value={idioma}
        aria-label={ui.idiomaUi}
        title={ui.idiomaUi}
        onChange={(e) => {
          if (esIdioma(e.target.value)) cambiar(e.target.value)
        }}
      >
        {IDIOMAS.map((i) => (
          <option key={i} value={i}>
            {NOMBRES[i]}
          </option>
        ))}
      </select>
    </label>
  )
}
