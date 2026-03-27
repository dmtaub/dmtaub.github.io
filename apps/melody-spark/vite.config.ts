import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/melody-spark/',
  build: {
    outDir: '../../melody-spark',
    emptyOutDir: true,
  },
});
