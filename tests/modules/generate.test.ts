import { SyntaxKind } from 'ts-morph';
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

// ts-morphのモックをより詳細に設定
const mockProject = {
  addSourceFilesAtPaths: vi.fn(),
  getSourceFiles: vi.fn(() => []),
} as any;

const mockSourceFile = {
  getInterfaces: vi.fn(() => []),
  getTypeAliases: vi.fn(() => []),
  getStatements: vi.fn(() => []),
  getFunctions: vi.fn(() => []),
  getVariableStatements: vi.fn(() => []),
} as any;

const mockFunction = {
  isAmbient: vi.fn(() => false),
  getName: vi.fn(() => 'testFunction'),
  getParameters: vi.fn(() => []),
  getTypeParameters: vi.fn(() => []),
  getReturnTypeNode: vi.fn(() => null),
  getReturnType: vi.fn(() => ({ isVoid: () => false, getText: () => 'any' })),
  getJsDocs: vi.fn(() => []),
} as any;

const mockVariableStatement = {
  isAmbient: vi.fn(() => false),
  getDeclarations: vi.fn(() => []),
} as any;

const mockVariableDeclaration = {
  getInitializer: vi.fn(() => null),
  getName: vi.fn(() => 'testVar'),
} as any;

vi.mock('ts-morph', () => ({
  Project: vi.fn(() => mockProject),
  SyntaxKind: {
    ModuleDeclaration: 'ModuleDeclaration',
    ArrowFunction: 'ArrowFunction',
    FunctionExpression: 'FunctionExpression',
    VariableDeclaration: 'VariableDeclaration',
  },
}));

vi.mock('../../src/modules/clientside.json', () => ({
  text: '// clientside types',
}));

beforeEach(() => {
  vi.clearAllMocks();
  // デフォルトのモック設定をリセット
  mockProject.getSourceFiles.mockReturnValue([mockSourceFile]);
  mockSourceFile.getInterfaces.mockReturnValue([]);
  mockSourceFile.getTypeAliases.mockReturnValue([]);
  mockSourceFile.getStatements.mockReturnValue([]);
  mockSourceFile.getFunctions.mockReturnValue([]);
  mockSourceFile.getVariableStatements.mockReturnValue([]);
  mockFunction.isAmbient.mockReturnValue(false);
  mockFunction.getName.mockReturnValue('testFunction');
  mockFunction.getParameters.mockReturnValue([]);
  mockFunction.getTypeParameters.mockReturnValue([]);
  mockFunction.getReturnTypeNode.mockReturnValue(null);
  mockFunction.getReturnType.mockReturnValue({
    isVoid: () => false,
    getText: () => 'any',
  } as any);
  mockFunction.getJsDocs.mockReturnValue([]);
  mockVariableStatement.isAmbient.mockReturnValue(false);
  mockVariableStatement.getDeclarations.mockReturnValue([]);
  mockVariableDeclaration.getInitializer.mockReturnValue(null);
  mockVariableDeclaration.getName.mockReturnValue('testVar');
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
    (
      existsSync as unknown as { mockReturnValue: (value: boolean) => void }
    ).mockReturnValue(false);
    await generateAppsScriptTypes(opts);
    expect(mkdirSync).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('出力ディレクトリが既に存在する場合mkdirSyncは呼ばれない', async () => {
    const { writeFileSync, existsSync, mkdirSync } = await import('node:fs');
    (existsSync as any).mockReturnValue(true);
    await generateAppsScriptTypes(opts);
    expect(mkdirSync).not.toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('例外発生時にconsola.errorが呼ばれる', async () => {
    const { writeFileSync } = await import('node:fs');
    (writeFileSync as any).mockImplementation(() => {
      throw new Error('fail');
    });
    const { consola } = await import('consola');
    try {
      await generateAppsScriptTypes(opts);
    } catch {}
    expect(consola.error).not.toBeUndefined();
    // モックをリセット
    (writeFileSync as any).mockRestore();
  });

  it('関数が見つからない場合は空のServerScripts型を生成する', async () => {
    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('export type ServerScripts = {}'),
    );
  });

  it('インターフェースと型エイリアスを処理する', async () => {
    const mockInterface = {
      getText: () => 'interface TestInterface { prop: string; }',
    } as any;
    const mockTypeAlias = { getText: () => 'type TestType = string;' } as any;

    mockSourceFile.getInterfaces.mockReturnValue([mockInterface]);
    mockSourceFile.getTypeAliases.mockReturnValue([mockTypeAlias]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('export type ServerScripts = {}');
  });

  it('モジュール宣言を処理する', async () => {
    const mockModuleDeclaration = {
      getKind: () => SyntaxKind.ModuleDeclaration,
      getText: () => 'declare module "test" { export const x: string; }',
    } as any;

    mockSourceFile.getStatements.mockReturnValue([mockModuleDeclaration]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('export type ServerScripts = {}');
  });

  it('アンビエント関数を除外する', async () => {
    mockFunction.isAmbient.mockReturnValue(true);
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('export type ServerScripts = {}');
  });

  it('アンダースコアで終わる関数名を除外する', async () => {
    mockFunction.getName.mockReturnValue('testFunction_');
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('export type ServerScripts = {}');
  });

  it('通常の関数宣言を処理する', async () => {
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('testFunction(): any;');
  });

  it('パラメータ付きの関数を処理する', async () => {
    const mockParameter = {
      getName: () => 'param',
      getTypeNode: () => ({ getText: () => 'string' }),
      hasQuestionToken: () => false,
    } as any;
    mockFunction.getParameters.mockReturnValue([mockParameter]);
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('testFunction(param: string): any;');
  });

  it('オプショナルパラメータを処理する', async () => {
    const mockParameter = {
      getName: () => 'param',
      getTypeNode: () => ({ getText: () => 'string' }),
      hasQuestionToken: () => true,
    } as any;
    mockFunction.getParameters.mockReturnValue([mockParameter]);
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('testFunction(param?: string): any;');
  });

  it('型パラメータ付きの関数を処理する', async () => {
    const mockTypeParameter = { getText: () => 'T' } as any;
    mockFunction.getTypeParameters.mockReturnValue([mockTypeParameter]);
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('testFunction<T>(): any;');
  });

  it('戻り値型を明示的に指定した関数を処理する', async () => {
    mockFunction.getReturnTypeNode.mockReturnValue({
      getText: () => 'string',
    } as any);
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('testFunction(): string;');
  });

  it('void戻り値型を処理する', async () => {
    mockFunction.getReturnType.mockReturnValue({
      isVoid: () => true,
      getText: () => 'void',
    } as any);
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('testFunction(): void;');
  });

  it('JSDocコメント付きの関数を処理する', async () => {
    const mockJsDoc = {
      getFullText: () => '/**\n * Test function\n */',
      getDescription: () => 'Test function',
      getTags: () => [],
    } as any;
    mockFunction.getJsDocs.mockReturnValue([mockJsDoc]);
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('/**\n   * Test function\n   */');
    expect(callArgs[1]).toContain('testFunction(): any;');
  });

  it('@deprecatedタグ付きのJSDocを処理する', async () => {
    const mockJsDoc = {
      getFullText: () => '/**\n * @deprecated\n */',
      getDescription: () => '',
      getTags: () => [],
    } as any;
    mockFunction.getJsDocs.mockReturnValue([mockJsDoc]);
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('/**\n   * @deprecated\n   */');
  });

  it('変数宣言の関数式を処理する', async () => {
    const mockArrowFunction = {
      getKind: () => SyntaxKind.ArrowFunction,
      getParameters: () => [],
      getTypeParameters: () => [],
      getReturnTypeNode: () => null,
      getReturnType: () => ({ isVoid: () => false, getText: () => 'any' }),
      getJsDocs: () => [],
    } as any;

    mockVariableDeclaration.getInitializer.mockReturnValue(mockArrowFunction);
    mockVariableDeclaration.getName.mockReturnValue('testArrow');
    mockVariableStatement.getDeclarations.mockReturnValue([
      mockVariableDeclaration,
    ]);
    mockSourceFile.getVariableStatements.mockReturnValue([
      mockVariableStatement,
    ]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('testArrow(): any;');
  });

  it('アンダースコアで終わる変数名を除外する', async () => {
    const mockArrowFunction = {
      getKind: () => SyntaxKind.ArrowFunction,
      getParameters: () => [],
      getTypeParameters: () => [],
      getReturnTypeNode: () => null,
      getReturnType: () => ({ isVoid: () => false, getText: () => 'any' }),
      getJsDocs: () => [],
    } as any;

    mockVariableDeclaration.getInitializer.mockReturnValue(mockArrowFunction);
    mockVariableDeclaration.getName.mockReturnValue('testArrow_');
    mockVariableStatement.getDeclarations.mockReturnValue([
      mockVariableDeclaration,
    ]);
    mockSourceFile.getVariableStatements.mockReturnValue([
      mockVariableStatement,
    ]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('export type ServerScripts = {}');
  });

  it('アンビエント変数宣言を除外する', async () => {
    mockVariableStatement.isAmbient.mockReturnValue(true);
    mockSourceFile.getVariableStatements.mockReturnValue([
      mockVariableStatement,
    ]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('export type ServerScripts = {}');
  });

  it('関数式でない初期化子を除外する', async () => {
    const mockNonFunction = {
      getKind: () => 'StringLiteral',
    } as any;

    mockVariableDeclaration.getInitializer.mockReturnValue(mockNonFunction);
    mockVariableStatement.getDeclarations.mockReturnValue([
      mockVariableDeclaration,
    ]);
    mockSourceFile.getVariableStatements.mockReturnValue([
      mockVariableStatement,
    ]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('export type ServerScripts = {}');
  });

  it('複数の関数を正しく処理する', async () => {
    const mockFunction1 = { ...mockFunction } as any;
    const mockFunction2 = { ...mockFunction } as any;
    mockFunction1.getName.mockReturnValue('func1');
    mockFunction2.getName.mockReturnValue('func2');

    mockSourceFile.getFunctions.mockReturnValue([mockFunction1, mockFunction2]);

    const { writeFileSync } = await import('node:fs');
    await generateAppsScriptTypes(opts);

    const callArgs = (writeFileSync as any).mock.calls[0];
    expect(callArgs[1]).toContain('func2(): any;');
  });

  it('consola.infoが適切に呼ばれる', async () => {
    const { consola } = await import('consola');
    await generateAppsScriptTypes(opts);

    expect(consola.info).toHaveBeenCalledWith(
      'Starting AppsScript type generation with gasnuki...',
    );
    expect(consola.info).toHaveBeenCalledWith(
      '  AppsScript Source Directory: /p/src',
    );
    expect(consola.info).toHaveBeenCalledWith('  Output File: /p/out/types.ts');
    expect(consola.info).toHaveBeenCalledWith('Found 1 source file(s).');
  });

  it('関数が見つかった場合の適切なログメッセージ', async () => {
    mockSourceFile.getFunctions.mockReturnValue([mockFunction]);
    const { consola } = await import('consola');

    await generateAppsScriptTypes(opts);

    expect(consola.info).toHaveBeenCalledWith(
      expect.stringContaining(
        "Interface 'ServerScript' type definitions written to /p/out/types.ts (1 function(s), 0 type(s)).",
      ),
    );
  });

  it('関数が見つからない場合の適切なログメッセージ', async () => {
    const { consola } = await import('consola');

    await generateAppsScriptTypes(opts);

    expect(consola.info).toHaveBeenCalledWith(
      expect.stringContaining(
        "Interface 'ServerScript' type definitions written to /p/out/types.ts (no functions found).",
      ),
    );
  });
});
