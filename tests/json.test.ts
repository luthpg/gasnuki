import { describe, expect, it } from 'vitest';
import { deserialize, type JsonString, serialize } from '../src/json';

describe('json serialization/deserialization', () => {
  it('Dateオブジェクトを含むオブジェクトを正しくシリアライズ/デシリアライズできること', () => {
    const data = {
      name: 'test',
      date: new Date('2023-01-01T00:00:00.000Z'),
    };
    const serialized = serialize(data);
    const deserialized = deserialize(serialized);

    expect(deserialized.name).toBe('test');
    expect(deserialized.date).toBeInstanceOf(Date);
    expect(deserialized.date.toISOString()).toBe('2023-01-01T00:00:00.000Z');
  });

  it('ISO 8601形式に見えるが不正な日付文字列はDateに復元されないこと', () => {
    // 13月45日など
    const invalidDateStr = '2023-13-45T25:60:60.000Z';
    const json = `{"date": "${invalidDateStr}"}` as JsonString<{
      date: string;
    }>;
    const deserialized = deserialize(json);

    expect(deserialized.date).toBe(invalidDateStr);
    expect(deserialized.date).not.toBeInstanceOf(Date);
  });

  it('オブジェクトのプロパティ名自体が日付形式の文字列であっても、値が日付でなければ復元されないこと', () => {
    const dateStr = '2023-01-01T00:00:00.000Z';
    const json = `{"${dateStr}": "value"}` as JsonString<{
      [key: string]: string;
    }>;
    const deserialized = deserialize(json);

    expect(deserialized[dateStr]).toBe('value');
    expect(deserialized[dateStr]).not.toBeInstanceOf(Date);
  });

  it('非常に深いネストの中にあるDateオブジェクトが復元されること', () => {
    const date = new Date('2023-01-01T00:00:00.000Z');
    let data: any = { date };
    for (let i = 0; i < 100; i++) {
      data = { child: data };
    }

    const serialized = serialize(data);
    const deserialized = deserialize(serialized);

    let current = deserialized;
    for (let i = 0; i < 100; i++) {
      current = current.child;
    }
    expect(current.date).toBeInstanceOf(Date);
    expect(current.date.toISOString()).toBe('2023-01-01T00:00:00.000Z');
  });

  it('配列内の混合データ（Dateを含む）が正しく復元されること', () => {
    const date = new Date('2023-01-01T00:00:00.000Z');
    const data = [1, 'string', date, { d: date }];
    const serialized = serialize(data) as JsonString<
      [number, string, Date, { d: Date }]
    >;
    const deserialized = deserialize(serialized);

    expect(deserialized[0]).toBe(1);
    expect(deserialized[1]).toBe('string');
    expect(deserialized[2]).toBeInstanceOf(Date);
    expect(deserialized[3].d).toBeInstanceOf(Date);
  });

  it('NaN, Infinity, -Infinity が null に変換されること (JSON標準挙動の確認)', () => {
    const data = {
      n: NaN,
      i: Infinity,
      mi: -Infinity,
    };
    const serialized = serialize(data);
    const deserialized = deserialize(serialized);

    expect(deserialized.n).toBeNull();
    expect(deserialized.i).toBeNull();
    expect(deserialized.mi).toBeNull();
  });

  it('null と undefined の混在', () => {
    const data = {
      a: null,
      b: undefined,
    };
    const serialized = serialize(data);
    const deserialized = deserialize(serialized);

    expect(deserialized.a).toBeNull();
    // JSON.stringifyでundefinedは除外される
    expect(deserialized).not.toHaveProperty('b');
  });

  it('空文字列やスペースのみの文字列がDateとして誤判定されないこと', () => {
    const data = {
      empty: '',
      space: ' ',
      almostDate: '2023-01-01',
    };
    const serialized = serialize(data);
    const deserialized = deserialize(serialized);

    expect(deserialized.empty).toBe('');
    expect(deserialized.space).toBe(' ');
    expect(deserialized.almostDate).toBe('2023-01-01');
  });

  it('循環参照を持つオブジェクトは例外を投げること', () => {
    const data: any = { a: 1 };
    data.self = data;

    expect(() => serialize(data)).toThrow();
  });
});
