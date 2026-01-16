# @ciderjs/gasnuki

[![README-en](https://img.shields.io/badge/English-blue?logo=ReadMe)](./README.md)
[![Test Coverage](https://img.shields.io/badge/test%20coverage-89.02%25-green)](https://github.com/luthpg/gasnuki)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@ciderjs/gasnuki.svg)](https://www.npmjs.com/package/@ciderjs/gasnuki)
![NPM Downloads](https://img.shields.io/npm/dw/@ciderjs/gasnuki)
[![GitHub issues](https://img.shields.io/github/issues/luthpg/gasnuki.svg)](https://github.com/luthpg/gasnuki/issues)

Google Apps Script クライアントサイドAPIの型定義・ユーティリティ

## 概要

`gasnuki`は、サーバーサイドのGoogle Apps Script関数から型定義を自動で抽出し、クライアントサイドで利用する`google.script.run` APIに完全な型付けを提供します。これにより、Apps Scriptバックエンドとモダンなフロントエンド開発との間のギャップを埋め、自動補完と堅牢な型チェックを実現します。

## `gasnuki`が実現する開発体験

`gasnuki`は、Google Apps Scriptを用いたWebアプリケーション開発における、もどかしい開発体験を劇的に改善します。

- **完全な型安全性**: `google.script.run`の引数や戻り値に型が付き、エディタの自動補完が効くため、推測に頼るコーディングは不要になります。
- **モダンな非同期処理**: `async/await`構文を利用して、コールバック地獄に陥ることなく、サーバーサイド関数をシンプルかつ直感的に呼び出せます。
- **高速な開発サイクル**: フロントエンドの変更を試すたびに`clasp push`する必要はありません。モック機能を使えば、オフラインで迅速なUI開発が可能です。
- **シームレスな統合**: Vite開発サーバーと連携し、サーバーサイドのコードを変更・保存するだけで、クライアントサイドの型定義が自動的に更新されます。

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

## 主な機能

`gasnuki`は、優れた開発体験を実現するために、以下の機能を提供します。

### サーバーサイド関数の型定義を自動生成

`gasnuki`コマンドを実行すると、指定されたApps Scriptプロジェクト内の `.ts` ファイルを解析し、公開されているすべてのサーバーサイド関数のシグネチャを抽出します。そして、クライアントサイドの`google.script.run`から安全に呼び出せる型定義ファイルを生成します。

### PromiseベースのモダンなAPIラッパー

`@ciderjs/gasnuki/promise`は、従来のコールバックベースのAPIを、`async/await`で利用可能なPromiseベースの型安全なラッパーに変換します。

1. `getPromisedServerScripts`関数をインポートし、`gasnuki`が生成した型`ServerScripts`を渡します。

    ```ts:lib/gas.ts
    import { getPromisedServerScripts } from '@ciderjs/gasnuki/promise';
    // gasnukiが生成した型定義のパスを指定します
    import type { ServerScripts } from '../types/appsscript';

    export const gas = getPromisedServerScripts<ServerScripts>();
    ```

2. これで、サーバーサイド関数を `async/await` で呼び出せます。

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

### フロントエンド開発を加速するモック機能

`getPromisedServerScripts`にモック用のオブジェクトを渡すことで、`clasp push`をせずともフロントエンド開発を進めることができます。これにより、バックエンドのロジックに依存せず、UIの挙動確認やデバッグを迅速に行えます。

```ts:lib/gas.ts
import {
  getPromisedServerScripts,
  type PartialScriptType,
} from '@ciderjs/gasnuki/promise';
import type { ServerScripts } from '../types/appsscript';

// 開発用のモック関数を定義します
const mockupFunctions: PartialScriptType<ServerScripts> = {
  // sayHello関数の動作をシミュレート
  sayHello: async (name) => {
    await new Promise(resolve => setTimeout(resolve, 500)); // ネットワーク遅延を模倣
    return `Hello from mockup, ${name}!`;
  },
  // 他の関数も同様にモックできます
};

export const gas = getPromisedServerScripts<ServerScripts>({ mockupFunctions });
```

### 型安全な JSON パース (Optional)

通常、Google Apps Script とクライアント間の通信で `JSON.parse()` を使うと戻り値が `any` になってしまいます。また、`Date` 型などはシリアライズの過程で文字列に変換され、手動での復元が必要になります。

`gasnuki` は、シリアライズ前の型情報を Branded Type (`JsonString<T>`) として保持することで、**`any` を介さない型安全な復元**を可能にします。

`getPromisedServerScripts` のオプションに `{ parseJson: true }` を指定すると、サーバー側で `serialize()` された戻り値を自動でデシリアライズし、`Date` オブジェクトも正しく復元します。

```ts
// サーバー側 (Apps Script)
// const getAppData = () => serialize({ updatedAt: new Date(), user: 'Alice' });

// クライアント側
export const gas = getPromisedServerScripts<ServerScripts>({
  parseJson: true
});

async function fetchData() {
  // 戻り値は `any` ではなく、元のオブジェクト型として推論されます
  // Date オブジェクトも自動的に復元されます
  const result = await gas.getAppData();
  console.log(result.user); // 'Alice' (string)
  console.log(result.updatedAt instanceof Date); // true
}
```

## コントリビュート

バグ報告やプルリクエストは歓迎します。
`issues`または`pull requests`からご連絡ください。

## ライセンス

MIT
