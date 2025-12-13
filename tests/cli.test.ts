import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgs, runCli } from '../src/cli';

// commander, loadConfig, generateTypesのモック
vi.mock('commander', () => {
  const mockOpts = vi.fn(() => ({
    project: '/p',
    watch: false,
    srcDir: 'server',
    outDir: 'types',
    outputFile: 'appsscript.ts',
  }));

  const mockName = vi.fn();
  const mockDescription = vi.fn();
  const mockVersion = vi.fn();
  const mockAction = vi.fn();
  const mockOption = vi.fn();
  const mockParseAsync = vi.fn();

  // Chainable mocks
  mockName.mockReturnValue({ description: mockDescription }); // simplified chaining setup if needed, but returning 'this' is tricky with shared spies in a class context if 'this' differs.
  // Actually, simplest is to have them return a shared 'mockProgram' object or similar?
  // But usage is `program.name().description()...`
  // So they need to return the instance.

  class Command {
    opts = mockOpts;
    options: any[] = [
      { attributeName: () => 'project', defaultValue: '/p' },
      { attributeName: () => 'watch', defaultValue: false },
      { attributeName: () => 'srcDir', defaultValue: 'server' },
      { attributeName: () => 'outDir', defaultValue: 'types' },
      { attributeName: () => 'outputFile', defaultValue: 'appsscript.ts' },
    ];
    getOptionValueSource = vi.fn(() => 'default');
    parseAsync = mockParseAsync;

    constructor() {
      this.name = mockName;
      this.description = mockDescription;
      this.version = mockVersion;
      this.action = mockAction;
      this.option = mockOption;

      // Use implementation to support chaining
      mockName.mockImplementation((..._args) => {
        return this;
      });
      mockDescription.mockImplementation(() => this);
      mockVersion.mockImplementation(() => this);
      mockAction.mockImplementation(() => this);
      mockOption.mockImplementation(() => this);
    }

    name: any;
    description: any;
    version: any;
    action: any;
    option: any;
  }
  return {
    Command,
    mockOpts,
    mockName,
    mockDescription,
    mockVersion,
    mockAction,
    mockOption,
    mockParseAsync,
  };
});
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
    // @ts-expect-error mockOpts is exposed
    const { mockOpts } = await import('commander');
    mockOpts.mockReturnValue({
      project: '/p',
      watch: false,
      srcDir: 'cli-src', // CLIで明示的に設定された値
      outDir: 'out',
      outputFile: 'types.ts',
    });

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

    // @ts-expect-error mockOpts is exposed
    const { mockOpts } = await import('commander');
    mockOpts.mockReturnValue({
      project: '/p',
      watch: false,
      srcDir: 'server',
      outDir: 'types',
      outputFile: 'appsscript.ts',
    });

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
    // @ts-expect-error mockOpts is exposed
    const { mockOpts } = await import('commander');
    mockOpts.mockReturnValue({
      project: '/p',
      watch: true,
      srcDir: 'server',
      outDir: 'types',
      outputFile: 'appsscript.ts',
    });

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
    await expect(runCli()).resolves.not.toThrow();
  });

  it('CLIが正常に実行され、各メソッドが呼ばれる', async () => {
    const {
      // @ts-expect-error mock exports
      mockName,
      // @ts-expect-error mock exports
      mockDescription,
      // @ts-expect-error mock exports
      mockVersion,
      // @ts-expect-error mock exports
      mockAction,
      // @ts-expect-error mock exports
      mockOption,
      // @ts-expect-error mock exports
      mockParseAsync,
    } = await import('commander');

    await runCli();

    console.log('Test: Checking mockName calls:', mockName.mock.calls);
    expect(mockName).toHaveBeenCalled();
    expect(mockName).toHaveBeenCalledWith('gasnuki');
    expect(mockDescription).toHaveBeenCalled();
    expect(mockVersion).toHaveBeenCalled();
    expect(mockAction).toHaveBeenCalled();
    expect(mockOption).toHaveBeenCalledTimes(5);
    expect(mockParseAsync).toHaveBeenCalledWith(process.argv);
  });
});
