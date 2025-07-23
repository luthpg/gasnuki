import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'playground/**/*',
        'dist/**/*',
        'node_modules/**/*',
        'types/**/*',
        './*.ts',
        '.bin/**/*',
      ],
    },
  },
});
