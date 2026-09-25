import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer builds to ./dist and is served on :5173 in dev.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
