import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// O .env fica na raiz do repositório e é compartilhado com o Bridge.
// O HUD fala com o Bridge via proxy em /api (mesma origem; facilita o acesso pelo celular).
// Em produção o próprio Bridge serve o HUD compilado (hud/dist) e a API em /api.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '')
  const bridge = `http://${env.BRIDGE_HOST || '127.0.0.1'}:${env.BRIDGE_PORT || '8787'}`
  return {
    plugins: [react(), tailwindcss()],
    envDir: '..',
    envPrefix: ['VITE_', 'BRIDGE_TOKEN'],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: bridge,
          changeOrigin: true,
          // O Bridge serve a API em /api (mesmo caminho do HUD compilado), então não reescreve.
          ws: true,
        },
      },
    },
  }
})
