import * as fs from 'node:fs/promises';

(async () => {
  const file = await fs.readFile('./bin/typedef/clientside.d.ts', 'utf-8');
  await fs.writeFile(
    './src/modules/clientside.json',
    JSON.stringify({
      text: file,
    }),
  );
})();
