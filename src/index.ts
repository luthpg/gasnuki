import * as path from 'node:path';
import * as chokidar from 'chokidar';
import { consola } from 'consola';
import { generateAppsScriptTypes } from './modules/generate';

export interface GenerateOptions {
  project: string;
  srcDir: string;
  outDir: string;
  outputFile: string;
  watch: boolean;
}

export const generateTypes = async ({
  project,
  srcDir,
  outDir,
  outputFile,
  watch,
}: GenerateOptions) => {
  const runGeneration = async (triggeredBy?: string) => {
    const reason = triggeredBy ? ` (${triggeredBy})` : '';
    consola.info(`Generating AppsScript types${reason}...`);
    try {
      await generateAppsScriptTypes({ project, srcDir, outDir, outputFile });
      consola.info('Type generation complete.');
    } catch (e) {
      consola.error(`Type generation failed: ${(e as Error).message}`, e);
    }
  };

  await runGeneration();

  if (watch) {
    const sourcePathToWatch = path.resolve(project, srcDir).replace(/\\/g, '/');
    consola.info(
      `Watching for changes in ${sourcePathToWatch}... (Press Ctrl+C to stop)`,
    );

    const watcher = chokidar.watch(sourcePathToWatch, {
      ignored: ['node_modules', 'dist'],
      persistent: true,
      ignoreInitial: true,
    });

    const eventHandler = async (filePath: string, eventName: string) => {
      consola.info(`Watcher is called triggered on ${eventName}`);
      const relativePath = path.relative(project, filePath);
      await runGeneration(relativePath);
    };

    watcher.on('ready', async () => {
      console.log('...waiting...');
      watcher.on('all', async (event, path) => {
        consola.info(`Watcher is called triggered on ${event}: ${path}`);
        await eventHandler(path, event);
      });
    });

    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, async () => {
        await watcher.close();
        consola.info('Watcher is closed.');
        process.exit(0);
      });
    }
  } else {
    process.exit(0);
  }
};
