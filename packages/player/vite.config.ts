import { defineConfig } from 'vite';

/* player.js: one classic script with no imports, so the two-line embed works on any page (docs/02-architecture.md, "Player
   internals"). Everything it needs from @waypost/core and @waypost/render is bundled in; Zod and Immer are left behind because
   those packages are free of side effects and the player only imports pure helpers. */
export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    lib: { entry: 'src/standalone.ts', formats: ['iife'], name: 'WaypostPlayer', fileName: () => 'player.js' },
  },
});
