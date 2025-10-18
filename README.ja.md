# @ciderjs/gasnuki

[![README-en](https://img.shields.io/badge/English-blue?logo=ReadMe)](./README.md)
[![Test Coverage](https://img.shields.io/badge/test%20coverage-95.1%25-brightgreen)](https://github.com/luthpg/gasnuki)
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

### Vite プラグインとしての使い方

Vite を使用している場合、`gasnuki` をプラグインとして統合し、サーバーサイドのファイルが変更されたときに自動で型定義を生成できます。

1. `vite` と `@ciderjs/gasnuki` をインストールします:

    ```bash
    pnpm add -D vite @ciderjs/gasnuki
    ```

2. `vite.config.ts` にプラグインを追加します:

    ```ts
    import { defineConfig } from 'vite';
    import { gasnuki } from '@ciderjs/gasnuki/vite';

    export default defineConfig({
      plugins: [
        gasnuki({
          /* オプション */
        }),
      ],
    });
    ```

    これで `vite dev` を実行すると、`gasnuki` がApps Scriptソースファイルの変更を自動的に監視し、型を再生成します。

---

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

### Promiseベースのラッパー

`@ciderjs/gasnuki/promise` を利用すると、`google.script.run` をPromiseを返す型安全なラッパーとして使用できます。これにより、`async/await` を使ったモダンな非同期処理を記述できます。

1. まず、`gasnuki` で生成した型定義 (`ServerScripts`) と、`getPromisedServerScripts` 関数をインポートします。

    ```ts:lib/gas.ts
    import { getPromisedServerScripts } from '@ciderjs/gasnuki/promise';
    // gasnukiが生成した型定義のパスを指定します
    import type { ServerScripts } from '../types/appsscript';

    export const gas = getPromisedServerScripts<ServerScripts>();
    ```

2. 作成した `gas` オブジェクトを使って、サーバーサイド関数を `async/await` で呼び出します。

    ```ts:components/MyComponent.tsx
    import { gas } from '../lib/gas';

    async function fetchData() {
      try {
        // 'getContent' の引数と戻り値が型安全になります
        const result = await gas.getContent('Sheet1');
        console.log(result);
      } catch (error) {
        console.error(error);
      }
    }
    ```

#### モックアップによる開発

`getPromisedServerScripts` にモック関数を渡すことで、`clasp push` をせずともフロントエンド開発を進めることができます。

```ts:lib/gas.ts
import {
  getPromisedServerScripts,
  type PartialScriptType,
} from '@ciderjs/gasnuki/promise';
import type { ServerScripts } from '../types/appsscript';

// 開発用のモック関数を定義します
const mockup: PartialScriptType<ServerScripts> = {
  // sayHello関数の動作をシミュレート
  sayHello: async (name) => {
    await new Promise(resolve => setTimeout(resolve, 500)); // ネットワーク遅延を模倣
    return `Hello from mockup, ${name}!`;
  },
  // 他の関数も同様にモックできます
};

export const gas = getPromisedServerScripts<ServerScripts>(mockup);
```

## コントリビュート

バグ報告やプルリクエストは歓迎します。
`issues`または`pull requests`からご連絡ください。

## ライセンス

MIT
