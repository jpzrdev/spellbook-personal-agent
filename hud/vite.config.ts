import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The .env lives at the repository root and is shared with the Bridge.
// The HUD talks to the Bridge through a proxy at /api (same origin; makes access from the phone easier).
// In production the Bridge itself serves the built HUD (hud/dist) and the API at /api.
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
          // The Bridge serves the API at /api (same path as the built HUD), so no rewrite.
          ws: true,
        },
      },
    },
  }
})
