import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Publicação na Azure (App Service Linux) serve a SPA na raiz do domínio.
  // O base '/orcamento-mt/' era exigido pelo GitHub Pages (subpasta do repositório),
  // que deixou de ser o ambiente de publicação (R3.5).
  base: '/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
