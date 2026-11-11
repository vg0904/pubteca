/**
 * Lo que Pubteca usa de Mediabunny, y nada mas.
 *
 * Se importa SIEMPRE con `import()` (ver `mediabunny()` en inspeccionar.ts):
 * quien no añade audio ni video no lo descarga. Y se importa a traves de este
 * modulo, nombre a nombre, porque un `import('mediabunny')` del paquete
 * entero impide que el empaquetador quite lo que no se usa (HLS, MPEG-TS,
 * Matroska...).
 *
 * Los formatos que se leen son los que un autor tiene a mano: lo que graba un
 * telefono (.mov, .mp4, .m4a), WAV, MP3 y AAC suelto. Cualquier otro no se
 * reconoce y el plan dice «no es un formato que se pueda leer», con el
 * consejo de exportarlo a uno de estos.
 */
import { ADTS, MP3, MP4, QTFF, WAVE } from 'mediabunny'

export {
  ADTS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  canEncodeAudio,
  canEncodeVideo,
  Input,
  MP3,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  QUALITY_HIGH,
  StreamTarget,
  VideoSample,
  WAVE,
} from 'mediabunny'

export const FORMATOS = [MP4, QTFF, WAVE, MP3, ADTS]
