import * as fs from 'node:fs';
import * as path from 'node:path';
import { consola } from 'consola';
import { createJiti } from 'jiti';
import type { GenerateOptions } from '..';
import { FunctionDeclaration } from 'ts-morph';

/**
 * User-defined configuration for gasnuki.
 * `project` and `watch` options are excluded as they are runtime flags.
 */
export type UserConfig = Partial<Omit<GenerateOptions, 'watch' | 'project'>>;

/**
 * A helper function to define the gasnuki configuration with type safety.
 * @param config The configuration object.
 * @returns The configuration object.
 */
export function defineConfig(config: UserConfig): UserConfig {
  return config;
}

/**
 * Loads the gasnuki configuration file from the project root.
 * It looks for `gasnuki.config.[ts|js|mjs|cjs]` files.
 * @param projectRoot The root directory of the project.
 * @returns A promise that resolves to the user configuration object.
 */
export async function loadConfig(projectRoot: string): Promise<UserConfig> {
  const configFileExtensions = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];

  let foundConfigPath: string | undefined;
  let foundConfigFileName: string | undefined;

  for (const configFileExtension of configFileExtensions) {
    const configFile = `gasnuki.config${configFileExtension}`;
    const fullPath = path.resolve(projectRoot, configFile);
    if (fs.existsSync(fullPath)) {
      foundConfigPath = fullPath;
      foundConfigFileName = configFile;
      break;
    }
  }

  if (!foundConfigPath || !foundConfigFileName) {
    // No config file found, which is fine.
    return {};
  }

  try {
    // Use jiti to load the configuration file
    const jiti = createJiti(projectRoot, {
      fsCache: false,
      moduleCache: false,
      interopDefault: true,
    });
    const configModule: UserConfig = await jiti.import(foundConfigPath, {
      default: true,
    });
    consola.success(`Loaded configuration from ${foundConfigFileName}`);
    return configModule;
  } catch (error) {
    consola.error(`Error loading ${foundConfigFileName}:`, error);
    return {};
  }
}
