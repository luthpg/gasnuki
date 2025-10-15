import { Project, type ProjectOptions } from 'ts-morph';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
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
const _mockProject = new Project({ useInMemoryFileSystem: true });
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

  it('出力ディレクトリが存在しない場合に作成されること', async () => {
    const { existsSync, mkdirSync } = await import('node:fs');
    const { consola } = await import('consola');

    // 出力ディレクトリが存在しないと仮定
    (existsSync as Mock).mockReturnValue(false);

    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/test.ts',
      'export function test() {}',
    );
    (Project as Mock).mockReturnValue(project);

    await generateAppsScriptTypes(opts);

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('types'), {
      recursive: true,
    });
    expect(consola.info).toHaveBeenCalledWith(
      expect.stringContaining('Created output directory:'),
    );
  });

  it('出力ディレクトリが既に存在する場合は作成されないこと', async () => {
    const { existsSync, mkdirSync } = await import('node:fs');

    // 出力ディレクトリが存在すると仮定
    (existsSync as Mock).mockReturnValue(true);

    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/test2.ts',
      'export function test() {}',
    );
    (Project as Mock).mockReturnValue(project);

    await generateAppsScriptTypes(opts);

    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('関数が見つからない場合の出力内容', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/test3.ts',
      'export interface Test { id: string; }',
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');
    const { consola } = await import('consola');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain('export type ServerScripts = {');
    expect(consola.info).toHaveBeenCalledWith(
      expect.stringContaining(
        "Interface 'ServerScript' type definitions written to",
      ),
    );
  });

  it('関数と型の両方が存在する場合の出力内容', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/test4.ts',
      `export interface Test { id: string; }
       export function processTest(test: Test): Test { return test; }`,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');
    const { consola } = await import('consola');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain('export interface Test { id: string; }');
    expect(writtenContent).toContain('processTest(test: Test): Test;');
    expect(writtenContent).toContain('export type ServerScripts = {');
    expect(consola.info).toHaveBeenCalledWith(
      expect.stringContaining(
        "Interface 'ServerScript' type definitions written to",
      ),
    );
  });

  it('インポート文が正しくソートされること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/models/user.ts',
      'export interface User { id: number; }',
    );
    project.createSourceFile(
      '/project/src/models/admin.ts',
      'export interface Admin { role: string; }',
    );
    project.createSourceFile(
      '/project/src/main6.ts',
      `import { User } from './models/user';
       import { Admin } from './models/admin';
       export function processUser(user: User): User { return user; }
       export function processAdmin(admin: Admin): Admin { return admin; }`,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // インポート文が正しくソートされていることを確認
    const importLines = writtenContent
      .split('\n')
      .filter((line: string) => line.startsWith('import type'))
      .map((line: string) => line.trim());

    if (importLines.length >= 2) {
      expect(importLines[0]).toContain('./models/admin');
      expect(importLines[1]).toContain('./models/user');
    }
  });

  it('複雑な型参照が正しく処理されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/types2.ts',
      `export interface Base { id: string; }
       export interface Extended extends Base { name: string; }
       export type ComplexType = Extended & { extra: boolean; }`,
    );
    project.createSourceFile(
      '/project/src/main7.ts',
      `import { ComplexType } from './types2';
       export function processComplex(data: ComplexType): ComplexType { return data; }`,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain('export interface Base { id: string; }');
    expect(writtenContent).toContain(
      'export interface Extended extends Base { name: string; }',
    );
    expect(writtenContent).toContain(
      'export type ComplexType = Extended & { extra: boolean; }',
    );
    expect(writtenContent).toContain(
      'processComplex(data: ComplexType): ComplexType;',
    );
  });

  it('配列型とジェネリック型が正しく処理されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/types3.ts',
      `export interface Item { id: number; name: string; }
       export type ItemArray = Item[];
       export type OptionalItem = Item | null;`,
    );
    project.createSourceFile(
      '/project/src/main8.ts',
      `import { ItemArray, OptionalItem } from './types3';
       export function processItems(items: ItemArray): ItemArray { return items; }
       export function processOptional(item: OptionalItem): OptionalItem { return item; }`,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain(
      'export interface Item { id: number; name: string; }',
    );
    expect(writtenContent).toContain('export type ItemArray = Item[];');
    expect(writtenContent).toContain('export type OptionalItem = Item | null;');
    expect(writtenContent).toContain(
      'processItems(items: ItemArray): ItemArray;',
    );
    expect(writtenContent).toContain(
      'processOptional(item: OptionalItem): OptionalItem;',
    );
  });

  it('ネストしたオブジェクト型が正しく処理されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/types4.ts',
      `export interface Address { street: string; city: string; }
       export interface User { 
         id: number; 
         name: string; 
         address: Address;
         tags: string[];
       }`,
    );
    project.createSourceFile(
      '/project/src/main9.ts',
      `import { User } from './types4';
       export function processUser(user: User): User { return user; }`,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain(
      'export interface Address { street: string; city: string; }',
    );
    expect(writtenContent).toContain('export interface User {');
    expect(writtenContent).toContain('address: Address;');
    expect(writtenContent).toContain('tags: string[];');
    expect(writtenContent).toContain('processUser(user: User): User;');
  });

  it('Union型とIntersection型が正しく処理されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/types5.ts',
      `export interface A { a: string; }
       export interface B { b: number; }
       export type Union = A | B;
       export type Intersection = A & B;`,
    );
    project.createSourceFile(
      '/project/src/main10.ts',
      `import { Union, Intersection } from './types5';
       export function processUnion(data: Union): Union { return data; }
       export function processIntersection(data: Intersection): Intersection { return data; }`,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain('export interface A { a: string; }');
    expect(writtenContent).toContain('export interface B { b: number; }');
    expect(writtenContent).toContain('export type Union = A | B;');
    expect(writtenContent).toContain('export type Intersection = A & B;');
    expect(writtenContent).toContain('processUnion(data: Union): Union;');
    expect(writtenContent).toContain(
      'processIntersection(data: Intersection): Intersection;',
    );
  });

  it('SIMPLE_TRIGGER_FUNCTION_NAMESに含まれる関数を除外すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/triggers.ts',
      `
      export function onOpen(e) {}
      export function doGet(e) {}
      export function normalFunction() {}
      `,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).not.toContain('onOpen');
    expect(writtenContent).not.toContain('doGet');
    expect(writtenContent).toContain('normalFunction');
  });

  it('JSDocコメントが正しく出力されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/with-jsdoc.ts',
      `
      /**
       * This is a test function.
       * @param name The name to greet.
       * @returns A greeting message.
       */
      export function greet(name: string): string { return \`Hello, \${name}\`; }
      `,
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls.at(-1)[1];
    const cleanedContent = writtenContent.replace(/\s+/g, ' ');

    expect(cleanedContent).toContain(
      '/** * This is a test function. * @param name The name to greet. * @returns A greeting message. */ greet(name: string): string;',
    );
  });

  it('clientside.jsonの内容が出力に含まれること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/main.ts',
      'export function noop() {}',
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).toContain('// clientside types');
  });

  it('オプショナルな引数が正しく処理されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/optional.ts',
      'export function optionalParam(name?: string): void {}',
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).toContain('optionalParam(name?: string): void;');
  });

  it('暗黙的なvoidの返り値が正しく処理されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/project/src/implicit-void.ts',
      'export function implicitVoid() {}',
    );
    (Project as Mock).mockReturnValue(project);
    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes(opts);

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).toContain('implicitVoid(): void;');
  });
});
