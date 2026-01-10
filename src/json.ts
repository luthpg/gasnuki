// --- 型定義 ---
declare const __brand: unique symbol;
/**
 * シリアライズ前の型情報 `T` を保持したJSON文字列型。
 * 単なる string ではなく、型システム上で元の型を記憶することで、
 * 復元時に型安全なパース（anyを介さない復元）を可能にします。
 */
export type JsonString<T> = string & { [__brand]: T };

// --- Date復元用のヘルパー (Reviver) ---
// ISO 8601形式の日付文字列にマッチする正規表現
const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

/**
 * JSON.parse 時に実行される reviver 関数。
 * 値が ISO 8601 形式の文字列であれば Date オブジェクトに復元します。
 */
// biome-ignore lint/suspicious/noExplicitAny: 内部構造の型判定のためanyを許容
function dateReviver(_key: string, value: any): any {
  if (typeof value === 'string' && isoDateRegex.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return value;
}

/**
 * オブジェクトを型情報を保持したまま JSON 文字列に変換します。
 * 戻り値は元の型 `T` を記憶した `JsonString<T>` となります。
 *
 * @param data 変換するオブジェクト
 * @returns 型情報を保持した JSON 文字列
 */
export const serialize = <T>(data: T): JsonString<T> => {
  return JSON.stringify(data) as JsonString<T>;
};

/**
 * `JsonString<T>` から元の型 `T` を型安全に復元します。
 * 通常の `JSON.parse` と異なり、戻り値が `any` にならず、
 * また ISO 8601 形式の文字列は自動的に `Date` オブジェクトへ変換されます。
 *
 * @param json 型情報を保持した JSON 文字列
 * @returns 元の型 `T` に復元されたオブジェクト
 */
export const deserialize = <T>(json: JsonString<T>): T => {
  return JSON.parse(json, dateReviver);
};
