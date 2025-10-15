import { defineBuildConfig } from 'unbuild';
export default defineBuildConfig({
  name: 'gasnuki',
  outDir: 'dist',
  declaration: 'compatible',
  entries: ['src/cli.ts', 'src/index.ts', 'src/promise.ts', 'src/vite.ts'],
  clean: true,
  rollup: {
    emitCJS: true,
  },
});
