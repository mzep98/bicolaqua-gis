import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BicolAqua-GIS Field PWA',
        short_name: 'BicolAqua',
        description: 'Offline-first community water access & quality field logger for Naga City',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: []
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }
    })
  ]
});