import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type GenerateOptions, generateTypes } from '../src/index';

// consola, chokidarのモック
vi.mock('consola', () => ({ consola: { info: vi.fn(), error: vi.fn() } }));
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      close: vi.fn(),
    })),
  },
  watch: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn(),
  })),
}));

// generateAppsScriptTypesのモック
vi.mock('../src/modules/generate', () => ({
  generateAppsScriptTypes: vi.fn().mockResolvedValue(undefined),
}));

describe('generateTypes', () => {
  const baseOptions: GenerateOptions = {
    project: '/project',
    srcDir: 'src',
    outDir: 'out',
    outputFile: 'types.ts',
    watch: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('watch=falseで正常に完了する', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    await expect(
      generateTypes({ ...baseOptions, watch: false }),
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('watch=trueでwatcherが起動する', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    // SIGINT/SIGTERMのリスナーを一時的に無効化
    const onSpy = vi.spyOn(process, 'on').mockImplementation(
      () =>
        // biome-ignore lint/suspicious/noExplicitAny: process as any for test
        process as any,
    );
    await generateTypes({ ...baseOptions, watch: true });
    expect(onSpy).toHaveBeenCalled();
    exitSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('GenerateOptions型のテスト', () => {
    const opts: GenerateOptions = { ...baseOptions };
    expect(opts.project).toBe('/project');
    expect(opts.watch).toBe(false);
  });

  it('generateAppsScriptTypesで例外時にconsola.errorが呼ばれる', async () => {
    const { generateAppsScriptTypes } = await import('../src/modules/generate');
    // biome-ignore lint/suspicious/noExplicitAny: mockRejectedValueOnce for test
    (generateAppsScriptTypes as any).mockRejectedValueOnce(new Error('fail'));
    const { consola } = await import('consola');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    await expect(
      generateTypes({ ...baseOptions, watch: false }),
    ).rejects.toThrow('process.exit');
    expect(consola.error).toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
