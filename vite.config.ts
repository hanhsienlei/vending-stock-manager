// `defineConfig` comes from vitest/config, not vite — the plain Vite export has no
// `test` key and the config will not typecheck.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vending Stock Manager',
        short_name: 'Vending',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0071e3',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
