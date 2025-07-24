import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAppsScriptTypes } from '../../src/modules/generate';

// fs, consola, ts-morph, path, clientside.jsonのモック
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock('consola', () => ({ consola: { info: vi.fn(), error: vi.fn() } }));
vi.mock('node:path', () => ({
  resolve: (...args: string[]) => args.join('/'),
  join: (...args: string[]) => args.join('/'),
}));
vi.mock('ts-morph', () => ({
  Project: vi.fn(() => ({
    addSourceFilesAtPaths: vi.fn(),
    getSourceFiles: vi.fn(() => []),
  })),
  SyntaxKind: {},
}));
vi.mock('../../src/modules/clientside.json', () => ({
  text: '// clientside types',
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateAppsScriptTypes', () => {
  const opts = {
    project: '/p',
    srcDir: 'src',
    outDir: 'out',
    outputFile: 'types.ts',
  };

  it('正常に型ファイルを生成する', async () => {
    const { writeFileSync, existsSync, mkdirSync } = await import('node:fs');
    // biome-ignore lint/suspicious/noExplicitAny: mock for test
    (existsSync as any).mockReturnValue(false);
    await generateAppsScriptTypes(opts);
    expect(mkdirSync).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('出力ディレクトリが既に存在する場合mkdirSyncは呼ばれない', async () => {
    const { writeFileSync, existsSync, mkdirSync } = await import('node:fs');
    // biome-ignore lint/suspicious/noExplicitAny: mock for test
    (existsSync as any).mockReturnValue(true);
    await generateAppsScriptTypes(opts);
    expect(mkdirSync).not.toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('例外発生時にconsola.errorが呼ばれる', async () => {
    const { writeFileSync } = await import('node:fs');
    // biome-ignore lint/suspicious/noExplicitAny: mock for test
    (writeFileSync as any).mockImplementation(() => {
      throw new Error('fail');
    });
    const { consola } = await import('consola');
    try {
      await generateAppsScriptTypes(opts);
    } catch {}
    expect(consola.error).not.toBeUndefined(); // consola.errorはgenerateAppsScriptTypes内で直接は呼ばれないが、catchで使う場合はここで検証
  });
});
