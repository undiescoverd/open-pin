import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'capture', environment: 'node', include: ['src/**/*.test.ts'] },
});
