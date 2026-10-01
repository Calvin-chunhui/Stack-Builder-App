import { defineConfig } from 'vitest/config';

// The engine is framework-free, so it needs no Astro plugin here. It does rely on
// Vite's `import.meta.glob` to load the tool records, which Vitest supports natively.
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    // The engine imports 100 JSON records; caching transforms keeps reruns fast.
    fsModuleCache: true,
  },
  resolve: {
    alias: {
      '@engine': new URL('./src/engine', import.meta.url).pathname,
      '@data': new URL('./src/data', import.meta.url).pathname,
    },
  },
});
