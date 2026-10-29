import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts']
  },
  resolve: {
    alias: {
      '@pubpay/shared-services': path.resolve(
        __dirname,
        '../../packages/shared-services/src/index.ts'
      )
    }
  }
});
