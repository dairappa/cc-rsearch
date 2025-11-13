#!/usr/bin/env node
/**
 * libSQL vs DuckDB 機能比較デモ
 * 各DBの特徴的な機能を実際に動かして比較
 */

import { createClient } from '@libsql/client';
import duckdb from 'duckdb';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';

async function createSampleCSV(): Promise<string> {
  const csvPath = 'sample_sales.csv';
  const csvContent = `id,product,category,price,quantity,region
1,Laptop,Electronics,1200,5,North
2,Mouse,Electronics,25,50,South
3,Keyboard,Electronics,75,30,East
4,Monitor,Electronics,300,15,West
5,Desk,Furniture,450,8,North
6,Chair,Furniture,200,12,South
7,Lamp,Furniture,50,25,East
8,Notebook,Stationery,5,200,West
9,Pen,Stationery,1,500,North
10,Pencil,Stationery,0.5,800,South`;

  await writeFile(csvPath, csvContent);
  return csvPath;
}

async function demoLibSQLFeatures(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('libSQL 特徴的機能デモ');
  console.log('='.repeat(60));

  const dbPath = 'features_libsql.db';
  if (existsSync(dbPath)) {
    await unlink(dbPath);
  }

  const client = createClient({ url: `file:${dbPath}` });

  // 1. トランザクション処理（ACIDプロパティ）
  console.log('\n[1] トランザクション処理 (libSQLの強み)');
  console.log('     ACID特性による信頼性の高いデータ操作');

  await client.execute(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY,
      name TEXT,
      balance DECIMAL(10, 2)
    )
  `);

  await client.execute({
    sql: 'INSERT INTO accounts VALUES (?, ?, ?)',
    args: [1, 'Alice', 1000.00],
  });
  await client.execute({
    sql: 'INSERT INTO accounts VALUES (?, ?, ?)',
    args: [2, 'Bob', 500.00],
  });

  console.log('\n  初期残高:');
  const initial = await client.execute('SELECT * FROM accounts');
  for (const row of initial.rows) {
    console.log(`    ${row.name}: $${Number(row.balance).toFixed(2)}`);
  }

  // トランザクションテスト
  try {
    await client.execute('BEGIN TRANSACTION');
    await client.execute('UPDATE accounts SET balance = balance - 200 WHERE id = 1');
    await client.execute('UPDATE accounts SET balance = balance + 200 WHERE id = 2');

    // 残高チェック
    const check = await client.execute('SELECT balance FROM accounts WHERE id = 1');
    if (Number(check.rows[0].balance) < 0) {
      throw new Error('残高不足エラー');
    }

    await client.execute('COMMIT');
    console.log('\n  ✓ トランザクション成功 (AliceからBobへ$200送金)');
  } catch (error) {
    await client.execute('ROLLBACK');
    console.log(`\n  ✗ トランザクション失敗: ${error}`);
  }

  console.log('\n  最終残高:');
  const final = await client.execute('SELECT * FROM accounts');
  for (const row of final.rows) {
    console.log(`    ${row.name}: $${Number(row.balance).toFixed(2)}`);
  }

  // 2. 軽量・組み込み可能
  console.log('\n[2] 軽量・組み込み可能 (libSQLの強み)');
  console.log('     サーバー不要、単一ファイルで完結');
  const fs = await import('fs');
  const stats = fs.statSync(dbPath);
  console.log(`     データベースファイルサイズ: ${stats.size.toLocaleString()} bytes`);

  // 3. JSON サポート
  console.log('\n[3] SQLite互換の豊富な機能');

  await client.execute(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      name TEXT,
      metadata TEXT
    )
  `);
  await client.execute({
    sql: "INSERT INTO products VALUES (?, ?, ?)",
    args: [1, 'Laptop', '{"brand": "Dell", "warranty": 3}'],
  });
  await client.execute({
    sql: "INSERT INTO products VALUES (?, ?, ?)",
    args: [2, 'Phone', '{"brand": "Apple", "warranty": 1}'],
  });

  console.log('     JSON データのクエリ:');
  try {
    const jsonResult = await client.execute(`
      SELECT name, json_extract(metadata, '$.brand') as brand
      FROM products
    `);
    for (const row of jsonResult.rows) {
      console.log(`       ${row.name}: ${row.brand}`);
    }
  } catch (error) {
    console.log(`       (JSONサポートはSQLiteバージョンに依存)`);
  }

  // 4. 同時実行制御
  console.log('\n[4] 同時実行制御');
  console.log('     WAL (Write-Ahead Logging) モードで読み取りと書き込みの同時実行が可能');
  const walResult = await client.execute('PRAGMA journal_mode=WAL');
  console.log(`     ジャーナルモード: ${walResult.rows[0]?.journal_mode || 'wal'}`);

  // クリーンアップ
  if (existsSync(dbPath)) {
    await unlink(dbPath);
  }

  console.log('\n' + '-'.repeat(60));
  console.log('libSQL まとめ:');
  console.log('  ✓ ACID準拠のトランザクション処理');
  console.log('  ✓ 軽量で組み込み可能 (サーバー不要)');
  console.log('  ✓ SQLite互換で豊富な機能');
  console.log('  ✓ WALモードで同時実行サポート');
  console.log('  ✓ レプリケーション機能 (Turso使用時)');
}

async function demoDuckDBFeatures(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('DuckDB 特徴的機能デモ');
  console.log('='.repeat(60));

  const dbPath = 'features_duckdb.duckdb';
  if (existsSync(dbPath)) {
    await unlink(dbPath);
  }

  const csvPath = await createSampleCSV();

  return new Promise(async (resolve, reject) => {
    const db = new duckdb.Database(dbPath);
    const conn = db.connect();

    // 1. CSV/Parquetの直接クエリ
    console.log('\n[1] CSV/ファイルの直接クエリ (DuckDBの強み)');
    console.log('     データベースにインポートせずに直接クエリ可能');
    console.log(`\n  CSVファイル '${csvPath}' を直接クエリ:`);

    conn.all(`
      SELECT category, SUM(price * quantity) as total_revenue
      FROM read_csv_auto('${csvPath}')
      GROUP BY category
      ORDER BY total_revenue DESC
    `, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      console.log('\n  カテゴリ別売上:');
      for (const row of rows) {
        console.log(`    ${row.category}: $${Number(row.total_revenue).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      }

      // データをテーブルに読み込み
      conn.run(`
        CREATE TABLE sales AS
        SELECT * FROM read_csv_auto('${csvPath}')
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // 2. ウィンドウ関数
        console.log('\n[2] ウィンドウ関数 (DuckDBの強み)');
        console.log('     順位付け、移動平均などの高度な分析');

        conn.all(`
          SELECT
            product,
            category,
            price * quantity as revenue,
            RANK() OVER (PARTITION BY category ORDER BY price * quantity DESC) as rank_in_category,
            SUM(price * quantity) OVER (PARTITION BY category) as category_total
          FROM sales
          ORDER BY category, rank_in_category
        `, (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          console.log('\n  カテゴリ内ランキング:');
          let currentCategory: string | null = null;
          for (const row of rows) {
            if (row.category !== currentCategory) {
              currentCategory = row.category;
              console.log(`\n    [${currentCategory}] (合計: $${Number(row.category_total).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})`);
            }
            console.log(`      ${row.rank_in_category}位: ${row.product} - $${Number(row.revenue).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
          }

          // 3. カラムナストレージ
          console.log('\n[3] カラムナストレージ (DuckDBの強み)');
          console.log('     列指向ストレージで集計クエリが高速');

          conn.all(`
            SELECT
              region,
              COUNT(*) as products,
              SUM(quantity) as total_quantity,
              AVG(price) as avg_price
            FROM sales
            GROUP BY region
            ORDER BY total_quantity DESC
          `, (err, rows) => {
            if (err) {
              reject(err);
              return;
            }

            console.log('\n  地域別統計:');
            for (const row of rows) {
              console.log(`    ${row.region}: ${row.products}商品, 総数量=${row.total_quantity}, 平均価格=$${Number(row.avg_price).toFixed(2)}`);
            }

            // 4. PIVOT機能
            console.log('\n[4] PIVOT機能 (DuckDBの便利機能)');
            console.log('     データの行列変換が簡単');

            conn.all(`
              PIVOT sales
              ON region
              USING SUM(quantity)
              GROUP BY category
            `, (err, rows) => {
              if (err) {
                reject(err);
                return;
              }

              console.log('\n  カテゴリ×地域のクロス集計 (数量):');
              const headers = ['Category', 'East', 'North', 'South', 'West'];
              console.log(`    ${headers[0].padEnd(15)} ${headers[1].padStart(8)} ${headers[2].padStart(8)} ${headers[3].padStart(8)} ${headers[4].padStart(8)}`);
              console.log('    ' + '-'.repeat(55));
              for (const row of rows) {
                const east = row.East || 0;
                const north = row.North || 0;
                const south = row.South || 0;
                const west = row.West || 0;
                console.log(`    ${row.category.padEnd(15)} ${String(east).padStart(8)} ${String(north).padStart(8)} ${String(south).padStart(8)} ${String(west).padStart(8)}`);
              }

              // 5. エクスポート機能
              console.log('\n[5] 複数ファイルフォーマットのサポート');
              console.log('     CSV, Parquet, JSON, Excel等に対応');
              console.log('     クラウドストレージ (S3, Azure, GCS) からの直接読み込み可能');

              console.log('\n[6] データエクスポート機能');
              conn.run(`
                COPY (SELECT * FROM sales WHERE category = 'Electronics')
                TO 'electronics_export.csv' (HEADER, DELIMITER ',')
              `, (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                console.log("     ✓ Electronicsカテゴリを 'electronics_export.csv' にエクスポート");

                conn.run(`
                  COPY (SELECT * FROM sales)
                  TO 'sales_export.parquet' (FORMAT PARQUET)
                `, async (err) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  console.log("     ✓ 全データを 'sales_export.parquet' にエクスポート");

                  db.close();

                  // クリーンアップ
                  const paths = [
                    dbPath,
                    `${dbPath}.wal`,
                    csvPath,
                    'electronics_export.csv',
                    'sales_export.parquet',
                  ];
                  for (const path of paths) {
                    if (existsSync(path)) {
                      await unlink(path);
                    }
                  }

                  console.log('\n' + '-'.repeat(60));
                  console.log('DuckDB まとめ:');
                  console.log('  ✓ CSV/Parquet等を直接クエリ可能 (インポート不要)');
                  console.log('  ✓ ウィンドウ関数などの高度な分析機能');
                  console.log('  ✓ カラムナストレージで集計クエリが高速');
                  console.log('  ✓ PIVOT等の便利な分析機能');
                  console.log('  ✓ 多様なファイル形式のサポート');
                  console.log('  ✓ クラウドストレージとの連携');

                  resolve();
                });
              });
            });
          });
        });
      });
    });
  });
}

function printSummary(): void {
  console.log('\n' + '='.repeat(60));
  console.log('総合比較: いつ何を使うべきか');
  console.log('='.repeat(60));

  console.log('\n【libSQL を使うべきケース】');
  console.log('  ✓ トランザクション処理が必要なアプリケーション');
  console.log('  ✓ モバイルアプリや組み込みシステム');
  console.log('  ✓ マイクロサービスのローカルDB');
  console.log('  ✓ リアルタイム性が重要なアプリ');
  console.log('  ✓ SQLite互換性が必要な場合');
  console.log('\n  例: Webアプリのユーザーデータ管理、IoTデバイス、');
  console.log('      モバイルアプリのオフラインストレージ');

  console.log('\n【DuckDB を使うべきケース】');
  console.log('  ✓ データ分析・BI用途');
  console.log('  ✓ 大量データの集計・レポート生成');
  console.log('  ✓ データサイエンスのワークフロー');
  console.log('  ✓ ETL処理やデータ変換');
  console.log('  ✓ CSV/Parquetファイルの分析');
  console.log('\n  例: データ分析、機械学習の前処理、ログ分析、');
  console.log('      BIダッシュボードのバックエンド');

  console.log('\n【両方を組み合わせる】');
  console.log('  - libSQL: トランザクション処理用');
  console.log('  - DuckDB: 分析・レポート生成用');
  console.log('  - libSQLからDuckDBにデータをエクスポートして分析');
}

async function main() {
  console.log('='.repeat(60));
  console.log('libSQL vs DuckDB 機能比較デモ');
  console.log('='.repeat(60));

  try {
    // libSQL 機能デモ
    await demoLibSQLFeatures();

    // DuckDB 機能デモ
    await demoDuckDBFeatures();

    // 総合サマリー
    printSummary();

    console.log('\n完了!');
  } catch (error) {
    console.error('\nエラーが発生しました:', error);
    process.exit(1);
  }
}

main();
