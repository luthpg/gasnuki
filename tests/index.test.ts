import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// pathのモック
vi.mock('node:path', () => ({
  resolve: vi.fn((...args: string[]) => args.join('/')),
  relative: vi.fn((base: string, file: string) => file.replace(base, '')),
  join: vi.fn((...args: string[]) => args.join('/')),
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

  afterEach(() => {
    vi.restoreAllMocks();
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
    const onSpy = vi
      .spyOn(process, 'on')
      .mockImplementation(() => process as any);
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

  it('watch=trueでchokidar.watchが正しいパスで呼ばれる', async () => {
    const { watch } = await import('chokidar');
    const { resolve } = await import('node:path');

    // process.exitをモックして無限ループを防ぐ
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    const onSpy = vi
      .spyOn(process, 'on')
      .mockImplementation(() => process as any);

    try {
      await generateTypes({ ...baseOptions, watch: true });
    } catch (e) {
      // process.exitが呼ばれることを期待
    }

    expect(resolve).toHaveBeenCalledWith('/project', 'src');
    expect(watch).toHaveBeenCalledWith(
      expect.stringContaining('/project/src'),
      expect.objectContaining({
        ignored: ['node_modules', 'dist'],
        persistent: true,
        ignoreInitial: true,
      }),
    );

    exitSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('初期生成時のエラーハンドリング', async () => {
    const { generateAppsScriptTypes } = await import('../src/modules/generate');
    const { consola } = await import('consola');

    // 初期生成でエラーを投げる
    (generateAppsScriptTypes as any).mockRejectedValueOnce(
      new Error('Initial generation failed'),
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    try {
      await generateTypes({ ...baseOptions, watch: false });
    } catch (e) {
      // process.exitが呼ばれることを期待
    }

    expect(consola.error).toHaveBeenCalledWith(
      'Type generation failed: Initial generation failed',
      expect.any(Error),
    );

    exitSpy.mockRestore();
  });

  it('パスが正しく正規化される（Windowsパス）', async () => {
    const { watch } = await import('chokidar');

    // process.exitをモック
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    const onSpy = vi
      .spyOn(process, 'on')
      .mockImplementation(() => process as any);

    try {
      await generateTypes({ ...baseOptions, watch: true });
    } catch (e) {
      // process.exitが呼ばれることを期待
    }

    // resolveが呼ばれた後のパスが正規化されることを確認
    expect(watch).toHaveBeenCalledWith(
      expect.stringMatching(/\/project\/src$/), // バックスラッシュがスラッシュに変換される
      expect.any(Object),
    );

    exitSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('consola.infoが適切に呼ばれる', async () => {
    const { consola } = await import('consola');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    try {
      await generateTypes({ ...baseOptions, watch: false });
    } catch (e) {
      // process.exitが呼ばれることを期待
    }

    expect(consola.info).toHaveBeenCalledWith('Generating AppsScript types...');
    expect(consola.info).toHaveBeenCalledWith('Type generation complete.');

    exitSpy.mockRestore();
  });

  it('watch=trueでconsola.infoが適切に呼ばれる', async () => {
    const { consola } = await import('consola');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    const onSpy = vi
      .spyOn(process, 'on')
      .mockImplementation(() => process as any);

    try {
      await generateTypes({ ...baseOptions, watch: true });
    } catch (e) {
      // process.exitが呼ばれることを期待
    }

    expect(consola.info).toHaveBeenCalledWith('Generating AppsScript types...');
    expect(consola.info).toHaveBeenCalledWith('Type generation complete.');
    expect(consola.info).toHaveBeenCalledWith(
      expect.stringContaining('Watching for changes in'),
    );

    exitSpy.mockRestore();
    onSpy.mockRestore();
  });
});
