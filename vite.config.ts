/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// BASE_PATH is set by the GitHub Actions workflow to "/<repo-name>/" because
// GitHub Pages serves project sites from a sub-folder. Locally it is "/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => ({
  base,
  plugins: [
    preact(),
    // `npm run dev:https` → self-signed HTTPS so the phone camera works on your LAN.
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'prompt',
      // Our own service worker (src/sw.ts) so we can handle notification clicks.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,mp3}'] },
      manifest: {
        name: 'Cut Tracker — 20-week cut',
        short_name: 'Cut',
        description: 'Offline workout, food and progress tracker for a 20-week cut.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e1116',
        theme_color: '#0e1116',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
