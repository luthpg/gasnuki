import { defineConfig } from 'rolldown';
import { removeExportPlugin } from 'rolldown-plugin-remove-export';


export default defineConfig({
  input: ['./src/server/code.ts'],
  output: {
    file: './dist/app.js',
    format: 'esm',
  },
  
  plugins: [removeExportPlugin('app.js')],
});
