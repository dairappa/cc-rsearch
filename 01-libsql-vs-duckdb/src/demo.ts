#!/usr/bin/env node
/**
 * libSQL vs DuckDB 比較デモ
 * 両DBの基本機能と性能を比較するCLIアプリケーション
 */

import { createClient } from '@libsql/client';
import duckdb from 'duckdb';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

interface TimingResults {
  insert: number;
  select: number;
  aggregate: number;
  transaction?: number;
  analytics?: number;
}

class DatabaseDemo {
  private libsqlPath = 'demo_libsql.db';
  private duckdbPath = 'demo_duckdb.duckdb';

  async cleanup(): Promise<void> {
    const paths = [this.libsqlPath, this.duckdbPath];
    for (const path of paths) {
      if (existsSync(path)) {
        await unlink(path);
      }
    }
  }

  async demoLibSQL(): Promise<TimingResults> {
    console.log('\n' + '='.repeat(60));
    console.log('libSQL デモ');
    console.log('='.repeat(60));

    // 接続
    const client = createClient({
      url: `file:${this.libsqlPath}`,
    });

    // テーブル作成
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        age INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // データ挿入
    console.log('\n[1] データ挿入テスト');
    const users = [
      { name: 'Alice', email: 'alice@example.com', age: 25 },
      { name: 'Bob', email: 'bob@example.com', age: 30 },
      { name: 'Charlie', email: 'charlie@example.com', age: 35 },
      { name: 'Diana', email: 'diana@example.com', age: 28 },
      { name: 'Eve', email: 'eve@example.com', age: 32 },
    ];

    const insertStart = performance.now();
    for (const user of users) {
      await client.execute({
        sql: 'INSERT INTO users (name, email, age) VALUES (?, ?, ?)',
        args: [user.name, user.email, user.age],
      });
    }
    const insertTime = (performance.now() - insertStart) / 1000;
    console.log(`  ✓ 5件のレコードを挿入: ${(insertTime * 1000).toFixed(2)}ms`);

    // SELECT クエリ
    console.log('\n[2] SELECT クエリテスト');
    const selectStart = performance.now();
    const result = await client.execute('SELECT * FROM users WHERE age >= 30');
    const selectTime = (performance.now() - selectStart) / 1000;
    console.log(`  ✓ 条件付きSELECT: ${(selectTime * 1000).toFixed(2)}ms`);
    console.log(`  結果: ${result.rows.length}件`);
    for (const row of result.rows) {
      console.log(`    - ${row.name} (${row.age}歳)`);
    }

    // 集計クエリ
    console.log('\n[3] 集計クエリテスト');
    const aggStart = performance.now();
    const stats = await client.execute(`
      SELECT
        COUNT(*) as total,
        AVG(age) as avg_age,
        MIN(age) as min_age,
        MAX(age) as max_age
      FROM users
    `);
    const aggTime = (performance.now() - aggStart) / 1000;
    const row = stats.rows[0];
    console.log(`  ✓ 集計クエリ: ${(aggTime * 1000).toFixed(2)}ms`);
    console.log(`    総数: ${row.total}, 平均年齢: ${Number(row.avg_age).toFixed(1)}, 最小: ${row.min_age}, 最大: ${row.max_age}`);

    // トランザクション
    console.log('\n[4] トランザクションテスト (libSQLの強み)');
    const transStart = performance.now();
    try {
      await client.execute('BEGIN TRANSACTION');
      await client.execute("UPDATE users SET age = age + 1 WHERE name = 'Alice'");
      await client.execute({
        sql: 'INSERT INTO users (name, email, age) VALUES (?, ?, ?)',
        args: ['Frank', 'frank@example.com', 40],
      });
      await client.execute('COMMIT');
      const transTime = (performance.now() - transStart) / 1000;
      console.log(`  ✓ トランザクション成功: ${(transTime * 1000).toFixed(2)}ms`);

      return {
        insert: insertTime,
        select: selectTime,
        aggregate: aggTime,
        transaction: transTime,
      };
    } catch (error) {
      await client.execute('ROLLBACK');
      console.log(`  ✗ トランザクション失敗: ${error}`);
      return {
        insert: insertTime,
        select: selectTime,
        aggregate: aggTime,
        transaction: 0,
      };
    }
  }

  async demoDuckDB(): Promise<TimingResults> {
    console.log('\n' + '='.repeat(60));
    console.log('DuckDB デモ');
    console.log('='.repeat(60));

    return new Promise((resolve, reject) => {
      const db = new duckdb.Database(this.duckdbPath);
      const conn = db.connect();

      const timings: TimingResults = {
        insert: 0,
        select: 0,
        aggregate: 0,
        analytics: 0,
      };

      // テーブル作成
      conn.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY,
          name VARCHAR NOT NULL,
          email VARCHAR NOT NULL,
          age INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, async (err) => {
        if (err) {
          reject(err);
          return;
        }

        // データ挿入
        console.log('\n[1] データ挿入テスト');
        const users = [
          [1, 'Alice', 'alice@example.com', 25],
          [2, 'Bob', 'bob@example.com', 30],
          [3, 'Charlie', 'charlie@example.com', 35],
          [4, 'Diana', 'diana@example.com', 28],
          [5, 'Eve', 'eve@example.com', 32],
        ];

        const insertStart = performance.now();
        let insertCount = 0;
        for (const user of users) {
          conn.run(
            'INSERT INTO users (id, name, email, age) VALUES (?, ?, ?, ?)',
            ...user,
            (err) => {
              if (err) reject(err);
              insertCount++;
              if (insertCount === users.length) {
                timings.insert = (performance.now() - insertStart) / 1000;
                console.log(`  ✓ 5件のレコードを挿入: ${(timings.insert * 1000).toFixed(2)}ms`);

                // SELECT クエリ
                console.log('\n[2] SELECT クエリテスト');
                const selectStart = performance.now();
                conn.all('SELECT * FROM users WHERE age >= 30', (err, rows) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  timings.select = (performance.now() - selectStart) / 1000;
                  console.log(`  ✓ 条件付きSELECT: ${(timings.select * 1000).toFixed(2)}ms`);
                  console.log(`  結果: ${rows.length}件`);
                  for (const row of rows) {
                    console.log(`    - ${row.name} (${row.age}歳)`);
                  }

                  // 集計クエリ
                  console.log('\n[3] 集計クエリテスト (DuckDBの強み)');
                  const aggStart = performance.now();
                  conn.all(`
                    SELECT
                      COUNT(*) as total,
                      AVG(age) as avg_age,
                      MIN(age) as min_age,
                      MAX(age) as max_age
                    FROM users
                  `, (err, rows) => {
                    if (err) {
                      reject(err);
                      return;
                    }
                    timings.aggregate = (performance.now() - aggStart) / 1000;
                    const row = rows[0];
                    console.log(`  ✓ 集計クエリ: ${(timings.aggregate * 1000).toFixed(2)}ms`);
                    console.log(`    総数: ${row.total}, 平均年齢: ${Number(row.avg_age).toFixed(1)}, 最小: ${row.min_age}, 最大: ${row.max_age}`);

                    // 高度な分析クエリ
                    console.log('\n[4] 高度な分析クエリテスト (DuckDBの強み)');
                    const analyticsStart = performance.now();
                    conn.all(`
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
                    `, (err, rows) => {
                      if (err) {
                        reject(err);
                        return;
                      }
                      timings.analytics = (performance.now() - analyticsStart) / 1000;
                      console.log(`  ✓ グループ化と集計: ${(timings.analytics * 1000).toFixed(2)}ms`);
                      for (const row of rows) {
                        console.log(`    - ${row.age_group}: ${row.count}人 (平均${Number(row.avg_age).toFixed(1)}歳)`);
                      }

                      db.close();
                      resolve(timings);
                    });
                  });
                });
              }
            }
          );
        }
      });
    });
  }

  printSummary(libsqlTimes: TimingResults, duckdbTimes: TimingResults): void {
    console.log('\n' + '='.repeat(60));
    console.log('パフォーマンスサマリー');
    console.log('='.repeat(60));
    console.log('\n比較項目                libSQL          DuckDB          優位');
    console.log('-'.repeat(60));

    // 挿入性能
    const libsqlInsert = libsqlTimes.insert * 1000;
    const duckdbInsert = duckdbTimes.insert * 1000;
    const insertWinner = libsqlInsert < duckdbInsert ? 'libSQL' : 'DuckDB';
    console.log(`データ挿入 (5件)    ${libsqlInsert.toFixed(2).padStart(8)}ms    ${duckdbInsert.toFixed(2).padStart(8)}ms    ${insertWinner}`);

    // SELECT性能
    const libsqlSelect = libsqlTimes.select * 1000;
    const duckdbSelect = duckdbTimes.select * 1000;
    const selectWinner = libsqlSelect < duckdbSelect ? 'libSQL' : 'DuckDB';
    console.log(`SELECT クエリ       ${libsqlSelect.toFixed(2).padStart(8)}ms    ${duckdbSelect.toFixed(2).padStart(8)}ms    ${selectWinner}`);

    // 集計性能
    const libsqlAgg = libsqlTimes.aggregate * 1000;
    const duckdbAgg = duckdbTimes.aggregate * 1000;
    const aggWinner = libsqlAgg < duckdbAgg ? 'libSQL' : 'DuckDB';
    console.log(`集計クエリ         ${libsqlAgg.toFixed(2).padStart(8)}ms    ${duckdbAgg.toFixed(2).padStart(8)}ms    ${aggWinner}`);

    console.log('\n' + '='.repeat(60));
    console.log('特徴と使い分け');
    console.log('='.repeat(60));
    console.log('\n【libSQL】');
    console.log('  ✓ SQLite互換で軽量');
    console.log('  ✓ トランザクション処理に最適 (OLTP)');
    console.log('  ✓ 組み込みアプリケーション向け');
    console.log('  ✓ レプリケーション機能');
    console.log('  ✓ 低レイテンシーが必要なアプリ');
    console.log('\n【DuckDB】');
    console.log('  ✓ 分析クエリに最適 (OLAP)');
    console.log('  ✓ カラムナストレージで集計が高速');
    console.log('  ✓ CSV/Parquet等の直接読み込み');
    console.log('  ✓ 大量データの分析処理');
    console.log('  ✓ データサイエンス・BIツールとの連携');
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('libSQL vs DuckDB 比較デモ');
  console.log('='.repeat(60));

  const demo = new DatabaseDemo();

  // クリーンアップ
  console.log('\n既存のDBファイルをクリーンアップ中...');
  await demo.cleanup();

  try {
    // libSQL デモ実行
    const libsqlTimes = await demo.demoLibSQL();

    // DuckDB デモ実行
    const duckdbTimes = await demo.demoDuckDB();

    // サマリー表示
    demo.printSummary(libsqlTimes, duckdbTimes);
  } catch (error) {
    console.error('\nエラーが発生しました:', error);
    process.exit(1);
  }
}

main();
