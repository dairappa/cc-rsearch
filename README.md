# cc-rsearch

技術リサーチ用のリポジトリです。各ディレクトリに異なる技術調査プロジェクトを配置しています。

## リサーチプロジェクト一覧

### 01-libsql-vs-duckdb

libSQLとDuckDBの機能・性能比較リサーチ

**目的:** 両データベースの特徴、使い所、性能の違いを明確にする

**内容:**
- 基本機能デモ
- パフォーマンスベンチマーク
- 機能比較
- 使い分けガイド

**詳細:** [01-libsql-vs-duckdb/README.md](./01-libsql-vs-duckdb/README.md)

## ディレクトリ構造

```
cc-rsearch/
├── README.md                    # このファイル
└── 01-libsql-vs-duckdb/        # libSQL vs DuckDB 比較
    ├── README.md               # 詳細ドキュメント
    ├── requirements.txt        # Python依存関係
    ├── demo.py                 # 基本デモ
    ├── benchmark.py            # パフォーマンステスト
    ├── features.py             # 機能比較デモ
    └── .gitignore             # Git除外設定
```

## 使い方

各リサーチディレクトリに移動して、そこにあるREADMEの指示に従ってください。

例:
```bash
cd 01-libsql-vs-duckdb
pip install -r requirements.txt
python demo.py
```

## 今後の追加予定

このリポジトリには今後、以下のような技術リサーチを追加していく予定です:

- 02-xxx-vs-yyy: 他のデータベース比較
- 03-framework-comparison: フレームワーク比較
- 04-performance-study: パフォーマンス調査
- etc...

## ライセンス

各リサーチプロジェクトは学習・研究目的で作成されています。
コードはMITライセンスで自由に使用できます。
