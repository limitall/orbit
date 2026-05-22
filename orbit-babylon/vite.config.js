import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5174,
    strictPort: true,
    open: false,
  },
  // Don't pre-bundle Babylon: its shader modules register via side-effects that
  // Vite's optimizer strips, causing runtime shader fetches that 404 to index.html.
  optimizeDeps: {
    exclude: ['@babylonjs/core', '@babylonjs/procedural-textures'],
  },
});
