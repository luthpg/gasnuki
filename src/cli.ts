#! /usr/bin/env  node

import * as path from 'node:path';
import { Command } from 'commander';
import { version } from '../package.json';
import { type GenerateOptions, generateTypes } from './index';
import { loadConfig } from './modules/config';

export const parseArgs = async (command: Command) => {
  const cliOpts = command.opts<GenerateOptions>();

  const fileConfig = await loadConfig(path.resolve(cliOpts.project));

  const defaultOpts: Partial<GenerateOptions> = {};
  for (const option of command.options) {
    const key = option.attributeName() as keyof GenerateOptions;
    defaultOpts[key] = option.defaultValue;
  }

  const explicitCliOpts: Partial<GenerateOptions> = {};
  for (const option of command.options) {
    const key = option.attributeName() as keyof GenerateOptions;
    if (command.getOptionValueSource(key) === 'cli') {
      // biome-ignore lint: use any for Partial object
      explicitCliOpts[key] = cliOpts[key] as any;
    }
  }

  const finalOptions: GenerateOptions = {
    ...(defaultOpts as GenerateOptions),
    ...fileConfig,
    ...explicitCliOpts,
    project: cliOpts.project,
    watch: cliOpts.watch,
  };

  await generateTypes(finalOptions);
};

export const runCli = async () => {
  const program = new Command();

  program
    .name('gasnuki')
    .description(
      'Generate type definitions and utilities for Google Apps Script client-side API',
    );

  program.version(version, '-v, --version');

  program
    .action(async (_param, command: Command) => await parseArgs(command))
    .option(
      '-p, --project <project>',
      'Project root directory path',
      process.cwd().replace(/\\/g, '/'),
    )
    .option(
      '-s, --srcDir <dir>',
      'Source directory name (relative to project root)',
      'server',
    )
    .option(
      '-o, --outDir <dir>',
      'Output directory name (relative to project root)',
      'types',
    )
    .option('-f, --outputFile <file>', 'Output file name', 'appsscript.ts')
    .option('-w, --watch', 'Watch for changes and re-generate types', false)
    .option('--cache', 'Enable checking generation cache', true)
    .option('--no-cache', 'Disable checking generation cache', true);

  await program.parseAsync(process.argv);
};

// Check if this module is the main entry point
const isMainModule = typeof require !== 'undefined' && require.main === module;
// For ESM/Vite environments, simplistic check might be needed or assume it's called via bin
if (isMainModule || process.argv[1] === import.meta.filename) {
  runCli();
}
