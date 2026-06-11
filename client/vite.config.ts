import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../server/public', emptyOutDir: true },
  server: {
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
