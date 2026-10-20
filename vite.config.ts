import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// El base path acaba en la URL publica de GitHub Pages. Si se olvida, el sitio
// despliega "con exito" y queda en blanco con 404 en todos los assets.
// Por defecto va el de produccion para que el desarrollo local no se desvie.
const base = process.env.VITE_BASE ?? '/pubteca/'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    // Suelo de navegador: Safari 16.4 (OffscreenCanvas.convertToBlob, DecompressionStream)
    target: ['es2022', 'safari16.4'],
  },
  test: {
    // El core es TS puro y sincrono: corre en node, sin navegador.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
})
