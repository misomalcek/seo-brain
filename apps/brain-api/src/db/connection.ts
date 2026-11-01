import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const max = Number(process.env.SEO_BRAIN_POOL_MAX || 10);
    const host = process.env.SEO_BRAIN_PG_HOST;
    const port = process.env.SEO_BRAIN_PG_PORT;
    const limits = { max, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 };
    pool = new Pool(
      host && port
        ? { host, port: Number(port), database: 'postgres', ...limits }
        : { connectionString, ...limits },
    );
    pool.on('connect', (client: PoolClient) => {
      // AGE is loaded by the postmaster via session_preload_libraries on the
      // brain_app role (set by handoff one-liner). Calling LOAD here would
      // fail — non-superusers can't LOAD libraries. Just set search_path so
      // ag_catalog functions resolve unqualified.
      client.query('SET search_path = ag_catalog, "$user", public;')
        .catch(() => { /* search_path setting is best-effort */ });
    });
    console.log('PostgreSQL pool created');
  }
  return pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const result = await getPool().query('SELECT NOW()');
    return !!result.rows[0];
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
