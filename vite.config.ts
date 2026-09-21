import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Escucha en la red local: así podés abrir el cliente desde el celular en modo dev.
    host: true,
    // En dev el cliente vive en :5173 y el socket en :3000. En producción son el mismo origen.
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/health': { target: 'http://localhost:3000' },
    },
  },
})
