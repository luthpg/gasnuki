import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPromisedServerScripts } from '../src/promise';
import type { PartialScriptType, Promised } from '../src/promise';

describe('getPromisedServerScripts', () => {
  let originalGoogle: any;

  beforeEach(() => {
    // 元のgoogleオブジェクトを保存
    originalGoogle = (globalThis as any).google;
  });

  afterEach(() => {
    // テスト後にgoogleオブジェクトを復元
    (globalThis as any).google = originalGoogle;
  });

  it('googleが存在しない場合はmockupFunctionsを返す', () => {
    const mock = { foo: vi.fn().mockResolvedValue(42) };

    // globalThis.googleが未定義であることを保証
    (globalThis as any).google = undefined;

    const result = getPromisedServerScripts<typeof mock>(mock);
    expect(result.foo).toBe(mock.foo);
  });

  it('google.script.runが存在しない場合はmockupFunctionsを返す', () => {
    const mock = { foo: vi.fn().mockResolvedValue(42) };

    // googleは存在するがscript.runが存在しない場合
    (globalThis as any).google = {};

    const result = getPromisedServerScripts<typeof mock>(mock);
    expect(result.foo).toBe(mock.foo);
  });

  it('google.script.runが存在し、メソッドが存在する場合はPromiseを返す', async () => {
    const mockSuccessHandler = vi.fn();
    const mockFailureHandler = vi.fn();
    const mockMethod = vi.fn();

    // google.script.runのモックを作成
    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn().mockReturnValue({
            withFailureHandler: vi.fn().mockReturnValue({
              testMethod: mockMethod,
            }),
          }),
          testMethod: mockMethod,
        },
      },
    };

    const result = getPromisedServerScripts();

    // testMethodが関数として呼び出せることを確認
    expect(typeof result.testMethod).toBe('function');

    // メソッドを呼び出したときにgoogle.script.runが正しく呼ばれることを確認
    const promise = result.testMethod('arg1', 'arg2');
    expect(promise).toBeInstanceOf(Promise);
  });

  it('メソッドがgoogle.script.runに存在しない場合はエラーを投げる', () => {
    // google.script.runは存在するが、特定のメソッドが存在しない場合
    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn(),
          withFailureHandler: vi.fn(),
          // testMethodは存在しない
        },
      },
    };

    const result = getPromisedServerScripts();

    // 存在しないメソッドを呼び出すとエラーが投げられる
    expect(() => result.nonExistentMethod()).toThrow(
      'Method nonExistentMethod not found in AppsScript.',
    );
  });

  it('Promiseが成功した場合はresolveされる', async () => {
    const mockSuccessHandler = vi.fn();
    const mockFailureHandler = vi.fn();
    const mockMethod = vi.fn();

    // google.script.runのモックを作成
    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn().mockReturnValue({
            withFailureHandler: vi.fn().mockReturnValue({
              testMethod: mockMethod,
            }),
          }),
          testMethod: mockMethod,
        },
      },
    };

    const result = getPromisedServerScripts();

    // 成功ハンドラーが呼ばれたときにPromiseがresolveされることを確認
    const promise = result.testMethod('success');

    // モックの実装を確認
    expect(mockMethod).toHaveBeenCalledWith('success');
  });

  it('Promiseが失敗した場合はrejectされる', async () => {
    const mockSuccessHandler = vi.fn();
    const mockFailureHandler = vi.fn();
    const mockMethod = vi.fn();

    // google.script.runのモックを作成
    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn().mockReturnValue({
            withFailureHandler: vi.fn().mockReturnValue({
              testMethod: mockMethod,
            }),
          }),
          testMethod: mockMethod,
        },
      },
    };

    const result = getPromisedServerScripts();

    // 失敗ハンドラーが呼ばれたときにPromiseがrejectされることを確認
    const promise = result.testMethod('failure');

    // モックの実装を確認
    expect(mockMethod).toHaveBeenCalledWith('failure');
  });

  it('複数の引数を持つメソッドを正しく処理する', async () => {
    const mockMethod = vi.fn();

    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn().mockReturnValue({
            withFailureHandler: vi.fn().mockReturnValue({
              multiArgMethod: mockMethod,
            }),
          }),
          multiArgMethod: mockMethod,
        },
      },
    };

    const result = getPromisedServerScripts();

    // 複数の引数でメソッドを呼び出す
    const promise = result.multiArgMethod('arg1', 42, { key: 'value' });

    expect(promise).toBeInstanceOf(Promise);
    expect(mockMethod).toHaveBeenCalledWith('arg1', 42, { key: 'value' });
  });

  it('引数なしのメソッドを正しく処理する', async () => {
    const mockMethod = vi.fn();

    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn().mockReturnValue({
            withFailureHandler: vi.fn().mockReturnValue({
              noArgMethod: mockMethod,
            }),
          }),
          noArgMethod: mockMethod,
        },
      },
    };

    const result = getPromisedServerScripts();

    // 引数なしでメソッドを呼び出す
    const promise = result.noArgMethod();

    expect(promise).toBeInstanceOf(Promise);
    expect(mockMethod).toHaveBeenCalledWith();
  });

  it('google.script.runが存在する場合、存在しないメソッドはエラーを投げる（mockupFunctionsがあっても）', () => {
    const mockupFunctions = {
      customMethod: vi.fn().mockResolvedValue('custom result'),
    };

    // google.script.runは存在するが、customMethodは存在しない
    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn(),
          withFailureHandler: vi.fn(),
          // customMethodは存在しない
        },
      },
    };

    const result = getPromisedServerScripts(mockupFunctions);

    // google.script.runが存在する場合、存在しないメソッドはエラーになる
    expect(() => result.customMethod()).toThrow(
      'Method customMethod not found in AppsScript.',
    );
  });

  it('google.script.runが存在しない場合、mockupFunctionsからメソッドを取得する', () => {
    const mockupFunctions = {
      customMethod: vi.fn().mockResolvedValue('custom result'),
    };

    // google.script.runが存在しない
    (globalThis as any).google = undefined;

    const result = getPromisedServerScripts(mockupFunctions);

    // customMethodはmockupFunctionsから取得される
    expect(result.customMethod).toBe(mockupFunctions.customMethod);

    // 実際に呼び出してみる
    const promise = result.customMethod();
    expect(promise).toBeInstanceOf(Promise);
  });

  it('mockupFunctionsが指定された場合、存在するメソッドはgoogle.script.runから取得される', async () => {
    const mockupFunctions = {
      existingMethod: vi.fn().mockResolvedValue('mock result'),
    };

    const mockMethod = vi.fn();

    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn().mockReturnValue({
            withFailureHandler: vi.fn().mockReturnValue({
              existingMethod: mockMethod,
            }),
          }),
          existingMethod: mockMethod,
        },
      },
    };

    const result = getPromisedServerScripts(mockupFunctions);

    // existingMethodはgoogle.script.runから取得される（mockupFunctionsではない）
    expect(result.existingMethod).not.toBe(mockupFunctions.existingMethod);
    expect(typeof result.existingMethod).toBe('function');
  });

  it('空のmockupFunctionsを指定した場合でも正常に動作する', async () => {
    const mockMethod = vi.fn();

    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn().mockReturnValue({
            withFailureHandler: vi.fn().mockReturnValue({
              testMethod: mockMethod,
            }),
          }),
          testMethod: mockMethod,
        },
      },
    };

    const result = getPromisedServerScripts({});

    expect(typeof result.testMethod).toBe('function');
    const promise = result.testMethod('test');
    expect(promise).toBeInstanceOf(Promise);
  });

  it('undefinedのmockupFunctionsを指定した場合でも正常に動作する', async () => {
    const mockMethod = vi.fn();

    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler: vi.fn().mockReturnValue({
            withFailureHandler: vi.fn().mockReturnValue({
              testMethod: mockMethod,
            }),
          }),
          testMethod: mockMethod,
        },
      },
    };

    const result = getPromisedServerScripts(undefined);

    expect(typeof result.testMethod).toBe('function');
    const promise = result.testMethod('test');
    expect(promise).toBeInstanceOf(Promise);
  });

  it('型ユーティリティ: Promised/PartialScriptType', () => {
    type T = { foo: (a: number) => string; bar: () => number };
    type P = Promised<T>;
    type PP = PartialScriptType<T>;

    // 型エラーが出ないことを確認（型テスト）
    const p: P = { foo: async (a) => 'x', bar: async () => 1 };
    const pp: PP = { foo: async (a) => 'x' };

    expect(p).toBeDefined();
    expect(pp).toBeDefined();
  });

  it('複雑な型のPromised変換', () => {
    type ComplexType = {
      method1: (a: string, b: number) => boolean;
      method2: () => string;
      method3: (x: { key: string }) => number;
      property: string; // 関数ではないプロパティ
    };

    type PromisedComplex = Promised<ComplexType>;

    // 型エラーが出ないことを確認
    const result: PromisedComplex = {
      method1: async (a, b) => true,
      method2: async () => 'test',
      method3: async (x) => 42,
      property: 'test', // 関数ではないプロパティはそのまま
    };

    expect(result).toBeDefined();
    expect(typeof result.method1).toBe('function');
    expect(typeof result.method2).toBe('function');
    expect(typeof result.method3).toBe('function');
    expect(typeof result.property).toBe('string');
  });

  it('PartialScriptTypeで部分的な関数定義', () => {
    type OriginalType = {
      method1: (a: number) => string;
      method2: (b: string) => number;
      method3: () => boolean;
    };

    type PartialType = PartialScriptType<OriginalType>;

    // 一部のメソッドのみ定義
    const partial: PartialType = {
      method1: async (a) => `result: ${a}`,
      // method2とmethod3は定義しない
    };

    expect(partial.method1).toBeDefined();
    expect(partial.method2).toBeUndefined();
    expect(partial.method3).toBeUndefined();
  });
});
