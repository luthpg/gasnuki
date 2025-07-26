import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cli, parseArgs } from '../src/cli';

// commander, loadConfig, generateTypesのモック
vi.mock('commander', () => ({
  Command: vi.fn(() => ({
    opts: vi.fn(() => ({
      project: '/p',
      watch: false,
      srcDir: 'src',
      outDir: 'out',
      outputFile: 'types.ts',
    })),
    options: [
      { attributeName: () => 'project', defaultValue: '/p' },
      { attributeName: () => 'watch', defaultValue: false },
      { attributeName: () => 'srcDir', defaultValue: 'src' },
      { attributeName: () => 'outDir', defaultValue: 'out' },
      { attributeName: () => 'outputFile', defaultValue: 'types.ts' },
    ],
    getOptionValueSource: vi.fn(() => 'cli'),
    parseAsync: vi.fn(),
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
  })),
}));
vi.mock('../src/modules/config', () => ({ loadConfig: vi.fn(() => ({})) }));
vi.mock('../src/index', () => ({
  generateTypes: vi.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseArgs', () => {
  it('CLIオプションとconfigのマージが正しく行われる', async () => {
    const { Command } = await import('commander');
    const command = new Command();
    const { generateTypes } = await import('../src/index');
    await parseArgs(command);
    expect(generateTypes).toHaveBeenCalled();
    // 呼び出し時の引数にproject, watch等が含まれる
    const callArg = (generateTypes as any).mock.calls[0][0];
    expect(callArg.project).toBe('/p');
    expect(callArg.watch).toBe(false);
  });
});

describe('cli', () => {
  it('CLIエントリポイントがエラーなく動作する', async () => {
    await expect(cli()).resolves.not.toThrow();
  });
});
