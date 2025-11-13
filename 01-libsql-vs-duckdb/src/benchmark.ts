#!/usr/bin/env node
/**
 * libSQL vs DuckDB ベンチマーク
 * 大量データでのパフォーマンス比較
 */

import { createClient } from '@libsql/client';
import duckdb from 'duckdb';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import * as readline from 'readline';

interface Employee {
  id: number;
  name: string;
  email: string;
  age: number;
  salary: number;
  department: string;
}

interface BenchmarkResults {
  insert: number;
  select: number;
  aggregate: number;
  complex: number;
  update: number;
  window?: number;
}

function generateRandomData(n: number): Employee[] {
  const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
  const data: Employee[] = [];

  for (let i = 0; i < n; i++) {
    const name = Math.random().toString(36).substring(2, 12);
    const email = `${name}@example.com`;
    const age = Math.floor(Math.random() * (80 - 18 + 1)) + 18;
    const salary = Math.floor(Math.random() * (150000 - 30000 + 1)) + 30000;
    const department = departments[Math.floor(Math.random() * departments.length)];

    data.push({
      id: i + 1,
      name,
      email,
      age,
      salary,
      department,
    });
  }

  return data;
}

async function benchmarkLibSQL(dataSize: number): Promise<BenchmarkResults> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`libSQL ベンチマーク (データサイズ: ${dataSize.toLocaleString()}件)`);
  console.log('='.repeat(60));

  const dbPath = 'benchmark_libsql.db';
  if (existsSync(dbPath)) {
    await unlink(dbPath);
  }

  const client = createClient({ url: `file:${dbPath}` });

  // テーブル作成
  await client.execute(`
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      salary INTEGER,
      department TEXT
    )
  `);

  // インデックス作成
  await client.execute('CREATE INDEX idx_department ON employees(department)');
  await client.execute('CREATE INDEX idx_age ON employees(age)');

  // データ挿入（バッチ処理）
  console.log('\n[1] データ挿入テスト');
  const data = generateRandomData(dataSize);
  const insertStart = performance.now();

  for (const emp of data) {
    await client.execute({
      sql: 'INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?)',
      args: [emp.id, emp.name, emp.email, emp.age, emp.salary, emp.department],
    });
  }

  const insertTime = (performance.now() - insertStart) / 1000;
  console.log(`  ✓ ${dataSize.toLocaleString()}件の挿入: ${insertTime.toFixed(3)}秒 (${Math.floor(dataSize / insertTime).toLocaleString()}件/秒)`);

  // 単純なSELECT
  console.log('\n[2] 単純なSELECTクエリ');
  const selectStart = performance.now();
  const result = await client.execute('SELECT * FROM employees WHERE age > 50 LIMIT 100');
  const selectTime = (performance.now() - selectStart) / 1000;
  console.log(`  ✓ 条件付きSELECT: ${(selectTime * 1000).toFixed(2)}ms (${result.rows.length}件)`);

  // 集計クエリ
  console.log('\n[3] 集計クエリ');
  const aggStart = performance.now();
  const aggResult = await client.execute(`
    SELECT department, COUNT(*) as count, AVG(salary) as avg_salary
    FROM employees
    GROUP BY department
    ORDER BY avg_salary DESC
  `);
  const aggTime = (performance.now() - aggStart) / 1000;
  console.log(`  ✓ GROUP BY集計: ${(aggTime * 1000).toFixed(2)}ms`);
  for (let i = 0; i < Math.min(3, aggResult.rows.length); i++) {
    const row = aggResult.rows[i];
    console.log(`    - ${row.department}: ${row.count}人, 平均年収 $${Number(row.avg_salary).toLocaleString(undefined, {maximumFractionDigits: 0})}`);
  }

  // 複雑な集計クエリ
  console.log('\n[4] 複雑な集計クエリ');
  const complexStart = performance.now();
  const complexResult = await client.execute(`
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
  `);
  const complexTime = (performance.now() - complexStart) / 1000;
  console.log(`  ✓ 複雑な集計: ${(complexTime * 1000).toFixed(2)}ms (${complexResult.rows.length}部署)`);

  // UPDATE
  console.log('\n[5] UPDATEクエリ (トランザクション)');
  const updateStart = performance.now();
  await client.execute("UPDATE employees SET salary = salary * 1.05 WHERE department = 'Engineering'");
  const updateTime = (performance.now() - updateStart) / 1000;
  console.log(`  ✓ UPDATE: ${(updateTime * 1000).toFixed(2)}ms`);

  // クリーンアップ
  if (existsSync(dbPath)) {
    await unlink(dbPath);
  }

  return {
    insert: insertTime,
    select: selectTime,
    aggregate: aggTime,
    complex: complexTime,
    update: updateTime,
  };
}

async function benchmarkDuckDB(dataSize: number): Promise<BenchmarkResults> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`DuckDB ベンチマーク (データサイズ: ${dataSize.toLocaleString()}件)`);
  console.log('='.repeat(60));

  const dbPath = 'benchmark_duckdb.duckdb';
  if (existsSync(dbPath)) {
    await unlink(dbPath);
  }

  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(dbPath);
    const conn = db.connect();

    const results: BenchmarkResults = {
      insert: 0,
      select: 0,
      aggregate: 0,
      complex: 0,
      update: 0,
      window: 0,
    };

    conn.run(`
      CREATE TABLE employees (
        id INTEGER PRIMARY KEY,
        name VARCHAR NOT NULL,
        email VARCHAR NOT NULL,
        age INTEGER,
        salary INTEGER,
        department VARCHAR
      )
    `, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // インデックス作成
      conn.run('CREATE INDEX idx_department ON employees(department)', (err) => {
        if (err) {
          reject(err);
          return;
        }

        conn.run('CREATE INDEX idx_age ON employees(age)', async (err) => {
          if (err) {
            reject(err);
            return;
          }

          // データ挿入
          console.log('\n[1] データ挿入テスト');
          const data = generateRandomData(dataSize);
          const insertStart = performance.now();

          let insertCount = 0;
          for (const emp of data) {
            conn.run(
              'INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?)',
              emp.id,
              emp.name,
              emp.email,
              emp.age,
              emp.salary,
              emp.department,
              (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                insertCount++;

                if (insertCount === data.length) {
                  results.insert = (performance.now() - insertStart) / 1000;
                  console.log(`  ✓ ${dataSize.toLocaleString()}件の挿入: ${results.insert.toFixed(3)}秒 (${Math.floor(dataSize / results.insert).toLocaleString()}件/秒)`);

                  // SELECT
                  console.log('\n[2] 単純なSELECTクエリ');
                  const selectStart = performance.now();
                  conn.all('SELECT * FROM employees WHERE age > 50 LIMIT 100', (err, rows) => {
                    if (err) {
                      reject(err);
                      return;
                    }
                    results.select = (performance.now() - selectStart) / 1000;
                    console.log(`  ✓ 条件付きSELECT: ${(results.select * 1000).toFixed(2)}ms (${rows.length}件)`);

                    // 集計
                    console.log('\n[3] 集計クエリ (DuckDBの強み)');
                    const aggStart = performance.now();
                    conn.all(`
                      SELECT department, COUNT(*) as count, AVG(salary) as avg_salary
                      FROM employees
                      GROUP BY department
                      ORDER BY avg_salary DESC
                    `, (err, rows) => {
                      if (err) {
                        reject(err);
                        return;
                      }
                      results.aggregate = (performance.now() - aggStart) / 1000;
                      console.log(`  ✓ GROUP BY集計: ${(results.aggregate * 1000).toFixed(2)}ms`);
                      for (let i = 0; i < Math.min(3, rows.length); i++) {
                        const row = rows[i];
                        console.log(`    - ${row.department}: ${row.count}人, 平均年収 $${Number(row.avg_salary).toLocaleString(undefined, {maximumFractionDigits: 0})}`);
                      }

                      // 複雑な集計
                      console.log('\n[4] 複雑な集計クエリ (DuckDBの強み)');
                      const complexStart = performance.now();
                      conn.all(`
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
                      `, (err, rows) => {
                        if (err) {
                          reject(err);
                          return;
                        }
                        results.complex = (performance.now() - complexStart) / 1000;
                        console.log(`  ✓ 複雑な集計: ${(results.complex * 1000).toFixed(2)}ms (${rows.length}部署)`);

                        // ウィンドウ関数
                        console.log('\n[5] ウィンドウ関数 (DuckDBの高度な機能)');
                        const windowStart = performance.now();
                        conn.all(`
                          SELECT
                            department,
                            name,
                            salary,
                            AVG(salary) OVER (PARTITION BY department) as dept_avg_salary,
                            RANK() OVER (PARTITION BY department ORDER BY salary DESC) as rank_in_dept
                          FROM employees
                          WHERE department IN ('Engineering', 'Sales')
                          LIMIT 10
                        `, (err, rows) => {
                          if (err) {
                            reject(err);
                            return;
                          }
                          results.window = (performance.now() - windowStart) / 1000;
                          console.log(`  ✓ ウィンドウ関数: ${(results.window * 1000).toFixed(2)}ms`);

                          // UPDATE
                          console.log('\n[6] UPDATEクエリ');
                          const updateStart = performance.now();
                          conn.run("UPDATE employees SET salary = salary * 1.05 WHERE department = 'Engineering'", async (err) => {
                            if (err) {
                              reject(err);
                              return;
                            }
                            results.update = (performance.now() - updateStart) / 1000;
                            console.log(`  ✓ UPDATE: ${(results.update * 1000).toFixed(2)}ms`);

                            db.close();

                            // クリーンアップ
                            if (existsSync(dbPath)) {
                              await unlink(dbPath);
                            }
                            const walPath = `${dbPath}.wal`;
                            if (existsSync(walPath)) {
                              await unlink(walPath);
                            }

                            resolve(results);
                          });
                        });
                      });
                    });
                  });
                }
              }
            );
          }
        });
      });
    });
  });
}

function printComparison(libsqlTimes: BenchmarkResults, duckdbTimes: BenchmarkResults, dataSize: number): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ベンチマーク結果比較 (データサイズ: ${dataSize.toLocaleString()}件)`);
  console.log('='.repeat(60));

  console.log(`\n${'操作'.padEnd(20)} ${'libSQL'.padStart(15)} ${'DuckDB'.padStart(15)} ${'高速'.padEnd(10)} 差分`);
  console.log('-'.repeat(70));

  // 挿入
  const faster1 = libsqlTimes.insert < duckdbTimes.insert ? 'libSQL' : 'DuckDB';
  const ratio1 = Math.max(libsqlTimes.insert, duckdbTimes.insert) / Math.min(libsqlTimes.insert, duckdbTimes.insert);
  console.log(`${'データ挿入'.padEnd(20)} ${(libsqlTimes.insert + '秒').padStart(15)} ${(duckdbTimes.insert + '秒').padStart(15)} ${faster1.padEnd(10)} ${ratio1.toFixed(2)}x`);

  // SELECT
  const libsqlSelect = libsqlTimes.select * 1000;
  const duckdbSelect = duckdbTimes.select * 1000;
  const faster2 = libsqlSelect < duckdbSelect ? 'libSQL' : 'DuckDB';
  const ratio2 = Math.max(libsqlSelect, duckdbSelect) / Math.min(libsqlSelect, duckdbSelect);
  console.log(`${'SELECT'.padEnd(20)} ${(libsqlSelect.toFixed(2) + 'ms').padStart(15)} ${(duckdbSelect.toFixed(2) + 'ms').padStart(15)} ${faster2.padEnd(10)} ${ratio2.toFixed(2)}x`);

  // 集計
  const libsqlAgg = libsqlTimes.aggregate * 1000;
  const duckdbAgg = duckdbTimes.aggregate * 1000;
  const faster3 = libsqlAgg < duckdbAgg ? 'libSQL' : 'DuckDB';
  const ratio3 = Math.max(libsqlAgg, duckdbAgg) / Math.min(libsqlAgg, duckdbAgg);
  console.log(`${'GROUP BY集計'.padEnd(20)} ${(libsqlAgg.toFixed(2) + 'ms').padStart(15)} ${(duckdbAgg.toFixed(2) + 'ms').padStart(15)} ${faster3.padEnd(10)} ${ratio3.toFixed(2)}x`);

  // 複雑な集計
  const libsqlComplex = libsqlTimes.complex * 1000;
  const duckdbComplex = duckdbTimes.complex * 1000;
  const faster4 = libsqlComplex < duckdbComplex ? 'libSQL' : 'DuckDB';
  const ratio4 = Math.max(libsqlComplex, duckdbComplex) / Math.min(libsqlComplex, duckdbComplex);
  console.log(`${'複雑な集計'.padEnd(20)} ${(libsqlComplex.toFixed(2) + 'ms').padStart(15)} ${(duckdbComplex.toFixed(2) + 'ms').padStart(15)} ${faster4.padEnd(10)} ${ratio4.toFixed(2)}x`);

  // UPDATE
  const libsqlUpdate = libsqlTimes.update * 1000;
  const duckdbUpdate = duckdbTimes.update * 1000;
  const faster5 = libsqlUpdate < duckdbUpdate ? 'libSQL' : 'DuckDB';
  const ratio5 = Math.max(libsqlUpdate, duckdbUpdate) / Math.min(libsqlUpdate, duckdbUpdate);
  console.log(`${'UPDATE'.padEnd(20)} ${(libsqlUpdate.toFixed(2) + 'ms').padStart(15)} ${(duckdbUpdate.toFixed(2) + 'ms').padStart(15)} ${faster5.padEnd(10)} ${ratio5.toFixed(2)}x`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('結論');
  console.log('='.repeat(60));
  console.log('\n【libSQL】');
  console.log('  ✓ トランザクション処理 (OLTP) に最適');
  console.log('  ✓ 小〜中規模データでの高速な読み書き');
  console.log('  ✓ 行指向ストレージで個別レコード操作が得意');
  console.log('  ✓ 組み込みアプリケーションに最適');

  console.log('\n【DuckDB】');
  console.log('  ✓ 分析クエリ (OLAP) に最適');
  console.log('  ✓ 大量データの集計・グループ化が高速');
  console.log('  ✓ カラムナストレージによる効率的なスキャン');
  console.log('  ✓ ウィンドウ関数などの高度な分析機能');
  console.log('  ✓ データサイエンス・BI用途に最適');
}

async function main() {
  console.log('='.repeat(60));
  console.log('libSQL vs DuckDB パフォーマンスベンチマーク');
  console.log('='.repeat(60));

  // データサイズを選択
  console.log('\nベンチマークのデータサイズを選択してください:');
  console.log('  1. 小 (10,000件) - 高速');
  console.log('  2. 中 (50,000件) - 推奨');
  console.log('  3. 大 (100,000件) - 時間がかかります');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('\n選択 (1-3, デフォルト=2): ', async (answer) => {
    rl.close();

    const choice = answer.trim() || '2';
    const dataSizes: { [key: string]: number } = {
      '1': 10000,
      '2': 50000,
      '3': 100000,
    };
    const dataSize = dataSizes[choice] || 50000;

    console.log(`\n${dataSize.toLocaleString()}件のデータでベンチマークを開始します...`);

    try {
      // ベンチマーク実行
      const libsqlTimes = await benchmarkLibSQL(dataSize);
      const duckdbTimes = await benchmarkDuckDB(dataSize);

      // 結果比較
      printComparison(libsqlTimes, duckdbTimes, dataSize);

      console.log('\n\n完了!');
    } catch (error) {
      console.error('\nエラーが発生しました:', error);
      process.exit(1);
    }
  });
}

main();
