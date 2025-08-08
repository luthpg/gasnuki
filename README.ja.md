# gasnuki

[![Test Coverage](https://img.shields.io/badge/test%20coverage-79.67%25-yellowgreen)](https://github.com/luthpg/gasnuki)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@ciderjs/gasnuki.svg)](https://www.npmjs.com/package/@ciderjs/gasnuki)
[![GitHub issues](https://img.shields.io/github/issues/luthpg/gasnuki.svg)](https://github.com/luthpg/gasnuki/issues)

Google Apps Script クライアントサイドAPIの型定義・ユーティリティ

## 概要

`gasnuki`は、Google Apps Script のクライアントサイドAPIをTypeScriptで安全に扱うための型定義とユーティリティを提供します。
Apps Scriptとフロントエンド間の型安全な通信をサポートします。

## インストール

```bash
npm install @ciderjs/gasnuki
```

または

```bash
pnpm add @ciderjs/gasnuki
```

## 使い方

1. 型定義ファイルを生成します:

```bash
npx @ciderjs/gasnuki
```

... または、プロジェクトのnpmスクリプトを `package.json` に追加:

```jsonc
{
  // others...
  "scripts": {
    "gas": "gasnuki"
  }
}
```

デフォルトでは `types` ディレクトリに型定義ファイルが生成されます。

2. 生成されたディレクトリ（デフォルト: `types`）を `tsconfig.json` の `include` に追加してください:

```jsonc
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

## 機能

- Google Apps Script クライアントAPIの型定義
- サーバーサイド関数の戻り値型をvoidに変換するユーティリティ型

## コントリビュート

バグ報告やプルリクエストは歓迎します。
`issues`または`pull requests`からご連絡ください。

## ライセンス

MIT
