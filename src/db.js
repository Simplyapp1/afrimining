import sql from 'mssql';
import 'dotenv/config';

const getConfig = () => {
  if (process.env.AZURE_SQL_CONNECTION_STRING) {
    return process.env.AZURE_SQL_CONNECTION_STRING;
  }
  const server = process.env.AZURE_SQL_SERVER;
  const database = process.env.AZURE_SQL_DATABASE;
  const user = process.env.AZURE_SQL_USER;
  const password = process.env.AZURE_SQL_PASSWORD;
  if (!server || !database || !user || !password) {
    throw new Error(
      'Set AZURE_SQL_CONNECTION_STRING or AZURE_SQL_SERVER, AZURE_SQL_DATABASE, AZURE_SQL_USER, AZURE_SQL_PASSWORD in .env'
    );
  }
  return {
    user,
    password,
    server,
    port: parseInt(process.env.AZURE_SQL_PORT || '1433', 10),
    database,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
};

let pool = null;

export async function getPool() {
  if (pool) return pool;
  const config = getConfig();
  pool = await sql.connect(config);
  return pool;
}

export async function query(text, params = {}) {
  const p = await getPool();
  const request = p.request();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const k = key.startsWith('@') ? key.slice(1) : key;
    request.input(k, value);
  }
  return request.query(text);
}

/** Get a request for chaining .input() with types (e.g. sql.UniqueIdentifier) */
export function request() {
  return getPool().then((p) => p.request());
}

export async function close() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

export { sql };
