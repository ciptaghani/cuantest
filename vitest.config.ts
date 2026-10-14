import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // `server-only` melempar error di luar React Server; aman dinetralkan saat tes.
      'server-only': fileURLToPath(new URL('./tests/stubs/empty.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Tanggal di HTML memakai waktu lokal; samakan dengan zona waktu bisnis.
    env: { TZ: 'Asia/Jakarta' },
  },
});
