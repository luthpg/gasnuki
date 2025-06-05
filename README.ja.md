# gasnuki

Google Apps Script クライアントサイドAPIの型定義・ユーティリティ

## 概要

`gasnuki`は、Google Apps Script のクライアントサイドAPIをTypeScriptで安全に扱うための型定義とユーティリティを提供します。
Apps Scriptとフロントエンド間の型安全な通信をサポートします。

## インストール

```bash
npm install gasnuki
```

または

```bash
yarn add gasnuki
```

## 使い方

1. 型定義ファイルを生成します:

```bash
npx gasnuki
```

デフォルトでは `types` ディレクトリに型定義ファイルが生成されます。

2. 生成されたディレクトリ（デフォルト: `types`）を `tsconfig.json` の `include` に追加してください:

```json
{
  "compilerOptions": {
    // ... your options ...
  },
  "include": [
    "src",
    "types" // 型定義ファイルが 'types' ディレクトリにある場合はこれを追加
  ]
}
```

3. これで型定義付きで `google` を利用できます。

```ts
// google.script.run への型安全なアクセス
// 例: サーバーサイド関数 getContent を呼び出す

google.script.run
  .withSuccessHandler((result) => {
    console.log(result);
  })
  .getContent('Sheet1');
```

## 提供機能

- Google Apps Script クライアントAPIの型定義
- サーバーサイド関数の戻り値型をvoidに変換するユーティリティ型

## コントリビュート

バグ報告やプルリクエストは歓迎します。
`issues`または`pull requests`からご連絡ください。

## ライセンス

MIT 