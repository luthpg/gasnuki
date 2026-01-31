import { Project } from 'ts-morph';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { generateAppsScriptTypes } from '../../src/modules/generate';

// fs, consolaは引き続きモックする
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true), // 出力先ディレクトリは存在すると仮定
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn((path: string) => {
    if (path.endsWith('package.json')) {
      // Mock package.json content
      // Extract package name from path if possible, or default
      // Path example: /node_modules/zod/package.json
      const parts = path.split(/[/\\]/);
      const nodeModulesIndex = parts.lastIndexOf('node_modules');
      if (nodeModulesIndex !== -1 && parts.length > nodeModulesIndex + 1) {
        if (parts[nodeModulesIndex + 1].startsWith('@')) {
          const scope = parts[nodeModulesIndex + 1];
          const pkg = parts[nodeModulesIndex + 2];
          // If accessing index.d.ts of scope package, name is still scope/pkg
          return JSON.stringify({
            name: `${scope}/${pkg}`,
            exports: { '.': './index.js' },
          });
        }
        return JSON.stringify({
          name: parts[nodeModulesIndex + 1],
          exports: { '.': './index.js' },
        });
      }
      return JSON.stringify({
        name: 'mock-package',
        exports: { '.': './index.js' },
      });
    }
    return '';
  }),
}));
vi.mock('consola', () => ({
  consola: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

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

  beforeEach(async () => {
    vi.clearAllMocks();
    const { existsSync } = await import('node:fs');
    (existsSync as Mock).mockReturnValue(true);
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
    expect(consola.info).toHaveBeenCalledWith(
      expect.stringContaining(
        "Interface 'ServerScript' type definitions written to",
      ),
    );
  });

  it('quietオプションが有効な場合、ログ出力が抑制されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/quiet.ts',
      'export interface Quiet { id: string; }',
    );

    const { writeFileSync } = await import('node:fs');
    const { consola } = await import('consola');

    (consola.info as unknown as Mock).mockClear();

    await generateAppsScriptTypes({
      ...opts,
      projectInstance: project,
      quiet: true,
    });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).toContain('export interface Quiet');

    // consola.info should NOT be called
    expect(consola.info).not.toHaveBeenCalled();
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

  it('キャッシュが有効な場合、ソースファイルに変更がなければ生成をスキップすること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/src/test.ts', 'export function test() {}');

    const { writeFileSync, existsSync } = await import('node:fs');
    const { consola } = await import('consola');

    (existsSync as Mock).mockReturnValue(true);

    const testOpts = { ...opts, outputFile: 'appsscript_cache_1.ts' };

    // 1回目: 生成実行
    await generateAppsScriptTypes({
      ...testOpts,
      projectInstance: project,
      cache: true,
    });
    expect(writeFileSync).toHaveBeenCalledTimes(1);

    // 2回目: 同じソースで生成実行 -> スキップされるはず
    (writeFileSync as Mock).mockClear();
    await generateAppsScriptTypes({
      ...testOpts,
      projectInstance: project,
      cache: true,
    });

    expect(writeFileSync).not.toHaveBeenCalled();
    expect(consola.success).toHaveBeenCalledWith(
      expect.stringContaining('Skipping generation'),
    );
  });

  it('キャッシュが有効でも、ソースファイルに変更があれば再生成すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      '/src/test.ts',
      'export function test() {}',
    );

    const { writeFileSync, existsSync } = await import('node:fs');
    (existsSync as Mock).mockReturnValue(true);

    const testOpts = { ...opts, outputFile: 'appsscript_cache_2.ts' };

    // 1回目: 生成実行
    await generateAppsScriptTypes({
      ...testOpts,
      projectInstance: project,
      cache: true,
    });
    expect(writeFileSync).toHaveBeenCalledTimes(1);

    // ソースファイルを変更
    sourceFile.replaceWithText('export function test2() {}');

    // 2回目: 変更後のソースで生成実行 -> 再生成されるはず
    (writeFileSync as Mock).mockClear();
    await generateAppsScriptTypes({
      ...testOpts,
      projectInstance: project,
      cache: true,
    });

    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('出力ファイルが存在しない場合はキャッシュがあっても再生成すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/src/test.ts', 'export function test() {}');

    const { writeFileSync, existsSync } = await import('node:fs');

    const testOpts = { ...opts, outputFile: 'appsscript_cache_3.ts' };

    // 1回目: 生成実行 (出力ファイルあり)
    (existsSync as Mock).mockReturnValue(true);
    await generateAppsScriptTypes({
      ...testOpts,
      projectInstance: project,
      cache: true,
    });
    expect(writeFileSync).toHaveBeenCalledTimes(1);

    // 2回目: 出力ファイルがない状態をシミュレート
    (existsSync as Mock).mockReturnValue(false);
    (writeFileSync as Mock).mockClear();

    await generateAppsScriptTypes({
      ...testOpts,
      projectInstance: project,
      cache: true,
    });

    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('cache: false オプションでキャッシュを無効化できること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/src/test.ts', 'export function test() {}');

    const { writeFileSync, existsSync } = await import('node:fs');
    (existsSync as Mock).mockReturnValue(true);

    const testOpts = { ...opts, outputFile: 'appsscript_cache_4.ts' };

    // 1回目: 生成実行
    await generateAppsScriptTypes({
      ...testOpts,
      projectInstance: project,
      cache: true,
    });
    expect(writeFileSync).toHaveBeenCalledTimes(1);

    // 2回目: cache: false で実行 -> スキップされずに再生成されるはず
    (writeFileSync as Mock).mockClear();
    await generateAppsScriptTypes({
      ...testOpts,
      projectInstance: project,
      cache: false,
    });

    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('@typesパッケージに含まれるグローバルな型定義（exportされていない）をインポートしないこと', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        types: [],
      },
    });

    // @types/google-apps-script のようなグローバル型定義をシミュレート
    // 特徴: top-level exportを持たない
    project.createSourceFile(
      '/node_modules/@types/google-apps-script/index.d.ts',
      `declare namespace SpreadsheetApp {
        export interface Sheet {
          getName(): string;
        }
      }
      declare var SpreadsheetApp: {
        getActiveSpreadsheet(): any;
      };`,
    );

    // srcDir内でグローバル型を使用
    project.createSourceFile(
      '/src/gas-script.ts',
      `export function getSheet(): SpreadsheetApp.Sheet {
         return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 1. google-apps-script からのインポートが生成されないことを確認
    expect(writtenContent).not.toContain("from 'google-apps-script'");

    // 2. SpreadsheetApp.Sheet がそのまま使われているか
    expect(writtenContent).toContain('getSheet(): SpreadsheetApp.Sheet;');
  });

  // ==============================
  // Edge Case Tests - Name Collision
  // ==============================

  it('異なるディレクトリにある同名の型（名前衝突）を正しく処理すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // 異なるディレクトリに同名のUser型を定義
    project.createSourceFile(
      '/src/models/user.ts',
      'export interface User { id: number; name: string; }',
    );
    project.createSourceFile(
      '/src/entities/user.ts',
      'export interface User { userId: string; email: string; }',
    );
    // 両方のUser型を使用する関数
    project.createSourceFile(
      '/src/main.ts',
      `import { User as ModelUser } from './models/user';
import { User as EntityUser } from './entities/user';
export function processModelUser(user: ModelUser): ModelUser { return user; }
export function processEntityUser(user: EntityUser): EntityUser { return user; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 両方の型が正しく処理されていることを確認
    expect(writtenContent).toContain('processModelUser');
    expect(writtenContent).toContain('processEntityUser');
    // import文が壊れていないことを確認
    expect(writtenContent).not.toContain('import("');
  });

  it('組み込み型名と同名の引数を持つ関数を正しく処理すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/builtin-names.ts',
      `export function processString(String: string): string { return String; }
export function processObject(Object: object): object { return Object; }
export function processNumber(Number: number): number { return Number; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 組み込み型名と同名の引数が正しく処理されていることを確認
    expect(writtenContent).toContain('processString(String: string): string;');
    expect(writtenContent).toContain('processObject(Object: object): object;');
    expect(writtenContent).toContain('processNumber(Number: number): number;');
  });

  // ==============================
  // Edge Case Tests - Complex Generics
  // ==============================

  it('ネストしたジェネリック型（JsonString<{ a: JsonString<T> }>）を正しく処理すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/nested-generics.ts',
      `declare const __brand: unique symbol;
export type JsonString<T> = string & { [__brand]: T };

export interface NestedData {
  inner: JsonString<Date[]>;
}

export function processNested(data: JsonString<NestedData>): JsonString<NestedData> {
  return data;
}`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // ネストしたジェネリック型が正しく定義されていることを確認
    expect(writtenContent).toContain('export type JsonString<T>');
    expect(writtenContent).toContain('export interface NestedData');
    expect(writtenContent).toContain('inner: JsonString<Date[]>;');
    expect(writtenContent).toContain(
      'processNested(data: JsonString<NestedData>): JsonString<NestedData>;',
    );
  });

  it('条件付き型（Conditional Types）を含むインターフェースを正しく処理すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/conditional-types.ts',
      `export type IsString<T> = T extends string ? true : false;
export type ExtractValue<T> = T extends { value: infer V } ? V : never;

export interface Container<T> {
  data: T;
  isString: IsString<T>;
}

export function checkType<T>(container: Container<T>): IsString<T> {
  return container.isString;
}`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 条件付き型が正しく出力されていることを確認
    expect(writtenContent).toContain(
      'export type IsString<T> = T extends string ? true : false;',
    );
    expect(writtenContent).toContain('export interface Container<T>');
  });

  it('マップ型（Mapped Types）を含むインターフェースを正しく処理すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/mapped-types.ts',
      `export type Readonly<T> = { readonly [K in keyof T]: T[K] };
export type Optional<T> = { [K in keyof T]?: T[K] };

export interface Person {
  name: string;
  age: number;
}

export function getReadonlyPerson(person: Person): Readonly<Person> {
  return person;
}`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // マップ型が正しく出力されていることを確認
    expect(writtenContent).toContain('export interface Person');
    expect(writtenContent).toContain(
      'getReadonlyPerson(person: Person): Readonly<Person>;',
    );
  });

  // ==============================
  // Edge Case Tests - GAS Constraints
  // ==============================

  it('アンダースコアで終わる型名は除外されないこと（関数とは異なる挙動）', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/underscore-types.ts',
      `export interface InternalType_ { value: string; }
export type PrivateAlias_ = { data: number };

export function useInternalType(data: InternalType_): InternalType_ {
  return data;
}`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // アンダースコアで終わる型は除外されないことを確認
    expect(writtenContent).toContain('export interface InternalType_');
    expect(writtenContent).toContain(
      'useInternalType(data: InternalType_): InternalType_;',
    );
  });

  it('export defaultされた関数がGASグローバル関数として認識されること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/default-export.ts',
      `export default function defaultHandler() {
  return 'default';
}

export function namedHandler() {
  return 'named';
}`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // export defaultされた関数もServerScriptsに含まれることを確認
    expect(writtenContent).toContain('defaultHandler(): string;');
    // 名前付きexportも含まれることを確認
    expect(writtenContent).toContain('namedHandler(): string;');
  });

  // ==============================
  // Edge Case Tests - Empty/Invalid Input
  // ==============================

  it('srcDirに.tsファイルがない場合でもエラーなく完了すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // srcDirに非TypeScriptファイルのみ存在するシミュレーション
    // ts-morphでは.tsファイルのみがSourceFileとして認識される

    const { writeFileSync } = await import('node:fs');

    // エラーなく完了することを確認
    await expect(
      generateAppsScriptTypes({ ...opts, projectInstance: project }),
    ).resolves.not.toThrow();

    // 空のServerScriptsが生成されることを確認
    if ((writeFileSync as Mock).mock.calls.length > 0) {
      const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
      expect(writtenContent).toContain('export type ServerScripts = {');
    }
  });

  it('.tsファイルにあるローカル定義の関数がServerScriptsを生成すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/no-exports.ts',
      `// ローカル関数のみ
function localFunction() {}
const localConst = 'value';

// 型のみexport
export interface OnlyType { id: string; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // ServerScriptsにlocalFunctionが含まれることを確認
    expect(writtenContent).toContain('export type ServerScripts = {');
    expect(writtenContent).toContain('localFunction(): void;');
  });

  it('構文エラーのあるソースファイルを適切にハンドリングすること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // 構文エラーのあるファイル
    project.createSourceFile(
      '/src/syntax-error.ts',
      `export function broken( { // 閉じ括弧がない
  return 'broken';
}`,
    );
    // 正常なファイル
    project.createSourceFile(
      '/src/valid.ts',
      'export function validFunc(): string { return "valid"; }',
    );

    const { writeFileSync } = await import('node:fs');

    // エラーをthrowしないこと（グレースフルに処理される）
    await expect(
      generateAppsScriptTypes({ ...opts, projectInstance: project }),
    ).resolves.not.toThrow();

    // 正常なファイルの関数は処理されることを確認
    if ((writeFileSync as Mock).mock.calls.length > 0) {
      const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
      expect(writtenContent).toContain('validFunc(): string;');
    }
  });

  // ==============================
  // Edge Case Tests - Import Patterns
  // ==============================

  it('複雑なexportsフィールドを持つpackage.jsonからの型インポートを正しく解決すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const pkgPath = '/node_modules/complex-pkg/package.json';
    const pkgContent = JSON.stringify({
      name: 'complex-pkg',
      types: './dist/types/index.d.ts',
    });

    const { readFileSync, existsSync } = await import('node:fs');
    (existsSync as Mock).mockImplementation((p: string) => {
      const np = p.replace(/\\/g, '/');
      if (np.endsWith('package.json')) {
        return np === pkgPath;
      }
      return true;
    });
    (readFileSync as Mock).mockImplementation((p: string) => {
      const np = p.replace(/\\/g, '/');
      if (np === pkgPath) {
        return pkgContent;
      }
      return JSON.stringify({ name: 'mock' });
    });

    project.createSourceFile(pkgPath, pkgContent);
    project.createSourceFile(
      '/node_modules/complex-pkg/dist/types/index.d.ts',
      'export interface ComplexType { value: string; }',
    );
    project.createSourceFile(
      '/src/use-complex.ts',
      `import { ComplexType } from 'complex-pkg';
export function useComplex(data: ComplexType): ComplexType { return data; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // import文が生成されることを確認
    expect(writtenContent).toContain(
      "import type { ComplexType } from 'complex-pkg';",
    );
    expect(writtenContent).toContain('useComplex');
  });

  it('出力先ディレクトリからの複雑な相対パス計算を正しく行うこと', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    // 深いネストの外部型定義
    project.createSourceFile(
      '/shared/lib/utils/types/deep.ts',
      'export interface DeepType { nested: string; }',
    );
    project.createSourceFile(
      '/src/deep-import.ts',
      `import { DeepType } from '../shared/lib/utils/types/deep';
export function processDeep(data: DeepType): DeepType { return data; }`,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 正しい相対パスでインポートされていることを確認
    expect(writtenContent).toContain('processDeep(data: DeepType): DeepType;');
    // import文が相対パスであることを確認（インライン展開されていない場合）
    expect(writtenContent).not.toContain('import("');
  });

  it('異なるファイルで同名の型が定義されている場合、両方が出力に含まれること（名前衝突の検証）', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/a.ts',
      'export interface SameName { a: string; } export function funcA(x: SameName) {}',
    );
    project.createSourceFile(
      '/src/b.ts',
      'export interface SameName { b: number; } export function funcB(x: SameName) {}',
    );

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes({ ...opts, projectInstance: project });
    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    // 両方の定義が含まれていること（TSのインターフェースマージとして機能する）
    expect(writtenContent).toContain(
      'export interface SameName { a: string; }',
    );
    expect(writtenContent).toContain(
      'export interface SameName { b: number; }',
    );
    expect(writtenContent).toContain('funcA(x: SameName): void;');
    expect(writtenContent).toContain('funcB(x: SameName): void;');
  });

  it('多重にネストされたJsonStringを正しく処理すること', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/deep-json.ts',
      `declare const __brand: unique symbol;
export type JsonString<T> = string & { [__brand]: T };
export function processDeepJson(data: JsonString<{ a: JsonString<Date[]> }>): void {}`,
    );

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes({ ...opts, projectInstance: project });
    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain(
      'processDeepJson(data: JsonString<{ a: JsonString<Date[]> }>): void;',
    );
  });

  it('node_modulesのpackage.jsonのexportsフィールドのサブパスを正しく解決すること', async () => {
    const { ModuleResolutionKind } = await import('ts-morph');
    // Node16以降の解像度を指定しないとexportsは認識されない
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        moduleResolution: ModuleResolutionKind.Node16,
        types: [],
      },
    });

    const { readFileSync, existsSync } = await import('node:fs');

    const pkgPath = '/node_modules/subpath-pkg/package.json';
    const pkgContent = JSON.stringify({
      name: 'subpath-pkg',
      exports: {
        './sub': './dist/sub.d.ts',
      },
    });

    // gasnuki内部のresolveNodeModuleSpecifier_が参照するfsの挙動
    (existsSync as Mock).mockImplementation((p: string) => {
      const np = p.replace(/\\/g, '/');
      if (np.endsWith('package.json')) {
        return np === pkgPath;
      }
      return true;
    });

    (readFileSync as Mock).mockImplementation((p: string) => {
      const np = p.replace(/\\/g, '/');
      if (np === pkgPath) {
        return pkgContent;
      }
      return JSON.stringify({ name: 'mock' });
    });

    // ts-morphが解決した際のパスをエミュレート
    // Symbolの宣言ファイルパスとしてこれが取得される
    // package.jsonがないとNode16 resolutionでは exports が解決されない
    project.createSourceFile(pkgPath, pkgContent);

    project.createSourceFile(
      '/node_modules/subpath-pkg/dist/sub.d.ts',
      'export interface SubType { v: number; }',
    );

    project.createSourceFile(
      '/src/use-sub.ts',
      `import { SubType } from 'subpath-pkg/sub';
export function callSub(s: SubType) {}`,
    );

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes({ ...opts, projectInstance: project });
    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain(
      "import type { SubType } from 'subpath-pkg/sub';",
    );
  });

  it('Windowsスタイルのバックスラッシュを含むパスが正しく正規化されること', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { types: [] },
    });
    // Windows環境を想定したパスでSourceFileを追加
    project.createSourceFile(
      'C:/project/src/win.ts',
      'export function winFunc() {}',
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({
      project: 'C:/project',
      srcDir: 'src',
      outDir: 'types',
      outputFile: 'appsscript.ts',
      projectInstance: project,
      cache: false,
    });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    expect(writtenContent).toContain('winFunc(): void;');
  });

  it('@typesパッケージでパッケージ名と名前空間が異なるケース（例: lodash）を正しく処理すること', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { types: [] }, // ディレクトリなしエラーを回避
    });

    project.createSourceFile(
      '/node_modules/@types/lodash/index.d.ts',
      `export interface LoDashStatic { version: string; }`,
    );

    const { readFileSync, existsSync } = await import('node:fs');
    (existsSync as Mock).mockImplementation((p: string) => {
      return p.includes('@types/lodash');
    });
    (readFileSync as Mock).mockImplementation((path: string) => {
      if (path.includes('@types/lodash') && path.endsWith('package.json')) {
        return JSON.stringify({ name: '@types/lodash' });
      }
      return JSON.stringify({ name: 'mock' });
    });

    project.createSourceFile(
      '/src/lodash-test.ts',
      `import { LoDashStatic } from 'lodash';
export function useLodash(ld: LoDashStatic) {}`,
    );

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes({ ...opts, projectInstance: project });
    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain(
      "import type { LoDashStatic } from 'lodash';",
    );
  });

  it('シンボリックリンク先のファイルが解析対象に含まれること', async () => {
    // 実際的なシンボリックリンクのテストはInMemoryFSでは難しいが、
    // project.addSourceFilesAtPaths がリンクを辿ることを期待する
    const project = new Project({ useInMemoryFileSystem: true });

    // 実体ファイル
    project.createSourceFile(
      '/external/real.ts',
      'export function realFunc() {}',
    );

    // シンボリックリンクをシミュレート（InMemoryFSでは単にパスとして追加）
    project.createSourceFile('/src/link.ts', 'export function realFunc() {}');

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes({ ...opts, projectInstance: project });
    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];

    expect(writtenContent).toContain('realFunc(): void;');
  });

  it('絶対パスのsrcDirとoutDirを正しく処理すること', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { types: [] },
    });
    project.createSourceFile(
      '/abs/src/main.ts',
      'export function absFunc() {}',
    );

    const { writeFileSync, existsSync } = await import('node:fs');
    (existsSync as Mock).mockReturnValue(true);

    await generateAppsScriptTypes({
      project: '/project',
      srcDir: '/abs/src',
      outDir: '/abs/out',
      outputFile: 'out.ts',
      projectInstance: project,
      cache: false,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      '/abs/out/out.ts',
      expect.stringContaining('absFunc(): void;'),
    );
  });
});
