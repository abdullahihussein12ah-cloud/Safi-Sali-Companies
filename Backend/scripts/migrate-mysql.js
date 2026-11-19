import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationFiles = [
  '../../Database/MySQL/001_affiliate_platform.sql',
  '../../Database/MySQL/002_email_verification.sql',
  '../../Database/MySQL/003_password_reset.sql',
  '../../Database/MySQL/004_payout_workflow.sql',
];
const pool = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD || '',
  charset: 'utf8mb4',
  multipleStatements: true,
});

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(190) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const relativePath of migrationFiles) {
    const migrationPath = path.resolve(here, relativePath);
    const version = path.basename(migrationPath);
    const [applied] = await pool.execute(
      'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1',
      [version],
    );
    if (applied.length) {
      console.log(`Skipped already-applied MySQL migration: ${version}`);
      continue;
    }

    const sql = await readFile(migrationPath, 'utf8');
    await pool.query(sql);
    await pool.execute('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
    console.log(`Applied MySQL migration: ${version}`);
  }
  console.log('SAFI SALI COMPANIES MySQL migrations completed successfully.');
} catch (error) {
  console.error('MySQL migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
