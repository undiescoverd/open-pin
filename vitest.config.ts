import { defineConfig } from 'vitest/config';

/* One run covers every package; each project keeps its own environment (node or jsdom). */
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/editor/vitest.config.ts'],
  },
});
