import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cli, parseArgs } from '../src/cli';

// commander, loadConfig, generateTypesのモック
vi.mock('commander', () => ({
  Command: vi.fn(() => ({
    opts: vi.fn(() => ({
      project: '/p',
      watch: false,
      srcDir: 'server',
      outDir: 'types',
      outputFile: 'appsscript.ts',
    })),
    options: [
      { attributeName: () => 'project', defaultValue: '/p' },
      { attributeName: () => 'watch', defaultValue: false },
      { attributeName: () => 'srcDir', defaultValue: 'server' },
      { attributeName: () => 'outDir', defaultValue: 'types' },
      { attributeName: () => 'outputFile', defaultValue: 'appsscript.ts' },
    ],
    getOptionValueSource: vi.fn(() => 'default'),
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

  it('ファイル設定がCLIオプションより優先される', async () => {
    const { Command } = await import('commander');
    const { loadConfig } = await import('../src/modules/config');
    const { generateTypes } = await import('../src/index');

    // ファイル設定をモック
    (loadConfig as any).mockResolvedValue({
      srcDir: 'custom-src',
      outDir: 'custom-out',
      outputFile: 'custom.ts',
    });

    const command = new Command();
    command.getOptionValueSource = vi.fn(() => 'default');
    await parseArgs(command);

    const callArg = (generateTypes as any).mock.calls[0][0];
    expect(callArg.srcDir).toBe('custom-src');
    expect(callArg.outDir).toBe('custom-out');
    expect(callArg.outputFile).toBe('custom.ts');
  });

  it('明示的なCLIオプションがファイル設定より優先される', async () => {
    const { Command } = await import('commander');
    const { loadConfig } = await import('../src/modules/config');
    const { generateTypes } = await import('../src/index');

    // ファイル設定をモック
    (loadConfig as any).mockResolvedValue({
      srcDir: 'file-src',
      outDir: 'file-out',
    });

    // CLIオプションの値を明示的に設定
    const command = new Command();
    command.getOptionValueSource = vi.fn((key: string) => {
      if (key === 'srcDir') return 'cli';
      return 'default';
    });
    // CLIオプションの値を明示的に設定
    (command.opts as any) = vi.fn(() => ({
      project: '/p',
      watch: false,
      srcDir: 'cli-src', // CLIで明示的に設定された値
      outDir: 'out',
      outputFile: 'types.ts',
    }));

    await parseArgs(command);

    const callArg = (generateTypes as any).mock.calls[0][0];
    expect(callArg.srcDir).toBe('cli-src'); // CLIオプションが優先
    expect(callArg.outDir).toBe('file-out'); // ファイル設定が使用
  });

  it('デフォルト値が正しく設定される', async () => {
    const { Command } = await import('commander');
    const { loadConfig } = await import('../src/modules/config');
    const { generateTypes } = await import('../src/index');

    // loadConfigを空のオブジェクトを返すように明示的にリセット
    (loadConfig as any).mockResolvedValue({});

    const command = new Command();
    command.getOptionValueSource = vi.fn(() => 'default');

    await parseArgs(command);

    const callArg = (generateTypes as any).mock.calls[0][0];
    console.dir(callArg);
    expect(callArg.srcDir).toBe('server');
    expect(callArg.outDir).toBe('types');
    expect(callArg.outputFile).toBe('appsscript.ts');
    expect(callArg.watch).toBe(false);
  });

  it('watchオプションが正しく処理される', async () => {
    const { Command } = await import('commander');
    const { generateTypes } = await import('../src/index');

    const command = new Command();
    (command.opts as any) = vi.fn(() => ({
      project: '/p',
      watch: true,
      srcDir: 'server',
      outDir: 'types',
      outputFile: 'appsscript.ts',
    }));

    await parseArgs(command);

    const callArg = (generateTypes as any).mock.calls[0][0];
    expect(callArg.watch).toBe(true);
  });

  it('プロジェクトパスが正しく設定される', async () => {
    const { Command } = await import('commander');
    const { generateTypes } = await import('../src/index');

    const command = new Command();
    (command.opts as any) = vi.fn(() => ({
      project: '/custom/project',
      watch: false,
      srcDir: 'server',
      outDir: 'types',
      outputFile: 'appsscript.ts',
    }));

    await parseArgs(command);

    const callArg = (generateTypes as any).mock.calls[0][0];
    expect(callArg.project).toBe('/custom/project');
  });

  it('generateTypesでエラーが発生した場合に適切に処理される', async () => {
    const { Command } = await import('commander');
    const { generateTypes } = await import('../src/index');

    // generateTypesでエラーを投げる
    (generateTypes as any).mockRejectedValue(new Error('Generation failed'));

    const command = new Command();

    await expect(parseArgs(command)).rejects.toThrow('Generation failed');
  });
});

describe('cli', () => {
  it('CLIエントリポイントがエラーなく動作する', async () => {
    await expect(cli()).resolves.not.toThrow();
  });

  // CLIの詳細なテストは複雑なモックが必要なため、基本的な動作のみをテスト
  it('CLIが正常に実行される', async () => {
    const { Command } = await import('commander');

    await cli();

    // Commandが作成されることを確認
    expect(Command).toHaveBeenCalled();
  });
});
