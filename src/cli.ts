#! /usr/bin/env  node

import { Command } from 'commander';
import { name, version } from '../package.json';
import { type GenerateOptions, generateTypes } from './index';

export const parseArgs = async (command: Command) => {
  const { project, srcDir, outDir, outputFile, watch } =
    command.opts<GenerateOptions>();

  await generateTypes({ project, srcDir, outDir, outputFile, watch });
};

export const cli = async () => {
  const program = new Command();

  program.name(name);

  program.version(version, '-v, --version');

  program
    .action(async (_param, command: Command) => await parseArgs(command))
    .option(
      '-p, --project <project>',
      'Project root directory path',
      process.cwd(),
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
    .option('-w, --watch', 'Watch for changes and re-generate types', false);

  await program.parseAsync(process.argv);
};

cli();
