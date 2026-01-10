// --- 型定義 ---
declare const __brand: unique symbol;
/**
 * T型の情報を持ったJSON文字列型
 */
export type JsonString<T> = string & { [__brand]: T };

// --- Date復元用のヘルパー (Reviver) ---
// ISO 8601形式の日付文字列にマッチする正規表現
const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

// biome-ignore lint/suspicious/noExplicitAny: 値内部構造の型を明示するのは難しい
function dateReviver(_key: string, value: any): any {
  // 文字列かつ、ISO日付フォーマットの場合
  if (typeof value === 'string' && isoDateRegex.test(value)) {
    const date = new Date(value);
    // 無効な日付(Invalid Date)でなければDateオブジェクトを返す
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return value;
}

/**
 * オブジェクトを型安全にJSON文字列に変換します。
 * @param data 変換するオブジェクト
 * @returns JSON文字列
 */
export const serialize = <T>(data: T): JsonString<T> => {
  return JSON.stringify(data) as JsonString<T>;
};

/**
 * JSON文字列を型安全に復元します。また値がISO 8601形式の日付文字列の場合はDateオブジェクトに変換します。
 * @param json JSON文字列
 * @returns 変換後のオブジェクト
 */
export const deserialize = <T>(json: JsonString<T>): T => {
  return JSON.parse(json, dateReviver);
};
