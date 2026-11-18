import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, '../../Database/MySQL/001_affiliate_platform.sql');
const sql = await readFile(schemaPath, 'utf8');
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
  await pool.query(sql);
  console.log('Affiliate platform MySQL schema applied successfully.');
} catch (error) {
  console.error('MySQL schema migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
