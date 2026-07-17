import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  clearScreen: false,
  server: {
    port: Number(process.env.HACKDESK_VITE_PORT ?? '1420'),
    strictPort: true,
  },
  envPrefix: ['VITE_', 'HACKDESK_'],
}));
