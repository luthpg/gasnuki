import { Project } from 'ts-morph';
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
vi.mock('node:path', async () => {
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  return path.posix;
});

vi.mock('../../src/modules/clientside.json', () => ({
  text: '// clientside types',
}));

describe('generateAppsScriptTypes', () => {
  const projectPath = '/';
  const opts = {
    project: projectPath,
    srcDir: 'src',
    outDir: 'types',
    outputFile: 'appsscript.ts',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('テストファイルが解析対象から除外されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const addSourceFilesAtPathsSpy = vi.spyOn(project, 'addSourceFilesAtPaths');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/models.ts',
      'export interface User { id: number; name: string; }',
    );
    project.createSourceFile(
      '/src/main1.ts',
      `import { User } from './models';
export function getUser(user: User): User { return user; }
export interface Admin { role: string; user: User; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/main2.ts',
      'export function identity<T>(arg: T): T { return arg; }',
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).not.toContain('import type { T } from');
    expect(writtenContent).toContain('identity<T>(arg: T): T;');
  });

  it('TypeScript内部の __type をインポートしないこと', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // `__type` が現れうる複雑な型をシミュレート
    project.createSourceFile(
      '/src/main3.ts',
      "const complexObject = { key: 'value' };\nexport function getComplex() { return complexObject; }",
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).not.toContain('import type { __type } from');
  });

  it('アンダースコアで終わる関数と型を除外すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/main4.ts',
      `
export function publicFunc() {}
function privateFunc_() {}
export interface PublicInterface {}
interface PrivateInterface_ {}
export type PublicType = string;
type PrivateType_ = number;
      `.trim(),
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/main5.ts',
      'export interface LocalType { id: string; }\nexport function processLocal(param: LocalType): LocalType { return param; }',
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
    project.createSourceFile('/src/test.ts', 'export function test() {}');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
    project.createSourceFile('/src/test2.ts', 'export function test() {}');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('関数が見つからない場合の出力内容', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/test3.ts',
      'export interface Test { id: string; }',
    );

    const { writeFileSync } = await import('node:fs');
    const { consola } = await import('consola');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/test4.ts',
      `export interface Test { id: string; }
export function processTest(test: Test): Test { return test; }`,
    );

    const { writeFileSync } = await import('node:fs');
    const { consola } = await import('consola');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/models/user.ts',
      'export interface User { id: number; }',
    );
    project.createSourceFile(
      '/src/models/admin.ts',
      'export interface Admin { role: string; }',
    );
    project.createSourceFile(
      '/src/main6.ts',
      `import { User } from './models/user';
import { Admin } from './models/admin';
export function processUser(user: User): User { return user; }
export function processAdmin(admin: Admin): Admin { return admin; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/types2.ts',
      `export interface Base { id: string; }
export interface Extended extends Base { name: string; }
export type ComplexType = Extended & { extra: boolean; }`,
    );
    project.createSourceFile(
      '/src/main7.ts',
      `import { ComplexType } from './types2';
export function processComplex(data: ComplexType): ComplexType { return data; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/types3.ts',
      `export interface Item { id: number; name: string; }
export type ItemArray = Item[];
export type OptionalItem = Item | null;`,
    );
    project.createSourceFile(
      '/src/main8.ts',
      `import { ItemArray, OptionalItem } from './types3';
export function processItems(items: ItemArray): ItemArray { return items; }
export function processOptional(item: OptionalItem): OptionalItem { return item; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/types4.ts',
      `export interface Address { street: string; city: string; }
export interface User { 
  id: number; 
  name: string; 
  address: Address;
  tags: string[];
}`,
    );
    project.createSourceFile(
      '/src/main9.ts',
      `import { User } from './types4';
export function processUser(user: User): User { return user; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/types5.ts',
      `export interface A { a: string; }
export interface B { b: number; }
export type Union = A | B;
export type Intersection = A & B;`,
    );
    project.createSourceFile(
      '/src/main10.ts',
      `import { Union, Intersection } from './types5';
export function processUnion(data: Union): Union { return data; }
export function processIntersection(data: Intersection): Intersection { return data; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

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
      '/src/triggers.ts',
      `
export function onOpen(e) {}
export function doGet(e) {}
export function normalFunction() {}
      `.trim(),
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).not.toContain('onOpen');
    expect(writtenContent).not.toContain('doGet');
    expect(writtenContent).toContain('normalFunction');
  });

  it('JSDocコメントが正しく出力されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/with-jsdoc.ts',
      `
/**
 * This is a test function.
 * @param name The name to greet.
 * @returns A greeting message.
 */
export function greet(name: string): string { return \`Hello, \${name}\`; }
      `.trim(),
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    const cleanedContent = writtenContent.replace(/\s+/g, ' ');

    expect(cleanedContent).toContain(
      '/** * This is a test function. * @param name The name to greet. * @returns A greeting message. */ greet(name: string): string;',
    );
  });

  it('clientside.jsonの内容が出力に含まれること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/src/main11.ts', 'export function noop() {}');

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).toContain('// clientside types');
  });

  it('オプショナルな引数が正しく処理されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/optional.ts',
      'export function optionalParam(name?: string): void {}',
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).toContain('optionalParam(name?: string): void;');
  });

  it('暗黙的なvoidの返り値が正しく処理されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/implicit-void.ts',
      'export function implicitVoid() {}',
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).toContain('implicitVoid(): void;');
  });

  it('srcDirの外部で定義され、関数で利用されている型を正しくインポートすること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // `srcDir` (src) の外部に型定義ファイルを作成
    project.createSourceFile(
      '/external/types.ts',
      'export interface ExternalType { id: string; }',
    );
    // `srcDir` 内のファイルで、外部の型をインポートして使用
    project.createSourceFile(
      '/src/main12.ts',
      `import { ExternalType } from '../external/types';
export function processExternal(data: ExternalType): ExternalType { return data; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 1. 外部の型が正しくインポートされていることを確認
    // 出力先は /project/types なので、相対パスは ../external/types となる
    expect(writtenContent).toContain(
      "import type { ExternalType } from '../external/types';",
    );

    // 2. 外部の型がインライン展開されていないことを確認
    expect(writtenContent).not.toContain('export interface ExternalType');

    // 3. ServerScriptsで型が正しく使用されていることを確認
    expect(writtenContent).toContain(
      'processExternal(data: ExternalType): ExternalType;',
    );
    expect(writtenContent).not.toContain('import("');
  });

  it('関数の返り値で利用される外部の型を正しくインポートすること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // `srcDir` (src) の外部に型定義ファイルを作成
    project.createSourceFile(
      '/types/external.ts',
      'export interface ExternalReturnValue { value: string; }',
    );
    // `srcDir` 内のファイルで、外部の型を返り値として使用
    project.createSourceFile(
      '/src/returnsExternal.ts',
      `import { ExternalReturnValue } from '../types/external';

// 1. 明示的な返り値の型
export function getExplicit(): ExternalReturnValue {
  return { value: 'explicit' };
}

// 2. 推論される返り値の型
const inferredValue: ExternalReturnValue = { value: 'inferred' };
export const getInferred = () => inferredValue;

// 3. 他の関数から推論される返り値の型
export const getInferredFromFunc = () => getExplicit();
`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 1. 外部の型が正しくインポートされていることを確認
    expect(writtenContent).toContain(
      "import type { ExternalReturnValue } from './external';",
    );

    // 2. 外部の型がインライン展開されていないことを確認
    expect(writtenContent).not.toContain(
      'export interface ExternalReturnValue',
    );

    // 3. ServerScriptsで型が正しく使用されていることを確認
    expect(writtenContent).toContain('getExplicit(): ExternalReturnValue;');
    expect(writtenContent).toContain('getInferred(): ExternalReturnValue;');
    expect(writtenContent).toContain(
      'getInferredFromFunc(): ExternalReturnValue;',
    );
    expect(writtenContent).not.toContain('import("');
  });

  it('外部ライブラリ（node_modules）の型を正しくインポートすること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // node_modules内の外部ライブラリの型定義をシミュレート
    project.createSourceFile(
      '/node_modules/zod/index.d.ts',
      `export interface ZodSchema { parse: (data: unknown) => unknown; }
export type ZodType = ZodSchema;`,
    );
    // srcDir内で外部ライブラリの型を使用
    project.createSourceFile(
      '/src/validation.ts',
      `import { ZodSchema } from 'zod';
export function validate(schema: ZodSchema): boolean { return true; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 1. 外部ライブラリからのimport文が生成されていることを確認
    expect(writtenContent).toContain("import type { ZodSchema } from 'zod';");

    // 2. 外部ライブラリの型がインライン展開されていないことを確認
    expect(writtenContent).not.toContain('export interface ZodSchema');

    // 3. ServerScriptsで型が正しく使用されていることを確認
    expect(writtenContent).toContain('validate(schema: ZodSchema): boolean;');
  });

  it('スコープ付きパッケージ（@scope/package）の型を正しくインポートすること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // スコープ付きパッケージの型定義をシミュレート
    project.createSourceFile(
      '/node_modules/@scope/mylib/index.d.ts',
      `export interface MyType { value: string; }`,
    );
    // srcDir内でスコープ付きパッケージの型を使用
    project.createSourceFile(
      '/src/files.ts',
      `import { MyType } from '@scope/mylib';
export function getMyValue(data: MyType): string { return data.value; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 1. スコープ付きパッケージからのimport文が生成されていることを確認
    expect(writtenContent).toContain(
      "import type { MyType } from '@scope/mylib';",
    );

    // 2. 外部ライブラリの型がインライン展開されていないことを確認
    expect(writtenContent).not.toContain('export interface MyType');

    // 3. ServerScriptsで型が正しく使用されていることを確認
    expect(writtenContent).toContain('getMyValue(data: MyType): string;');
  });

  it('@typesパッケージの型を実際のパッケージ名でインポートすること', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        types: [], // 自動型ディレクティブの検索を無効化
      },
    });
    // @types/lodash の型定義をシミュレート
    project.createSourceFile(
      '/node_modules/@types/lodash/index.d.ts',
      `export interface Dictionary<T> { [key: string]: T; }`,
    );
    // srcDir内で@typesパッケージの型を使用
    project.createSourceFile(
      '/src/utils.ts',
      `import type { Dictionary } from 'lodash';
export function getDict(d: Dictionary<string>): Dictionary<string> { return d; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 1. @types/lodashではなく、lodashからインポートされていることを確認
    expect(writtenContent).toContain(
      "import type { Dictionary } from 'lodash';",
    );
    expect(writtenContent).not.toContain('@types/lodash');

    // 2. ServerScriptsで型が正しく使用されていることを確認
    expect(writtenContent).toContain(
      'getDict(d: Dictionary<string>): Dictionary<string>;',
    );
  });

  it('Recursive Type Aliasの無限再帰による無限ループが発生しないこと', async () => {
    const project = new Project({ useInMemoryFileSystem: true });

    // 再帰的な型エイリアスを定義
    project.createSourceFile(
      '/src/recursive-types.ts',
      `export type TreeNode = {
  value: number;
  children: TreeNode[];
};

export type LinkedListNode = {
  value: string;
  next: LinkedListNode | null;
};

export type MutualA = {
  b: MutualB;
};

export type MutualB = {
  a: MutualA;
};`,
    );

    // 再帰的な型を使用する関数を定義
    project.createSourceFile(
      '/src/recursive-funcs.ts',
      `import { TreeNode, LinkedListNode, MutualA } from './recursive-types';

export function processTree(node: TreeNode): TreeNode {
  return node;
}

export function processList(node: LinkedListNode): LinkedListNode {
  return node;
}

export function processMutual(a: MutualA): MutualA {
  return a;
}`,
    );

    const { writeFileSync } = await import('node:fs');

    // この関数が無限ループに陥らずに完了することを確認
    await expect(
      generateAppsScriptTypes({ ...opts, projectInstance: project }),
    ).resolves.not.toThrow();

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 1. 再帰的な型が正しく出力されていることを確認
    expect(writtenContent).toContain('export type TreeNode =');
    expect(writtenContent).toContain('children: TreeNode[];');
    expect(writtenContent).toContain('export type LinkedListNode =');
    expect(writtenContent).toContain('next: LinkedListNode | null;');
    expect(writtenContent).toContain('export type MutualA =');
    expect(writtenContent).toContain('export type MutualB =');

    // 2. 関数シグネチャが正しく出力されていることを確認
    expect(writtenContent).toContain('processTree(node: TreeNode): TreeNode;');
    expect(writtenContent).toContain(
      'processList(node: LinkedListNode): LinkedListNode;',
    );
    expect(writtenContent).toContain('processMutual(a: MutualA): MutualA;');
  });

  it('Brand型（unique symbolを使った型）が正しく処理されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });

    // Brand型の定義
    project.createSourceFile(
      '/src/brand-types.ts',
      `declare const __brand: unique symbol;

// T型の情報を持ったJSON文字列型
export type JsonString<T> = string & { [__brand]: T };

// ユーザーID型（brand型）
export type UserId = string & { [__brand]: 'UserId' };

// 日付文字列型（brand型）
export type DateString = string & { [__brand]: Date };`,
    );

    // Brand型を使用する関数
    project.createSourceFile(
      '/src/json-utils.ts',
      `import { JsonString, UserId, DateString } from './brand-types';

export interface User {
  id: UserId;
  name: string;
  createdAt: DateString;
}

export function serialize<T>(data: T): JsonString<T> {
  return JSON.stringify(data) as JsonString<T>;
}

export function deserialize<T>(json: JsonString<T>): T {
  return JSON.parse(json);
}

export function getUserId(id: UserId): UserId {
  return id;
}`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 1. Brand型の定義が正しく出力されていることを確認
    // unique symbol の declare const が出力されることを確認
    expect(writtenContent).toContain('declare const __brand: unique symbol;');
    expect(writtenContent).toContain(
      'export type JsonString<T> = string & { [__brand]: T };',
    );
    expect(writtenContent).toContain(
      "export type UserId = string & { [__brand]: 'UserId' };",
    );
    expect(writtenContent).toContain(
      'export type DateString = string & { [__brand]: Date };',
    );

    // 2. Brand型を使った interface が正しく出力されていることを確認
    expect(writtenContent).toContain('export interface User {');
    expect(writtenContent).toContain('id: UserId;');
    expect(writtenContent).toContain('createdAt: DateString;');

    // 3. Brand型を使った関数シグネチャが正しく出力されていることを確認
    expect(writtenContent).toContain('serialize<T>(data: T): JsonString<T>;');
    expect(writtenContent).toContain('deserialize<T>(json: JsonString<T>): T;');
    expect(writtenContent).toContain('getUserId(id: UserId): UserId;');

    // 4. __brand シンボルがインポートされていないことを確認
    expect(writtenContent).not.toContain('import type { __brand }');
  });

  it('内部のオブジェクトリテラルを型としてインライン化しないこと', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/internal_result.ts',
      `
      const InternalResult = { success: true, data: "ok" };
      export type MyResult = typeof InternalResult;
      `,
    );
    project.createSourceFile(
      '/src/main_result.ts',
      `
      import { MyResult } from './internal_result';
      export function getResult(): MyResult {
        return { success: true, data: "ok" };
      }
      `,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // `{ success: true, data: "ok" }` がトップレベルの型定義として含まれていないことを確認
    expect(writtenContent).not.toMatch(/^\s*\{\s*success:\s*true/m);

    // ServerScriptsに正しく含まれていることを確認
    expect(writtenContent).toContain('getResult(): MyResult;');
  });

  it('オブジェクトリテラルのプロパティ（PropertyAssignment）を型としてインライン化しないこと', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/lib/json.ts',
      'export function serialize(data: any): any { return data; }',
    );
    project.createSourceFile(
      '/src/response.ts',
      `
      import { serialize } from './lib/json';
      export const response = {
        success: <T>(data: T) => serialize({ success: true, data }),
        error: (message: string) =>
          serialize({
            success: false,
            error: message,
          }),
      };
      
      export type SuccessFn = typeof response.success;
      `,
    );
    project.createSourceFile(
      '/src/main_user_response.ts',
      `
      import { SuccessFn } from './response';
      export function handleSuccess(f: SuccessFn): void {}
      `,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // `{ success: true, data }` などのリテラルがトップレベルに含まれていないことを確認
    expect(writtenContent).not.toMatch(/^\s*success:\s*<T>/m);
    expect(writtenContent).not.toMatch(/^\s*success:\s*true/m);
  });
});
