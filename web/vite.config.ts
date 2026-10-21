import { defineConfig } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000';
const proxy = Object.fromEntries(
  ['/api', '/health', '/labels', '/predict'].map((path) => [
    path,
    { target: apiTarget, changeOrigin: true },
  ]),
);

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
    open: false,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
});
