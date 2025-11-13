# libSQL vs DuckDB 比較リサーチ (TypeScript)

libSQLとDuckDBの機能・性能を比較し、それぞれの使い所を明確にするためのリサーチプロジェクトです。

## 概要

### libSQL とは

- **SQLiteのフォーク** - Tursoが開発する次世代SQLite
- **OLTP向け** - トランザクション処理に最適化
- **特徴**:
  - SQLite完全互換
  - 組み込み可能（サーバー不要）
  - レプリケーション機能
  - 暗号化サポート
  - WebAssembly統合
  - 低レイテンシー

### DuckDB とは

- **分析用データベース** - OLAP（分析処理）に特化
- **インプロセス** - アプリケーション内で動作
- **特徴**:
  - カラムナストレージ
  - ベクトル化クエリ処理
  - CSV/Parquet直接クエリ
  - ウィンドウ関数等の高度な分析機能
  - クラウドストレージ連携
  - ゼロ依存関係

## 主な違い

| 項目 | libSQL | DuckDB |
|------|--------|--------|
| **用途** | OLTP (トランザクション処理) | OLAP (分析処理) |
| **ストレージ** | 行指向 | カラムナ（列指向） |
| **強み** | 個別レコードの読み書き | 大量データの集計・分析 |
| **トランザクション** | ACID完全準拠 | 対応（分析用途では重要度低） |
| **ベース** | SQLite | 独自設計 |
| **特徴的機能** | レプリケーション | CSV/Parquet直接クエリ、配列型 |
| **RAG/Vector検索** | 不向き（ネイティブサポートなし） | 有利（配列型＋ベクトル演算） |

## セットアップ

### 必要要件

- Node.js 18以上
- npm または yarn

### インストール

```bash
cd 01-libsql-vs-duckdb
npm install
```

## デモスクリプト

### 1. 基本デモ (`npm run demo`)

libSQLとDuckDBの基本的な操作を実演し、簡単な性能比較を行います。

```bash
npm run demo
```

**実演内容:**
- データベース接続とテーブル作成
- データの挿入
- SELECT クエリ
- 集計クエリ
- トランザクション処理（libSQL）
- 高度な分析クエリ（DuckDB）

### 2. パフォーマンスベンチマーク (`npm run benchmark`)

大量データでの性能を詳細に比較します。

```bash
npm run benchmark
```

**テスト項目:**
- データ挿入速度（10,000〜100,000件）
- SELECT クエリ性能
- GROUP BY 集計性能
- 複雑な集計クエリ
- UPDATE 性能
- ウィンドウ関数（DuckDB）

**データサイズ選択:**
- 小: 10,000件（高速）
- 中: 50,000件（推奨）
- 大: 100,000件（詳細比較）

### 3. 機能比較デモ (`npm run features`)

各データベースの特徴的な機能を実演します。

```bash
npm run features
```

**libSQL のデモ機能:**
- ACIDトランザクション
- 軽量・組み込み型
- JSON サポート
- WAL モード

**DuckDB のデモ機能:**
- CSV/Parquetの直接クエリ
- ウィンドウ関数
- カラムナストレージによる高速集計
- PIVOT機能
- データエクスポート

### 4. RAG Vector検索デモ (`npm run rag-demo`) ⭐ NEW

RAG（Retrieval Augmented Generation）のベクトル検索バックエンドとしての比較。

```bash
npm run rag-demo
```

**実演内容:**
- 1,000件のドキュメント埋め込みを挿入
- ベクトル類似度検索（コサイン類似度）
- libSQL vs DuckDBのRAG性能比較

**わかること:**
- DuckDBがRAGバックエンドとして圧倒的に有利
- 配列型のネイティブサポート
- SQL内でのベクトル演算（list_dot_product）
- カラムナストレージによる高速検索

## 使い分けガイド

### libSQL を選ぶべきケース

✅ **適している用途:**
- Webアプリケーションのメインデータベース
- モバイルアプリのローカルストレージ
- IoT/エッジデバイス
- マイクロサービスの状態管理
- リアルタイムアプリケーション
- オフライン機能が必要なアプリ

💡 **具体例:**
- ユーザー認証・プロフィール管理
- ショッピングカート
- チャットアプリのメッセージDB
- タスク管理アプリ
- モバイルゲームのセーブデータ

### DuckDB を選ぶべきケース

✅ **適している用途:**
- データ分析・BI
- ETL/データパイプライン
- データサイエンスワークフロー
- ログ分析
- レポート生成
- アドホッククエリ
- **RAGのVector検索バックエンド** ⭐

💡 **具体例:**
- 売上分析ダッシュボード
- ログファイルの集計分析
- CSV/Parquetファイルの処理
- 機械学習の前処理
- データクレンジング
- BIツールのバックエンド
- **RAGシステムのドキュメント検索**

### RAG (Vector検索) での評価

#### DuckDB が推奨される理由 ⭐

- ✅ **配列型のネイティブサポート**: `DOUBLE[]` でベクトルを保存
- ✅ **ベクトル演算関数**: `list_dot_product()` でコサイン類似度計算
- ✅ **カラムナストレージ**: ベクトル取得が高速
- ✅ **並列処理**: ベクトル化実行で効率的
- ✅ **CSV/Parquetサポート**: 埋め込みデータを直接読み込み

#### libSQL の課題

- ❌ ベクトル型のネイティブサポートなし
- ❌ JSON文字列として保存が必要
- ❌ アプリケーション側でベクトル演算
- ❌ 全件スキャンが必要
- ⚠️ 小規模（数百〜数千ドキュメント）なら可能

#### 専用Vector DBとの比較

より大規模・高速なVector検索には専用DBを検討:
- Pinecone, Weaviate, Qdrant, Milvus, Chroma

DuckDBは汎用DBとして以下に適している:
- プロトタイプやMVP
- 中規模データ（〜100万ドキュメント）
- オフライン処理・バッチ処理
- 既存のSQLワークフローとの統合

### 両方を組み合わせる

多くのアプリケーションでは、両方を組み合わせることで最適な結果が得られます:

```
┌─────────────┐        ┌──────────────┐
│   libSQL    │───────>│   DuckDB     │
│  (OLTP)     │ export │   (OLAP)     │
│             │        │              │
│ トランザクション │        │ データ分析   │
│ リアルタイム  │        │ レポート生成 │
│             │        │ Vector検索   │
└─────────────┘        └──────────────┘
```

**例:**
- libSQL: ユーザーの注文データを管理
- DuckDB: 注文データをエクスポートして月次レポート生成
- DuckDB: ドキュメント埋め込みでRAG検索

## ベンチマーク結果の例

### 中規模データ (50,000件) での典型的な結果

| 操作 | libSQL | DuckDB | 高速 |
|------|--------|--------|------|
| データ挿入 | 0.8秒 | 0.5秒 | DuckDB |
| SELECT | 2.5ms | 3.0ms | libSQL |
| GROUP BY集計 | 15ms | 8ms | DuckDB |
| 複雑な集計 | 25ms | 12ms | DuckDB |
| UPDATE | 30ms | 40ms | libSQL |

### RAG Vector検索 (1,000ドキュメント)

| 操作 | libSQL | DuckDB | 高速 |
|------|--------|--------|------|
| 挿入 | 0.5秒 | 0.4秒 | DuckDB |
| Vector検索 | 50ms | 10ms | DuckDB 5x高速 |

**結論:**
- **個別レコード操作**: libSQL が高速
- **集計・分析**: DuckDB が高速
- **Vector検索**: DuckDB が圧倒的に高速
- **トランザクション**: libSQL が安定

## 技術的詳細

### アーキテクチャの違い

**libSQL (行指向ストレージ):**
```
レコード1: [id=1, name=Alice, age=25, city=Tokyo]
レコード2: [id=2, name=Bob, age=30, city=Osaka]
レコード3: [id=3, name=Carol, age=28, city=Kyoto]
```
→ 個別レコードの読み書きが高速

**DuckDB (カラムナストレージ):**
```
id列:   [1, 2, 3, ...]
name列: [Alice, Bob, Carol, ...]
age列:  [25, 30, 28, ...]
city列: [Tokyo, Osaka, Kyoto, ...]
```
→ 特定カラムの集計が高速、圧縮効率が良い

### クエリ処理の違い

**libSQL:**
- 行ごとに処理（Row-by-row）
- トランザクション制御に最適化
- B-Treeインデックス

**DuckDB:**
- ベクトル化処理（Vectorized execution）
- CPU並列処理の活用
- カラムナスキャン最適化
- 配列型とベクトル演算のサポート

## ファイル構成

```
01-libsql-vs-duckdb/
├── README.md              # このファイル
├── package.json           # npm設定
├── tsconfig.json          # TypeScript設定
├── .gitignore             # Git除外設定
└── src/
    ├── demo.ts            # 基本デモ
    ├── benchmark.ts       # パフォーマンステスト
    ├── features.ts        # 機能比較
    └── rag-demo.ts        # RAG Vector検索デモ
```

## まとめ

### libSQL を一言で

> 「軽量で信頼性の高いトランザクション処理データベース」

### DuckDB を一言で

> 「高速で強力なインプロセス分析データベース」

### 選択のポイント

1. **データの使い方**を考える
   - 頻繁に更新？ → libSQL
   - 主に集計・分析？ → DuckDB
   - Vector検索？ → DuckDB

2. **データ量**を考慮
   - 小〜中規模 → どちらでもOK
   - 大規模な分析 → DuckDB

3. **アプリケーションの性質**
   - トランザクション重視 → libSQL
   - 分析・BI重視 → DuckDB
   - RAGシステム → DuckDB

4. **迷ったら**
   - プロトタイプで両方試してみる
   - このリポジトリのベンチマークを実行

## 参考リンク

- [libSQL GitHub](https://github.com/tursodatabase/libsql)
- [libSQL Client (npm)](https://www.npmjs.com/package/@libsql/client)
- [DuckDB Official Site](https://duckdb.org/)
- [DuckDB for Node.js](https://duckdb.org/docs/api/nodejs/overview)

## ライセンス

このリサーチコードはMITライセンスです。自由に使用・改変してください。
