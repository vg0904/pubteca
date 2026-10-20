import { ui } from './i18n/es'

export default function App() {
  return (
    <main>
      <h1>{ui.nombre}</h1>
      <p className="lema">{ui.lema}</p>
      <p>{ui.descripcion}</p>
      <p className="privacidad">{ui.privacidad}</p>
      <hr />
      <p className="nota">
        <strong>{ui.enConstruccion}.</strong> {ui.enConstruccionDetalle}
      </p>
    </main>
  )
}
