import { describe, expect, it, vi } from 'vitest';
import { getPromisedServerScripts } from '../src/promise';
import type { PartialScriptType, Promised } from '../src/promise';

describe('getPromisedServerScripts', () => {
  it('googleが存在しない場合はmockupFunctionsを返す', () => {
    const mock = { foo: vi.fn().mockResolvedValue(42) };

    // globalThis.googleが未定義であることを保証
    // biome-ignore lint/suspicious/noExplicitAny: use globalThis without 'google'
    const g = globalThis as any;
    const originalGoogle = g.google;
    g.google = undefined;

    const result = getPromisedServerScripts<typeof mock>(mock);
    expect(result.foo).toBe(mock.foo);

    // 後始末
    if (originalGoogle !== undefined) g.google = originalGoogle;
    else g.google = undefined;
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
});
