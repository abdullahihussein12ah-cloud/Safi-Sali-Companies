import 'dotenv/config';
import mysql from 'mysql2/promise';

let pool;

export function getMySqlPool() {
  if (pool) return pool;
  const {
    MYSQL_HOST,
    MYSQL_PORT = '3306',
    MYSQL_DATABASE,
    MYSQL_USER,
    MYSQL_PASSWORD,
    MYSQL_CONNECTION_LIMIT = '10',
  } = process.env;

  if (!MYSQL_HOST || !MYSQL_DATABASE || !MYSQL_USER) {
    throw new Error('MYSQL_HOST, MYSQL_DATABASE, and MYSQL_USER must be configured.');
  }

  pool = mysql.createPool({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    database: MYSQL_DATABASE,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: Number(MYSQL_CONNECTION_LIMIT),
    queueLimit: 0,
    charset: 'utf8mb4',
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  return pool;
}

export async function verifyMySqlConnection() {
  const connection = await getMySqlPool().getConnection();
  try {
    const [rows] = await connection.query('SELECT VERSION() AS version, DATABASE() AS databaseName');
    return rows[0];
  } finally {
    connection.release();
  }
}
