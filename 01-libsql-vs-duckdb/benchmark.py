#!/usr/bin/env python3
"""
libSQL vs DuckDB ベンチマーク
大量データでのパフォーマンス比較
"""

import sqlite3
import duckdb
import time
import random
import string
from pathlib import Path


def generate_random_data(n):
    """ランダムなテストデータを生成"""
    data = []
    for i in range(n):
        name = ''.join(random.choices(string.ascii_letters, k=10))
        email = f"{name.lower()}@example.com"
        age = random.randint(18, 80)
        salary = random.randint(30000, 150000)
        department = random.choice(['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'])
        data.append((i + 1, name, email, age, salary, department))
    return data


def benchmark_libsql(data_size):
    """libSQL (SQLite) のベンチマーク"""
    print(f"\n{'='*60}")
    print(f"libSQL ベンチマーク (データサイズ: {data_size:,}件)")
    print('='*60)

    db_path = "benchmark_libsql.db"
    Path(db_path).unlink(missing_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # テーブル作成
    cursor.execute("""
        CREATE TABLE employees (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            age INTEGER,
            salary INTEGER,
            department TEXT
        )
    """)

    # インデックス作成
    cursor.execute("CREATE INDEX idx_department ON employees(department)")
    cursor.execute("CREATE INDEX idx_age ON employees(age)")

    # データ挿入（バッチ処理）
    print("\n[1] データ挿入テスト")
    data = generate_random_data(data_size)
    start = time.time()
    cursor.executemany(
        "INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?)",
        data
    )
    conn.commit()
    insert_time = time.time() - start
    print(f"  ✓ {data_size:,}件の挿入: {insert_time:.3f}秒 ({data_size/insert_time:.0f}件/秒)")

    # 単純なSELECT
    print("\n[2] 単純なSELECTクエリ")
    start = time.time()
    cursor.execute("SELECT * FROM employees WHERE age > 50 LIMIT 100")
    results = cursor.fetchall()
    select_time = time.time() - start
    print(f"  ✓ 条件付きSELECT: {select_time*1000:.2f}ms ({len(results)}件)")

    # 集計クエリ
    print("\n[3] 集計クエリ")
    start = time.time()
    cursor.execute("""
        SELECT department, COUNT(*) as count, AVG(salary) as avg_salary
        FROM employees
        GROUP BY department
        ORDER BY avg_salary DESC
    """)
    results = cursor.fetchall()
    agg_time = time.time() - start
    print(f"  ✓ GROUP BY集計: {agg_time*1000:.2f}ms")
    for row in results[:3]:
        print(f"    - {row[0]}: {row[1]}人, 平均年収 ${row[2]:,.0f}")

    # JOIN相当のクエリ（自己結合）
    print("\n[4] 複雑な集計クエリ")
    start = time.time()
    cursor.execute("""
        SELECT
            department,
            AVG(age) as avg_age,
            AVG(salary) as avg_salary,
            COUNT(*) as count
        FROM employees
        WHERE salary > 50000
        GROUP BY department
        HAVING COUNT(*) > 10
        ORDER BY avg_salary DESC
    """)
    results = cursor.fetchall()
    complex_time = time.time() - start
    print(f"  ✓ 複雑な集計: {complex_time*1000:.2f}ms ({len(results)}部署)")

    # UPDATE
    print("\n[5] UPDATEクエリ (トランザクション)")
    start = time.time()
    cursor.execute("UPDATE employees SET salary = salary * 1.05 WHERE department = 'Engineering'")
    conn.commit()
    update_time = time.time() - start
    updated = cursor.rowcount
    print(f"  ✓ UPDATE: {update_time*1000:.2f}ms ({updated}件更新)")

    conn.close()

    return {
        "insert": insert_time,
        "select": select_time,
        "aggregate": agg_time,
        "complex": complex_time,
        "update": update_time
    }


def benchmark_duckdb(data_size):
    """DuckDB のベンチマーク"""
    print(f"\n{'='*60}")
    print(f"DuckDB ベンチマーク (データサイズ: {data_size:,}件)")
    print('='*60)

    db_path = "benchmark_duckdb.duckdb"
    Path(db_path).unlink(missing_ok=True)

    conn = duckdb.connect(db_path)

    # テーブル作成
    conn.execute("""
        CREATE TABLE employees (
            id INTEGER PRIMARY KEY,
            name VARCHAR NOT NULL,
            email VARCHAR NOT NULL,
            age INTEGER,
            salary INTEGER,
            department VARCHAR
        )
    """)

    # インデックス作成
    conn.execute("CREATE INDEX idx_department ON employees(department)")
    conn.execute("CREATE INDEX idx_age ON employees(age)")

    # データ挿入（バッチ処理）
    print("\n[1] データ挿入テスト")
    data = generate_random_data(data_size)
    start = time.time()
    conn.executemany(
        "INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?)",
        data
    )
    insert_time = time.time() - start
    print(f"  ✓ {data_size:,}件の挿入: {insert_time:.3f}秒 ({data_size/insert_time:.0f}件/秒)")

    # 単純なSELECT
    print("\n[2] 単純なSELECTクエリ")
    start = time.time()
    results = conn.execute("SELECT * FROM employees WHERE age > 50 LIMIT 100").fetchall()
    select_time = time.time() - start
    print(f"  ✓ 条件付きSELECT: {select_time*1000:.2f}ms ({len(results)}件)")

    # 集計クエリ（DuckDBの強み）
    print("\n[3] 集計クエリ (DuckDBの強み)")
    start = time.time()
    results = conn.execute("""
        SELECT department, COUNT(*) as count, AVG(salary) as avg_salary
        FROM employees
        GROUP BY department
        ORDER BY avg_salary DESC
    """).fetchall()
    agg_time = time.time() - start
    print(f"  ✓ GROUP BY集計: {agg_time*1000:.2f}ms")
    for row in results[:3]:
        print(f"    - {row[0]}: {row[1]}人, 平均年収 ${row[2]:,.0f}")

    # 複雑な集計クエリ
    print("\n[4] 複雑な集計クエリ (DuckDBの強み)")
    start = time.time()
    results = conn.execute("""
        SELECT
            department,
            AVG(age) as avg_age,
            AVG(salary) as avg_salary,
            COUNT(*) as count
        FROM employees
        WHERE salary > 50000
        GROUP BY department
        HAVING COUNT(*) > 10
        ORDER BY avg_salary DESC
    """).fetchall()
    complex_time = time.time() - start
    print(f"  ✓ 複雑な集計: {complex_time*1000:.2f}ms ({len(results)}部署)")

    # ウィンドウ関数（DuckDBの高度な機能）
    print("\n[5] ウィンドウ関数 (DuckDBの高度な機能)")
    start = time.time()
    results = conn.execute("""
        SELECT
            department,
            name,
            salary,
            AVG(salary) OVER (PARTITION BY department) as dept_avg_salary,
            RANK() OVER (PARTITION BY department ORDER BY salary DESC) as rank_in_dept
        FROM employees
        WHERE department IN ('Engineering', 'Sales')
        LIMIT 10
    """).fetchall()
    window_time = time.time() - start
    print(f"  ✓ ウィンドウ関数: {window_time*1000:.2f}ms")

    # UPDATE
    print("\n[6] UPDATEクエリ")
    start = time.time()
    conn.execute("UPDATE employees SET salary = salary * 1.05 WHERE department = 'Engineering'")
    update_time = time.time() - start
    print(f"  ✓ UPDATE: {update_time*1000:.2f}ms")

    conn.close()

    return {
        "insert": insert_time,
        "select": select_time,
        "aggregate": agg_time,
        "complex": complex_time,
        "window": window_time,
        "update": update_time
    }


def print_comparison(libsql_times, duckdb_times, data_size):
    """ベンチマーク結果の比較表示"""
    print(f"\n{'='*60}")
    print(f"ベンチマーク結果比較 (データサイズ: {data_size:,}件)")
    print('='*60)

    print(f"\n{'操作':<20} {'libSQL':>15} {'DuckDB':>15} {'高速':<10} {'差分'}")
    print('-' * 70)

    # 挿入
    libsql_insert = libsql_times['insert']
    duckdb_insert = duckdb_times['insert']
    faster = "libSQL" if libsql_insert < duckdb_insert else "DuckDB"
    ratio = max(libsql_insert, duckdb_insert) / min(libsql_insert, duckdb_insert)
    print(f"{'データ挿入':<20} {libsql_insert:>12.3f}秒 {duckdb_insert:>12.3f}秒 {faster:<10} {ratio:.2f}x")

    # SELECT
    libsql_select = libsql_times['select'] * 1000
    duckdb_select = duckdb_times['select'] * 1000
    faster = "libSQL" if libsql_select < duckdb_select else "DuckDB"
    ratio = max(libsql_select, duckdb_select) / min(libsql_select, duckdb_select)
    print(f"{'SELECT':<20} {libsql_select:>13.2f}ms {duckdb_select:>13.2f}ms {faster:<10} {ratio:.2f}x")

    # 集計
    libsql_agg = libsql_times['aggregate'] * 1000
    duckdb_agg = duckdb_times['aggregate'] * 1000
    faster = "libSQL" if libsql_agg < duckdb_agg else "DuckDB"
    ratio = max(libsql_agg, duckdb_agg) / min(libsql_agg, duckdb_agg)
    print(f"{'GROUP BY集計':<20} {libsql_agg:>13.2f}ms {duckdb_agg:>13.2f}ms {faster:<10} {ratio:.2f}x")

    # 複雑な集計
    libsql_complex = libsql_times['complex'] * 1000
    duckdb_complex = duckdb_times['complex'] * 1000
    faster = "libSQL" if libsql_complex < duckdb_complex else "DuckDB"
    ratio = max(libsql_complex, duckdb_complex) / min(libsql_complex, duckdb_complex)
    print(f"{'複雑な集計':<20} {libsql_complex:>13.2f}ms {duckdb_complex:>13.2f}ms {faster:<10} {ratio:.2f}x")

    # UPDATE
    libsql_update = libsql_times['update'] * 1000
    duckdb_update = duckdb_times['update'] * 1000
    faster = "libSQL" if libsql_update < duckdb_update else "DuckDB"
    ratio = max(libsql_update, duckdb_update) / min(libsql_update, duckdb_update)
    print(f"{'UPDATE':<20} {libsql_update:>13.2f}ms {duckdb_update:>13.2f}ms {faster:<10} {ratio:.2f}x")

    print(f"\n{'='*60}")
    print("結論")
    print('='*60)
    print("\n【libSQL】")
    print("  ✓ トランザクション処理 (OLTP) に最適")
    print("  ✓ 小〜中規模データでの高速な読み書き")
    print("  ✓ 行指向ストレージで個別レコード操作が得意")
    print("  ✓ 組み込みアプリケーションに最適")

    print("\n【DuckDB】")
    print("  ✓ 分析クエリ (OLAP) に最適")
    print("  ✓ 大量データの集計・グループ化が高速")
    print("  ✓ カラムナストレージによる効率的なスキャン")
    print("  ✓ ウィンドウ関数などの高度な分析機能")
    print("  ✓ データサイエンス・BI用途に最適")


def main():
    print("="*60)
    print("libSQL vs DuckDB パフォーマンスベンチマーク")
    print("="*60)

    # データサイズを選択
    print("\nベンチマークのデータサイズを選択してください:")
    print("  1. 小 (10,000件) - 高速")
    print("  2. 中 (50,000件) - 推奨")
    print("  3. 大 (100,000件) - 時間がかかります")

    try:
        choice = input("\n選択 (1-3, デフォルト=2): ").strip()
        if not choice:
            choice = "2"

        data_sizes = {"1": 10000, "2": 50000, "3": 100000}
        data_size = data_sizes.get(choice, 50000)

        print(f"\n{data_size:,}件のデータでベンチマークを開始します...")

        # ベンチマーク実行
        libsql_times = benchmark_libsql(data_size)
        duckdb_times = benchmark_duckdb(data_size)

        # 結果比較
        print_comparison(libsql_times, duckdb_times, data_size)

        # クリーンアップ
        print("\n\nクリーンアップ中...")
        Path("benchmark_libsql.db").unlink(missing_ok=True)
        Path("benchmark_duckdb.duckdb").unlink(missing_ok=True)
        Path("benchmark_duckdb.duckdb.wal").unlink(missing_ok=True)
        print("完了!")

    except KeyboardInterrupt:
        print("\n\nベンチマークが中断されました。")
        return 1
    except Exception as e:
        print(f"\nエラーが発生しました: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
