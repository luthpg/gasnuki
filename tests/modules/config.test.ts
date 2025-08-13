import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConfig, loadConfig } from '../../src/modules/config';

// fs, jiti, consolaのモック
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }));
vi.mock('jiti', () => ({ createJiti: vi.fn(() => ({ import: vi.fn() })) }));
vi.mock('consola', () => ({ consola: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('defineConfig', () => {
  it('型安全なconfigを返す', () => {
    const config = defineConfig({ outDir: 'types', srcDir: 'src' });
    expect(config.outDir).toBe('types');
    expect(config.srcDir).toBe('src');
  });

  it('空の設定オブジェクトを返す', () => {
    const config = defineConfig({});
    expect(config).toEqual({});
  });

  it('全ての設定オプションを含む設定を返す', () => {
    const config = defineConfig({
      srcDir: 'custom-src',
      outDir: 'custom-out',
      outputFile: 'custom.ts',
    });
    expect(config.srcDir).toBe('custom-src');
    expect(config.outDir).toBe('custom-out');
    expect(config.outputFile).toBe('custom.ts');
  });
});

describe('loadConfig', () => {
  it('設定ファイルが存在しない場合は空オブジェクトを返す', async () => {
    const { existsSync } = await import('node:fs');
    (existsSync as any).mockReturnValue(false);
    const config = await loadConfig('/project');
    expect(config).toEqual({});
  });

  it('設定ファイルが存在し正常にロードできる場合', async () => {
    const { existsSync } = await import('node:fs');
    (existsSync as any).mockReturnValueOnce(true);
    const { createJiti } = await import('jiti');
    const importMock = vi.fn(() => Promise.resolve({ outDir: 'types' }));
    (createJiti as any).mockReturnValue({ import: importMock });
    const config = await loadConfig('/project');
    expect(config).toEqual({ outDir: 'types' });
  });

  it('設定ファイルのロードで例外が発生した場合は空オブジェクト', async () => {
    const { existsSync } = await import('node:fs');
    (existsSync as any).mockReturnValueOnce(true);
    const { createJiti } = await import('jiti');
    const importMock = vi.fn(() => {
      throw new Error('fail');
    });
    (createJiti as any).mockReturnValue({ import: importMock });
    const config = await loadConfig('/project');
    expect(config).toEqual({});
  });

  it('複数の設定ファイル拡張子を順番にチェックする', async () => {
    const { existsSync } = await import('node:fs');
    const { createJiti } = await import('jiti');
    const { consola } = await import('consola');

    // 最初の拡張子では存在せず、2番目の拡張子で存在する
    (existsSync as any)
      .mockReturnValueOnce(false) // .ts
      .mockReturnValueOnce(true); // .mts

    const importMock = vi.fn(() => Promise.resolve({ srcDir: 'custom-src' }));
    (createJiti as any).mockReturnValue({ import: importMock });

    const config = await loadConfig('/project');

    expect(config).toEqual({ srcDir: 'custom-src' });
    expect(consola.success).toHaveBeenCalledWith(
      'Loaded configuration from gasnuki.config.mts',
    );
  });

  it('最初に見つかった設定ファイルが使用される', async () => {
    const { existsSync } = await import('node:fs');
    const { createJiti } = await import('jiti');
    const { consola } = await import('consola');

    // .tsファイルが存在する
    (existsSync as any).mockReturnValueOnce(true);

    const importMock = vi.fn(() =>
      Promise.resolve({ outputFile: 'custom.ts' }),
    );
    (createJiti as any).mockReturnValue({ import: importMock });

    const config = await loadConfig('/project');

    expect(config).toEqual({ outputFile: 'custom.ts' });
    expect(consola.success).toHaveBeenCalledWith(
      'Loaded configuration from gasnuki.config.ts',
    );
  });

  it('設定ファイルのロードエラーでconsola.errorが呼ばれる', async () => {
    const { existsSync } = await import('node:fs');
    const { createJiti } = await import('jiti');
    const { consola } = await import('consola');

    (existsSync as any).mockReturnValueOnce(true);
    const importMock = vi.fn(() => {
      throw new Error('Config load failed');
    });
    (createJiti as any).mockReturnValue({ import: importMock });

    const config = await loadConfig('/project');

    expect(config).toEqual({});
    expect(consola.error).toHaveBeenCalledWith(
      'Error loading gasnuki.config.ts:',
      expect.any(Error),
    );
  });

  it('jitiが正しいオプションで作成される', async () => {
    const { existsSync } = await import('node:fs');
    const { createJiti } = await import('jiti');

    (existsSync as any).mockReturnValueOnce(true);
    const importMock = vi.fn(() => Promise.resolve({}));
    (createJiti as any).mockReturnValue({ import: importMock });

    await loadConfig('/project');

    expect(createJiti).toHaveBeenCalledWith('/project', {
      fsCache: false,
      moduleCache: false,
      interopDefault: true,
    });
  });

  it('jiti.importが正しいオプションで呼ばれる', async () => {
    const { existsSync } = await import('node:fs');
    const { createJiti } = await import('jiti');
    const path = await import('node:path');

    (existsSync as any).mockReturnValueOnce(true);
    const importMock = vi.fn(() => Promise.resolve({}));
    (createJiti as any).mockReturnValue({ import: importMock });

    await loadConfig('/project');

    const expectedPath = path.resolve('/project', 'gasnuki.config.ts');
    expect(importMock).toHaveBeenCalledWith(expectedPath, {
      default: true,
    });
  });

  it('複雑な設定オブジェクトが正しくロードされる', async () => {
    const { existsSync } = await import('node:fs');
    const { createJiti } = await import('jiti');

    const complexConfig = {
      srcDir: 'server',
      outDir: 'types',
      outputFile: 'appsscript.ts',
    };

    (existsSync as any).mockReturnValueOnce(true);
    const importMock = vi.fn(() => Promise.resolve(complexConfig));
    (createJiti as any).mockReturnValue({ import: importMock });

    const config = await loadConfig('/project');

    expect(config).toEqual(complexConfig);
  });

  it('設定ファイルが見つからない場合にconsolaが呼ばれない', async () => {
    const { existsSync } = await import('node:fs');
    const { consola } = await import('consola');

    (existsSync as any).mockReturnValue(false);

    await loadConfig('/project');

    expect(consola.success).not.toHaveBeenCalled();
    expect(consola.error).not.toHaveBeenCalled();
  });
});
