import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/adapters/types.ts'],
      reporter: ['text', 'text-summary', 'html', 'lcov', 'cobertura', 'json-summary'],
      reportOnFailure: true,
      thresholds: { statements: 85, branches: 80, functions: 85, lines: 85 },
    },
  },
});
