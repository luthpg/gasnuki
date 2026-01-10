# Folder 型インポート問題の調査・修正レポート (詳細版)

## 概要

`@flow-manager` プロジェクトにおいて、`gasnuki` が生成する `client.ts` に `Folder` 型のインポート文が出力されない問題を調査しています。
主な原因は、依存関係の収集漏れではなく、**生成される型テキストが絶対パスを含んでしまうことによる「使用中チェック (Usage Check)」の空振り**であることが判明しました。

## 調査によって判明した詳細な課題

### 1. 型テキストの「パス汚染 (Path Poisoning)」

`ts-morph` の `getType().getText()` は、型が宣言されたファイルの外から参照される場合、`import("C:/...").Folder` のように完全パスを含む文字列を返すことがあります。

- **発生条件**: 特に `JsonString<T>` のような、別ファイルで定義された複雑なジェネリクスの引数として渡される場合に顕著です。
- **副作用**: 生成された `.ts` ファイルの中にローカルパスがハードコードされ、環境依存のビルドエラーを引き起こします。

### 2. インポート判定ロジックの見落とし (Usage Check Logic)

現在、インポートを出力するかどうかは以下のロジックで判定されています。

```typescript
const regex = new RegExp(`\\b${importName}\\b`);
const isUsed = regex.test(bodyContent);
```

- **問題点**: `bodyContent` 内の型名が `import("...").Folder` となっている場合、単一の単語としての `Folder` にマッチせず、未使用と判断されて `import` 文が削られてしまいます。
- **悪循環**: `cleanType` 関数が型定義の一部を掃除しきれていない、あるいは掃除した後のテキストで判定が行われていないことが原因です。

### 3. エイリアス・プロパティの型消失

shorthand property (`{ folders }` など) を通じて返されるオブジェクトの型を resolve する際、通常の `symbol.getTypeAtLocation` では `any` と判定されるケースがあります。

- `prop.getAliasedSymbol()` を明示的に辿ることで、元の `Folder[]` 型を捕捉できることがわかりました。

## 環境による挙動の差についての考察

なぜ `gasnuki` 自体のテスト (`issue_repro.test.ts`) ではパスし、`flow-manager` 実環境では失敗するのか？

- **プロジェクト構造の複雑さ**: 実環境では `~/types/flow` のような alias や、複数のライブラリ間にまたがる複雑な依存関係があり、`ts-morph` が「曖昧さを避けるためにフルパスを出力する」判断をより強く行っているためと考えられます。

## 後続タスクへの有意な情報

### 技術的解決策の候補

- **`TypeFormatFlags` の活用**: `type.getText(node, TypeFormatFlags.NoTruncation | TypeFormatFlags.UseFullyQualifiedType)` 等を検討し、文字列ベースの置換に頼らないクリーンな出力を目指す。
- **参照カウントの導入**: 文字列のマッチングではなく、収集プロセスの中で「実際にコードとして出力したシンボル」をフラグ立てする。
- **Import Mapper の精緻化**: `import("...")` 形式のテキストが残ってしまった場合でも、そこからモジュールパスと型名を抽出して `importsMap` に統合するフォールバック。

### 検証項目 (Checklist)

- [ ] `client.ts` 内に絶対パス (`C:/...` や `/Users/...`) が一切含まれていないこと。
- [ ] `Folder` 型が `JsonString` の中だけでなく、関数の戻り値や引数に直接現れる場合も正しくインポートされること。
- [ ] 生成後の `client.ts` を実際にプロジェクトで import して、TypeScript コンパイラがエラーを出さないこと。

## 目指すべきポイント (Next Goals)

- [x] 依存関係収集のフォールバック実装 (Apparent Type, Aliased Symbol)
- [ ] **Type Formatting の抜本的見直し**: パス汚染を元から断つ方法の実装。
- [ ] **Usage Check の堅牢化**: 正規表現に依存しない、より確実な使用判定。
- [ ] **不要なデバッグログの除去**: 安定動作確認後のクリーンアップ。
