import * as path from 'node:path';
import { consola } from 'consola';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import type { GenerateOptions } from './index';
import { loadConfig, type UserConfig } from './modules/config';
import { generateAppsScriptTypes } from './modules/generate';

/**
 * A factory function to create the gasnuki Vite plugin.
 * @param options - The user-defined configuration for gasnuki.
 * @returns The Vite plugin object.
 */
export function gasnuki(options?: UserConfig): Plugin {
  let projectRoot: string;
  let gasnukiOptions: Omit<GenerateOptions, 'watch' | 'project'>;

  // Debounce mechanism to prevent rapid-fire regeneration
  let debounceTimer: NodeJS.Timeout | null = null;
  const debounce = (func: () => void, timeout = 300) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(func, timeout);
  };

  const runGeneration = (triggeredBy?: string) => {
    debounce(async () => {
      const reason = triggeredBy ? ` (triggered by: ${triggeredBy})` : '';
      console.log('');
      consola.info(`[gasnuki] Generating AppsScript types${reason}...`);
      try {
        await generateAppsScriptTypes({
          ...gasnukiOptions,
          project: projectRoot,
        });
        consola.success('[gasnuki] Type generation complete.');
      } catch (e) {
        consola.error(
          `[gasnuki] Type generation failed: ${(e as Error).message}`,
        );
      }
    });
  };

  return {
    name: 'vite-plugin-gasnuki',
    apply: 'serve', // Apply only in serve mode

    async configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      const fileConfig = await loadConfig(projectRoot);
      const defaultOptions: Omit<GenerateOptions, 'watch' | 'project'> = {
        srcDir: 'server',
        outDir: 'types',
        outputFile: 'appsscript.ts',
      };
      gasnukiOptions = {
        ...defaultOptions,
        ...fileConfig,
        ...(options || {}),
      };
    },

    async configureServer(server: ViteDevServer) {
      const targetDir = path.resolve(projectRoot, gasnukiOptions.srcDir);

      // Initial generation on server startup
      runGeneration('server startup');

      // Watch for file changes
      server.watcher.on('all', (_event, filePath) => {
        const relativePath = path.relative(targetDir, filePath);

        if (!relativePath.startsWith('..') && relativePath !== '..') {
          runGeneration(path.relative(projectRoot, filePath));
        }
      });
    },
  };
}
