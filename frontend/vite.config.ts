import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // MapLibre is lazy-loaded; its vendor bundle is intentionally above Vite's default warning threshold.
    chunkSizeWarningLimit: 1200,
  },
})