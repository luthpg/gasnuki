import {
  Project,
  type ProjectOptions,
  SymbolFlags,
  SyntaxKind,
} from 'ts-morph';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAppsScriptTypes } from '../../src/modules/generate';

// fs, consolaは引き続きモックする
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true), // 出力先ディレクトリは存在すると仮定
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock('consola', () => ({ consola: { info: vi.fn(), error: vi.fn() } }));

// pathは実際のモジュールを利用する
vi.mock('node:path', () => vi.importActual('node:path'));

// ts-morph の Project のコンストラクタのみモックし、他は実際の機能を利用する
const mockProject = new Project({ useInMemoryFileSystem: true });
vi.mock('ts-morph', async (importOriginal) => {
  const original = await importOriginal<typeof import('ts-morph')>();
  return {
    ...original,
    Project: vi.fn((options?: ProjectOptions) => {
      // 毎回新しいインメモリプロジェクトを作成して、テスト間の影響を防ぐ
      return new original.Project({
        ...options,
        useInMemoryFileSystem: true,
        compilerOptions: {
          ...options?.compilerOptions,
          strict: true,
        },
      });
    }),
  };
});

vi.mock('../../src/modules/clientside.json', () => ({
  text: '// clientside types',
}));

describe('generateAppsScriptTypes', () => {
  const opts = {
    project: '/project',
    srcDir: 'src',
    outDir: 'types',
    outputFile: 'appsscript.ts',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('テストファイルが解析対象から除外されること', async () => {
    const project = new Project();
    const addSourceFilesAtPathsSpy = vi.spyOn(project, 'addSourceFilesAtPaths');
    (Project as Mock).mockReturnValue(project);

    await generateAppsScriptTypes(opts);

    // Windows/UNIXパス差異に対応し、arrayContainingで柔軟に比較
    expect(addSourceFilesAtPathsSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining('src'),
        expect.stringContaining('!'),
      ]),
    );
  });

  it('依存関係にある外部の型を正しくインポートすること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/models.ts',
      'export interface User { id: number; name: string; }',
    );
    project.createSourceFile(
      '/project/src/main1.ts',
      `import { User } from './models';
        export function getUser(user: User): User { return user; }
        export interface Admin { role: string; user: User; }`,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 型定義がinline展開されていることを確認
    expect(writtenContent).toContain(
      'export interface User { id: number; name: string; }',
    );
    expect(writtenContent).toContain('export interface Admin');
    expect(writtenContent).toContain('user: User;');
    expect(writtenContent).toContain('getUser(user: User): User;');
  });

  it('ジェネリック型パラメータをインポートしようとしないこと', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/main2.ts',
      'export function identity<T>(arg: T): T { return arg; }',
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).not.toContain('import type { T } from');
    expect(writtenContent).toContain('identity<T>(arg: T): T;');
  });

  it('TypeScript内部の __type をインポートしないこと', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // `__type` が現れうる複雑な型をシミュレート
    project.createSourceFile(
      '/project/src/main3.ts',
      "const complexObject = { key: 'value' };\nexport function getComplex() { return complexObject; }",
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).not.toContain('import type { __type } from');
  });

  it('アンダースコアで終わる関数と型を除外すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/main4.ts',
      `
      export function publicFunc() {}
      function privateFunc_() {}
      export interface PublicInterface {}
      interface PrivateInterface_ {}
      export type PublicType = string;
      type PrivateType_ = number;
      `,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain('publicFunc');
    expect(writtenContent).not.toContain('privateFunc_');
    expect(writtenContent).toContain('PublicInterface');
    expect(writtenContent).not.toContain('PrivateInterface_');
    expect(writtenContent).toContain('PublicType');
    expect(writtenContent).not.toContain('PrivateType_');
  });

  it('ローカルで定義された型はインポートしないこと', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/main5.ts',
      'export interface LocalType { id: string; }\nexport function processLocal(param: LocalType): LocalType { return param; }',
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).not.toContain('import type { LocalType }');
    expect(writtenContent).toContain('export interface LocalType');
    expect(writtenContent).toContain(
      'processLocal(param: LocalType): LocalType;',
    );
  });
});
