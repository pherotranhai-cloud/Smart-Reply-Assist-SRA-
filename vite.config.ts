import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import pkg from './package.json';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const plugins = [
    react(),
    tailwindcss(),
    // The app's only service worker and only web manifest. A second, hand-written
    // worker (public/service-worker.js, registered from src/pwa/registerSW.ts) and
    // a second manifest (public/manifest.json, linked from index.html) used to
    // compete with these on the same scope: the two registrations replaced each
    // other, the hand-written one precached no JS/CSS, so the app could not open
    // offline after a first visit, and installs picked whichever manifest won.
    VitePWA({
      registerType: 'autoUpdate',
      // Inline the registration in index.html: a separate registerSW.js is one
      // more file that has to be cached before the app can open offline.
      injectRegister: 'inline',
      includeAssets: ['favicon.ico', 'icon16.png', 'icon48.png', 'icon128.png'],
      // Values from the manifest browsers were actually using (the first <link>).
      manifest: {
        name: 'Smart Reply Assist',
        short_name: 'SRA',
        description: 'AI assistant for translation and message composition.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#006D77',
        background_color: '#006D77',
        icons: [
          { src: 'icon192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android share sheet → App.tsx reads ?text= on /share-handler.
        share_target: {
          action: '/share-handler',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      workbox: {
        // Any in-app path (a bookmark, /share-handler) opens the cached shell
        // offline instead of a browser network error. API calls never do.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//],
      },
    }),
  ];

  return {
    plugins,
    define: {
      // package.json is the single source of truth for the app version.
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // The app has no dynamic imports left, so everything builds into one
      // chunk on purpose: a tab used to fetch its own chunk on first open,
      // which arrived in the middle of the swipe that asked for it. Rollup
      // warns past 500 kB and recommends splitting it back up — this raises
      // the bar above the real bundle instead, so a genuine jump in size is
      // still what the warning reports.
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          // Default Vite chunking handles deduplication correctly
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:8888',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/.netlify/functions')
        }
      }
    },
  };
});
