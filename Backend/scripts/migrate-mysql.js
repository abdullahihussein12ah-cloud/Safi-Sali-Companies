import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMySqlPool } from '../src/config/mysql.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, '../../Database/MySQL/001_affiliate_platform.sql');
const sql = await readFile(schemaPath, 'utf8');
const pool = getMySqlPool();

try {
  const connection = await pool.getConnection();
  try {
    await connection.query(sql);
    console.log('Affiliate platform MySQL schema applied successfully.');
  } finally {
    connection.release();
  }
} catch (error) {
  console.error('MySQL schema migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
