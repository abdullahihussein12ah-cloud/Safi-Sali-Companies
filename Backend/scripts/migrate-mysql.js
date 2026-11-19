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
  for (const relativePath of migrationFiles) {
    const migrationPath = path.resolve(here, relativePath);
    const sql = await readFile(migrationPath, 'utf8');
    await pool.query(sql);
    console.log(`Applied MySQL migration: ${path.basename(migrationPath)}`);
  }
  console.log('SAFI SALI COMPANIES MySQL migrations applied successfully.');
} catch (error) {
  console.error('MySQL migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
