import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type UserConfig,
  defineConfig,
  loadConfig,
} from '../../src/modules/config';

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
});
