import * as fs from 'fs';
import * as path from 'path';
import { getPool, query } from './connection';

// SQL files aren't copied by tsc, so reference the source directory
const MIGRATIONS_DIR = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '..', '..', 'src', 'db', 'migrations')
  : path.join(__dirname, 'migrations');

export async function runMigrations(): Promise<void> {
  // Ensure migrations tracking table exists
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Get already applied migrations
  const applied = await query<{ name: string }>('SELECT name FROM _migrations ORDER BY id');
  const appliedSet = new Set(applied.map(m => m.name));

  // Read migration files
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const skip = new Set(
    (process.env.SEO_BRAIN_SKIP_MIGRATIONS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  for (const file of files) {
    if (appliedSet.has(file) || skip.has(file)) {
      continue;
    }

    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [file],
      );
      await client.query('COMMIT');
      console.log(`  Migration ${file} applied successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`  Migration ${file} failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log('All migrations up to date');
}
