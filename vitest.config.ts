import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'electron/src/**/*.test.ts',
            'scripts/**/*.test.ts',
            'docs/.vitepress/**/*.test.ts',
            'src/test/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          sequence: { groupOrder: 1 },
          // Full workbench fixtures are CPU-heavy in jsdom.
          maxWorkers: 2,
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/test/**'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: '.local/coverage',
      include: [
        'src/**/*.{ts,tsx}',
        'electron/src/**/*.ts',
        'scripts/**/*.ts',
        'docs/.vitepress/**/*.ts',
      ],
      exclude: ['**/*.test.*', '**/*.d.ts', 'src/test/**'],
      reporter: ['text-summary', 'json-summary', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
