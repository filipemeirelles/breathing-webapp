import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Caminhos relativos: funcionam na raiz (Capacitor/Android) e em subcaminho
  // (GitHub Pages: usuario.github.io/breathing-webapp/).
  base: './',
})
