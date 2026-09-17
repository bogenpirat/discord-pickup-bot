import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/scripts/**', 'src/types/**', 'src/valorant/generated/**'],
      thresholds: {
        'src/domain/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'src/audit/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/db/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/ui/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/lib/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/discord/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/http/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/commands/**': { lines: 80, branches: 80, functions: 80, statements: 80 },
        'src/buttons/**': { lines: 80, branches: 80, functions: 80, statements: 80 },
        'src/config/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/steam/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/valorant/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});
