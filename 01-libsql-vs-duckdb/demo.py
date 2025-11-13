#!/usr/bin/env python3
"""
libSQL vs DuckDB 比較デモ
両DBの基本機能と性能を比較するCLIアプリケーション
"""

import sqlite3
import duckdb
import time
import sys
from pathlib import Path


class DatabaseDemo:
    def __init__(self):
        self.libsql_path = "demo_libsql.db"
        self.duckdb_path = "demo_duckdb.duckdb"

    def cleanup(self):
        """既存のDBファイルをクリーンアップ"""
        for path in [self.libsql_path, self.duckdb_path]:
            p = Path(path)
            if p.exists():
                p.unlink()

    def demo_libsql(self):
        """libSQL (SQLite互換) のデモ"""
        print("\n" + "="*60)
        print("libSQL デモ")
        print("="*60)

        # 接続
        conn = sqlite3.connect(self.libsql_path)
        cursor = conn.cursor()

        # テーブル作成
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                age INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # データ挿入
        print("\n[1] データ挿入テスト")
        start = time.time()
        users = [
            ("Alice", "alice@example.com", 25),
            ("Bob", "bob@example.com", 30),
            ("Charlie", "charlie@example.com", 35),
            ("Diana", "diana@example.com", 28),
            ("Eve", "eve@example.com", 32),
        ]
        cursor.executemany(
            "INSERT INTO users (name, email, age) VALUES (?, ?, ?)",
            users
        )
        conn.commit()
        insert_time = time.time() - start
        print(f"  ✓ 5件のレコードを挿入: {insert_time*1000:.2f}ms")

        # SELECT クエリ
        print("\n[2] SELECT クエリテスト")
        start = time.time()
        cursor.execute("SELECT * FROM users WHERE age >= 30")
        results = cursor.fetchall()
        select_time = time.time() - start
        print(f"  ✓ 条件付きSELECT: {select_time*1000:.2f}ms")
        print(f"  結果: {len(results)}件")
        for row in results:
            print(f"    - {row[1]} ({row[3]}歳)")

        # 集計クエリ
        print("\n[3] 集計クエリテスト")
        start = time.time()
        cursor.execute("""
            SELECT
                COUNT(*) as total,
                AVG(age) as avg_age,
                MIN(age) as min_age,
                MAX(age) as max_age
            FROM users
        """)
        stats = cursor.fetchone()
        agg_time = time.time() - start
        print(f"  ✓ 集計クエリ: {agg_time*1000:.2f}ms")
        print(f"    総数: {stats[0]}, 平均年齢: {stats[1]:.1f}, 最小: {stats[2]}, 最大: {stats[3]}")

        # トランザクション
        print("\n[4] トランザクションテスト (libSQLの強み)")
        start = time.time()
        try:
            cursor.execute("BEGIN TRANSACTION")
            cursor.execute("UPDATE users SET age = age + 1 WHERE name = 'Alice'")
            cursor.execute("INSERT INTO users (name, email, age) VALUES (?, ?, ?)",
                         ("Frank", "frank@example.com", 40))
            cursor.execute("COMMIT")
            conn.commit()
            trans_time = time.time() - start
            print(f"  ✓ トランザクション成功: {trans_time*1000:.2f}ms")
        except Exception as e:
            cursor.execute("ROLLBACK")
            print(f"  ✗ トランザクション失敗: {e}")

        conn.close()

        return {
            "insert": insert_time,
            "select": select_time,
            "aggregate": agg_time,
            "transaction": trans_time
        }

    def demo_duckdb(self):
        """DuckDB のデモ"""
        print("\n" + "="*60)
        print("DuckDB デモ")
        print("="*60)

        # 接続
        conn = duckdb.connect(self.duckdb_path)

        # テーブル作成
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name VARCHAR NOT NULL,
                email VARCHAR NOT NULL,
                age INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # シーケンス作成（AUTO_INCREMENT相当）
        conn.execute("CREATE SEQUENCE IF NOT EXISTS seq_users_id START 1")

        # データ挿入
        print("\n[1] データ挿入テスト")
        start = time.time()
        users = [
            (1, "Alice", "alice@example.com", 25),
            (2, "Bob", "bob@example.com", 30),
            (3, "Charlie", "charlie@example.com", 35),
            (4, "Diana", "diana@example.com", 28),
            (5, "Eve", "eve@example.com", 32),
        ]
        conn.executemany(
            "INSERT INTO users (id, name, email, age) VALUES (?, ?, ?, ?)",
            users
        )
        insert_time = time.time() - start
        print(f"  ✓ 5件のレコードを挿入: {insert_time*1000:.2f}ms")

        # SELECT クエリ
        print("\n[2] SELECT クエリテスト")
        start = time.time()
        results = conn.execute("SELECT * FROM users WHERE age >= 30").fetchall()
        select_time = time.time() - start
        print(f"  ✓ 条件付きSELECT: {select_time*1000:.2f}ms")
        print(f"  結果: {len(results)}件")
        for row in results:
            print(f"    - {row[1]} ({row[3]}歳)")

        # 集計クエリ（DuckDBの強み）
        print("\n[3] 集計クエリテスト (DuckDBの強み)")
        start = time.time()
        stats = conn.execute("""
            SELECT
                COUNT(*) as total,
                AVG(age) as avg_age,
                MIN(age) as min_age,
                MAX(age) as max_age
            FROM users
        """).fetchone()
        agg_time = time.time() - start
        print(f"  ✓ 集計クエリ: {agg_time*1000:.2f}ms")
        print(f"    総数: {stats[0]}, 平均年齢: {stats[1]:.1f}, 最小: {stats[2]}, 最大: {stats[3]}")

        # 高度な分析クエリ
        print("\n[4] 高度な分析クエリテスト (DuckDBの強み)")
        start = time.time()
        result = conn.execute("""
            SELECT
                CASE
                    WHEN age < 30 THEN '20代'
                    WHEN age < 40 THEN '30代'
                    ELSE '40代以上'
                END as age_group,
                COUNT(*) as count,
                AVG(age) as avg_age
            FROM users
            GROUP BY age_group
            ORDER BY age_group
        """).fetchall()
        analytics_time = time.time() - start
        print(f"  ✓ グループ化と集計: {analytics_time*1000:.2f}ms")
        for row in result:
            print(f"    - {row[0]}: {row[1]}人 (平均{row[2]:.1f}歳)")

        conn.close()

        return {
            "insert": insert_time,
            "select": select_time,
            "aggregate": agg_time,
            "analytics": analytics_time
        }

    def print_summary(self, libsql_times, duckdb_times):
        """結果のサマリーを表示"""
        print("\n" + "="*60)
        print("パフォーマンスサマリー")
        print("="*60)
        print("\n比較項目                libSQL          DuckDB          優位")
        print("-" * 60)

        # 挿入性能
        libsql_insert = libsql_times['insert'] * 1000
        duckdb_insert = duckdb_times['insert'] * 1000
        winner = "libSQL" if libsql_insert < duckdb_insert else "DuckDB"
        print(f"データ挿入 (5件)    {libsql_insert:8.2f}ms    {duckdb_insert:8.2f}ms    {winner}")

        # SELECT性能
        libsql_select = libsql_times['select'] * 1000
        duckdb_select = duckdb_times['select'] * 1000
        winner = "libSQL" if libsql_select < duckdb_select else "DuckDB"
        print(f"SELECT クエリ       {libsql_select:8.2f}ms    {duckdb_select:8.2f}ms    {winner}")

        # 集計性能
        libsql_agg = libsql_times['aggregate'] * 1000
        duckdb_agg = duckdb_times['aggregate'] * 1000
        winner = "libSQL" if libsql_agg < duckdb_agg else "DuckDB"
        print(f"集計クエリ         {libsql_agg:8.2f}ms    {duckdb_agg:8.2f}ms    {winner}")

        print("\n" + "="*60)
        print("特徴と使い分け")
        print("="*60)
        print("\n【libSQL】")
        print("  ✓ SQLite互換で軽量")
        print("  ✓ トランザクション処理に最適 (OLTP)")
        print("  ✓ 組み込みアプリケーション向け")
        print("  ✓ レプリケーション機能")
        print("  ✓ 低レイテンシーが必要なアプリ")
        print("\n【DuckDB】")
        print("  ✓ 分析クエリに最適 (OLAP)")
        print("  ✓ カラムナストレージで集計が高速")
        print("  ✓ CSV/Parquet等の直接読み込み")
        print("  ✓ 大量データの分析処理")
        print("  ✓ データサイエンス・BIツールとの連携")


def main():
    print("="*60)
    print("libSQL vs DuckDB 比較デモ")
    print("="*60)

    demo = DatabaseDemo()

    # クリーンアップ
    print("\n既存のDBファイルをクリーンアップ中...")
    demo.cleanup()

    try:
        # libSQL デモ実行
        libsql_times = demo.demo_libsql()

        # DuckDB デモ実行
        duckdb_times = demo.demo_duckdb()

        # サマリー表示
        demo.print_summary(libsql_times, duckdb_times)

    except Exception as e:
        print(f"\nエラーが発生しました: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
