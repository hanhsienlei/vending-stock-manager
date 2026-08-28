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
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Vending Stock Manager',
        short_name: 'Vending',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0071e3',
        // Chrome/Android will not offer "install" without both a 192 and a 512.
        // The maskable variant keeps its content inside the middle 80% so a
        // launcher's circle or squircle mask cannot crop it.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Worktrees live inside the repository — at `.claude/worktrees/<name>/`
    // when the harness creates them, or `.worktrees/<name>/` when they are
    // made with plain `git worktree add`. Both are excluded, because either
    // one breaks the run the same way: `npm test` in the main checkout also
    // collects every test file in the worktree, and since each worktree has
    // its own `node_modules`, the run ends up with two copies of React, so
    // every hook throws and the suite reports hundreds of phantom failures.
    //
    // Only `.claude/**` was listed until 2026-08-29, when a worktree created
    // at `.worktrees/interface-refinement` turned a green 482-test suite into
    // "240 failed, 724 passed" the moment its branch was merged — 964 being
    // exactly twice 482. The merge was fine; the glob was not.
    //
    // Vitest's defaults are replaced wholesale, not merged, so
    // `**/node_modules/**` and `**/dist/**` are repeated here.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      '**/.worktrees/**',
    ],
  },
})
