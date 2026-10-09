import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'export', environment: 'node', include: ['src/**/*.test.ts'] },
});
