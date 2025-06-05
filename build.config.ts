import { defineBuildConfig } from 'unbuild';
export default defineBuildConfig({
  name: 'gasnuki',
  outDir: 'dist',
  declaration: 'compatible',
  entries: ['src/cli.ts', 'src/index.ts'],
  clean: true,
  rollup: {
    emitCJS: true,
  },
});
