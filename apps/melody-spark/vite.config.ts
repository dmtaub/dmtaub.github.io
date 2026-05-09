import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/up/melody-spark/',
  build: {
    outDir: '../../up/melody-spark',
    emptyOutDir: true,
  },
});
