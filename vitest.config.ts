import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __TARGET__: JSON.stringify('chrome'),
    __DEV__: 'false',
    __E2E__: 'false',
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/build/**/*.test.ts'],
    environment: 'happy-dom',
    testTimeout: 60_000,
  },
});
