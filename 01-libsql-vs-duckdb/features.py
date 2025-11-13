#!/usr/bin/env python3
"""
libSQL vs DuckDB 機能比較デモ
各DBの特徴的な機能を実際に動かして比較
"""

import sqlite3
import duckdb
import csv
from pathlib import Path


def create_sample_csv():
    """サンプルCSVファイルを作成"""
    csv_path = "sample_sales.csv"
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'product', 'category', 'price', 'quantity', 'region'])
        writer.writerows([
            [1, 'Laptop', 'Electronics', 1200, 5, 'North'],
            [2, 'Mouse', 'Electronics', 25, 50, 'South'],
            [3, 'Keyboard', 'Electronics', 75, 30, 'East'],
            [4, 'Monitor', 'Electronics', 300, 15, 'West'],
            [5, 'Desk', 'Furniture', 450, 8, 'North'],
            [6, 'Chair', 'Furniture', 200, 12, 'South'],
            [7, 'Lamp', 'Furniture', 50, 25, 'East'],
            [8, 'Notebook', 'Stationery', 5, 200, 'West'],
            [9, 'Pen', 'Stationery', 1, 500, 'North'],
            [10, 'Pencil', 'Stationery', 0.5, 800, 'South'],
        ])
    return csv_path


def demo_libsql_features():
    """libSQL (SQLite) の特徴的な機能デモ"""
    print("\n" + "="*60)
    print("libSQL 特徴的機能デモ")
    print("="*60)

    db_path = "features_libsql.db"
    Path(db_path).unlink(missing_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. トランザクション処理（ACIDプロパティ）
    print("\n[1] トランザクション処理 (libSQLの強み)")
    print("     ACID特性による信頼性の高いデータ操作")

    cursor.execute("""
        CREATE TABLE accounts (
            id INTEGER PRIMARY KEY,
            name TEXT,
            balance DECIMAL(10, 2)
        )
    """)

    cursor.execute("INSERT INTO accounts VALUES (1, 'Alice', 1000.00)")
    cursor.execute("INSERT INTO accounts VALUES (2, 'Bob', 500.00)")
    conn.commit()

    print("\n  初期残高:")
    cursor.execute("SELECT * FROM accounts")
    for row in cursor.fetchall():
        print(f"    {row[1]}: ${row[2]:.2f}")

    # トランザクションテスト
    try:
        cursor.execute("BEGIN TRANSACTION")
        cursor.execute("UPDATE accounts SET balance = balance - 200 WHERE id = 1")
        cursor.execute("UPDATE accounts SET balance = balance + 200 WHERE id = 2")

        # 残高チェック
        cursor.execute("SELECT balance FROM accounts WHERE id = 1")
        if cursor.fetchone()[0] < 0:
            raise Exception("残高不足エラー")

        cursor.execute("COMMIT")
        conn.commit()
        print("\n  ✓ トランザクション成功 (AliceからBobへ$200送金)")
    except Exception as e:
        cursor.execute("ROLLBACK")
        print(f"\n  ✗ トランザクション失敗: {e}")

    print("\n  最終残高:")
    cursor.execute("SELECT * FROM accounts")
    for row in cursor.fetchall():
        print(f"    {row[1]}: ${row[2]:.2f}")

    # 2. 軽量・組み込み可能
    print("\n[2] 軽量・組み込み可能 (libSQLの強み)")
    print("     サーバー不要、単一ファイルで完結")
    db_size = Path(db_path).stat().st_size
    print(f"     データベースファイルサイズ: {db_size:,} bytes")

    # 3. SQLite互換の豊富な機能
    print("\n[3] SQLite互換の豊富な機能")

    # JSON サポート（SQLite 3.38+）
    cursor.execute("""
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            name TEXT,
            metadata TEXT
        )
    """)
    cursor.execute("""
        INSERT INTO products VALUES
        (1, 'Laptop', '{"brand": "Dell", "warranty": 3}'),
        (2, 'Phone', '{"brand": "Apple", "warranty": 1}')
    """)
    conn.commit()

    print("     JSON データのクエリ:")
    try:
        # json_extract関数の使用
        cursor.execute("""
            SELECT name, json_extract(metadata, '$.brand') as brand
            FROM products
        """)
        for row in cursor.fetchall():
            print(f"       {row[0]}: {row[1]}")
    except Exception as e:
        print(f"       (JSONサポートはSQLiteバージョンに依存: {e})")

    # 4. 同時実行制御
    print("\n[4] 同時実行制御")
    print("     WAL (Write-Ahead Logging) モードで読み取りと書き込みの同時実行が可能")
    cursor.execute("PRAGMA journal_mode=WAL")
    result = cursor.fetchone()
    print(f"     ジャーナルモード: {result[0]}")

    conn.close()

    print("\n" + "-"*60)
    print("libSQL まとめ:")
    print("  ✓ ACID準拠のトランザクション処理")
    print("  ✓ 軽量で組み込み可能 (サーバー不要)")
    print("  ✓ SQLite互換で豊富な機能")
    print("  ✓ WALモードで同時実行サポート")
    print("  ✓ レプリケーション機能 (Turso使用時)")


def demo_duckdb_features():
    """DuckDB の特徴的な機能デモ"""
    print("\n" + "="*60)
    print("DuckDB 特徴的機能デモ")
    print("="*60)

    db_path = "features_duckdb.duckdb"
    Path(db_path).unlink(missing_ok=True)

    conn = duckdb.connect(db_path)

    # 1. CSV/Parquetの直接クエリ（DuckDBの強力な機能）
    print("\n[1] CSV/ファイルの直接クエリ (DuckDBの強み)")
    print("     データベースにインポートせずに直接クエリ可能")

    csv_path = create_sample_csv()
    print(f"\n  CSVファイル '{csv_path}' を直接クエリ:")

    result = conn.execute(f"""
        SELECT category, SUM(price * quantity) as total_revenue
        FROM read_csv_auto('{csv_path}')
        GROUP BY category
        ORDER BY total_revenue DESC
    """).fetchall()

    print("\n  カテゴリ別売上:")
    for row in result:
        print(f"    {row[0]}: ${row[1]:,.2f}")

    # 2. ウィンドウ関数（高度な分析機能）
    print("\n[2] ウィンドウ関数 (DuckDBの強み)")
    print("     順位付け、移動平均などの高度な分析")

    # データをテーブルに読み込み
    conn.execute(f"""
        CREATE TABLE sales AS
        SELECT * FROM read_csv_auto('{csv_path}')
    """)

    result = conn.execute("""
        SELECT
            product,
            category,
            price * quantity as revenue,
            RANK() OVER (PARTITION BY category ORDER BY price * quantity DESC) as rank_in_category,
            SUM(price * quantity) OVER (PARTITION BY category) as category_total
        FROM sales
        ORDER BY category, rank_in_category
    """).fetchall()

    print("\n  カテゴリ内ランキング:")
    current_category = None
    for row in result:
        if row[1] != current_category:
            current_category = row[1]
            print(f"\n    [{current_category}] (合計: ${row[4]:,.2f})")
        print(f"      {row[3]}位: {row[0]} - ${row[2]:,.2f}")

    # 3. カラムナストレージによる高速集計
    print("\n[3] カラムナストレージ (DuckDBの強み)")
    print("     列指向ストレージで集計クエリが高速")

    result = conn.execute("""
        SELECT
            region,
            COUNT(*) as products,
            SUM(quantity) as total_quantity,
            AVG(price) as avg_price
        FROM sales
        GROUP BY region
        ORDER BY total_quantity DESC
    """).fetchall()

    print("\n  地域別統計:")
    for row in result:
        print(f"    {row[0]}: {row[1]}商品, 総数量={row[2]}, 平均価格=${row[3]:.2f}")

    # 4. PIVOT機能
    print("\n[4] PIVOT機能 (DuckDBの便利機能)")
    print("     データの行列変換が簡単")

    result = conn.execute("""
        PIVOT sales
        ON region
        USING SUM(quantity)
        GROUP BY category
    """).fetchall()

    print("\n  カテゴリ×地域のクロス集計 (数量):")
    # ヘッダー
    headers = ["Category", "East", "North", "South", "West"]
    print(f"    {headers[0]:<15} {headers[1]:>8} {headers[2]:>8} {headers[3]:>8} {headers[4]:>8}")
    print("    " + "-" * 55)
    for row in result:
        print(f"    {row[0]:<15} {row[1] or 0:>8} {row[2] or 0:>8} {row[3] or 0:>8} {row[4] or 0:>8}")

    # 5. 複数ファイルフォーマットのサポート
    print("\n[5] 複数ファイルフォーマットのサポート")
    print("     CSV, Parquet, JSON, Excel等に対応")
    print("     クラウドストレージ (S3, Azure, GCS) からの直接読み込み可能")

    # 6. エクスポート機能
    print("\n[6] データエクスポート機能")
    conn.execute("""
        COPY (SELECT * FROM sales WHERE category = 'Electronics')
        TO 'electronics_export.csv' (HEADER, DELIMITER ',')
    """)
    print("     ✓ Electronicsカテゴリを 'electronics_export.csv' にエクスポート")

    # Parquet形式でもエクスポート可能
    conn.execute("""
        COPY (SELECT * FROM sales)
        TO 'sales_export.parquet' (FORMAT PARQUET)
    """)
    print("     ✓ 全データを 'sales_export.parquet' にエクスポート")

    conn.close()

    print("\n" + "-"*60)
    print("DuckDB まとめ:")
    print("  ✓ CSV/Parquet等を直接クエリ可能 (インポート不要)")
    print("  ✓ ウィンドウ関数などの高度な分析機能")
    print("  ✓ カラムナストレージで集計クエリが高速")
    print("  ✓ PIVOT等の便利な分析機能")
    print("  ✓ 多様なファイル形式のサポート")
    print("  ✓ クラウドストレージとの連携")


def print_summary():
    """総合的な比較サマリー"""
    print("\n" + "="*60)
    print("総合比較: いつ何を使うべきか")
    print("="*60)

    print("\n【libSQL を使うべきケース】")
    print("  ✓ トランザクション処理が必要なアプリケーション")
    print("  ✓ モバイルアプリや組み込みシステム")
    print("  ✓ マイクロサービスのローカルDB")
    print("  ✓ リアルタイム性が重要なアプリ")
    print("  ✓ SQLite互換性が必要な場合")
    print("\n  例: Webアプリのユーザーデータ管理、IoTデバイス、")
    print("      モバイルアプリのオフラインストレージ")

    print("\n【DuckDB を使うべきケース】")
    print("  ✓ データ分析・BI用途")
    print("  ✓ 大量データの集計・レポート生成")
    print("  ✓ データサイエンスのワークフロー")
    print("  ✓ ETL処理やデータ変換")
    print("  ✓ CSV/Parquetファイルの分析")
    print("\n  例: データ分析、機械学習の前処理、ログ分析、")
    print("      BIダッシュボードのバックエンド")

    print("\n【両方を組み合わせる】")
    print("  - libSQL: トランザクション処理用")
    print("  - DuckDB: 分析・レポート生成用")
    print("  - libSQLからDuckDBにデータをエクスポートして分析")


def main():
    print("="*60)
    print("libSQL vs DuckDB 機能比較デモ")
    print("="*60)

    try:
        # libSQL 機能デモ
        demo_libsql_features()

        # DuckDB 機能デモ
        demo_duckdb_features()

        # 総合サマリー
        print_summary()

        # クリーンアップ
        print("\n\nクリーンアップ中...")
        for path in [
            "features_libsql.db",
            "features_duckdb.duckdb",
            "features_duckdb.duckdb.wal",
            "sample_sales.csv",
            "electronics_export.csv",
            "sales_export.parquet"
        ]:
            Path(path).unlink(missing_ok=True)
        print("完了!")

    except Exception as e:
        print(f"\nエラーが発生しました: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
