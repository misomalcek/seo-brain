import fs from 'fs';
import path from 'path';

type Held = { db: unknown; server: unknown };

/**
 * Desktop Postgres: PGlite plus a wire-protocol socket, in this process.
 * The VPS keeps its own Postgres. This runs only when SEO_BRAIN_DESKTOP=1.
 */
export async function startDesktopDatabase(): Promise<void> {
  const home = process.env.SEO_BRAIN_HOME;
  if (!home) throw new Error('SEO_BRAIN_HOME is not set');
  const dataDir = path.join(home, 'pg');
  process.env.FILES_DIR = path.join(home, 'user-files');
  process.env.SEO_BRAIN_HTML_REPORTS = path.join(home, 'reports', 'html');
  process.env.SEO_BRAIN_DASHBOARDS = path.join(home, 'reports', 'dashboards');
  process.env.TEAM_BRAIN_ROOT = home;
  const bundledPrompt = process.env.SEO_BRAIN_PROMPT_FILE;
  const promptDest = path.join(home, 'CLAUDE-API.md');
  if (bundledPrompt && fs.existsSync(bundledPrompt) && !fs.existsSync(promptDest)) {
    fs.copyFileSync(bundledPrompt, promptDest);
  }
  for (const rel of [
    'pg', 'user-files', 'uploads', 'reports/mcp', 'reports/html', 'reports/dashboards',
    'reports/snapshots', 'memory', 'memory/inbox', 'knowledge', 'agents', 'templates',
    'templates/workflow', 'datasets', 'datasets/custom', 'docs', 'ahrefs', 'backups',
    'credentials', 'www/demos', 'www/reports/html', 'www/reports/dashboards',
  ]) {
    fs.mkdirSync(path.join(home, rel), { recursive: true });
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');

  const db = new PGlite({ dataDir, extensions: { vector } });
  await db.waitReady;
  const server = new PGLiteSocketServer({
    db,
    host: '127.0.0.1',
    port: 0,
    maxConnections: 4,
  });
  await server.start();
  const conn = server.getServerConn();
  const splitAt = conn.lastIndexOf(':');
  const host = conn.slice(0, splitAt);
  const port = conn.slice(splitAt + 1);

  process.env.SEO_BRAIN_PG_HOST = host;
  process.env.SEO_BRAIN_PG_PORT = port;
  process.env.DATABASE_URL = `postgres://postgres@${host}:${port}/postgres`;
  process.env.SEO_BRAIN_POOL_MAX = '1';
  if (!process.env.SEO_BRAIN_SKIP_MIGRATIONS) {
    process.env.SEO_BRAIN_SKIP_MIGRATIONS = '038_hive_graph_seed.sql';
  }

  const { Pool } = await import('pg');
  const admin = new Pool({ host, port: Number(port), database: 'postgres', max: 1 });
  await admin.query(`DO $$ BEGIN
    CREATE ROLE brain_app LOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`);
  await admin.end();

  const held: Held = { db, server };
  (globalThis as unknown as { __seoBrainPg?: Held }).__seoBrainPg = held;
  console.log(`[desktop] postgres on ${host}:${port}, data ${dataDir}`);
}
