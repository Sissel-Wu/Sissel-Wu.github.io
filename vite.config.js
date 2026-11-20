import { defineConfig } from 'vite';
import { createContentPlugin } from './src/content/vite-plugin.js';

export default defineConfig({
  base: './',
  plugins: [createContentPlugin()],
  build: { rollupOptions: { output: { manualChunks: (id) => id.includes('node_modules/three') ? 'three' : undefined } } },
});
