/**
 * CC Vector Indexer — indexes Claude Code workflow files into cc_embeddings
 * Run: node -e "require('dotenv').config()" && npx tsx ../../scripts/cc-vector-index.ts
 */

import { createHash } from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const MAX_CHUNK = 1500;

// Paths
const PATHS = {
  skills: '/home/brain-admin/.claude/skills',
  memory: '/home/brain-admin/.claude/projects/-/memory',
  plans: '/opt/team-brain/docs/dev',
  hints: '/home/brain-admin/.claude/hints/uploads',
  agents: '/opt/team-brain/agents',
  knowledge: '/opt/team-brain/knowledge',
  templates: '/opt/team-brain/templates',
  apiSrc: '/opt/team-brain/apps/brain-api/src',
  chatSrc: '/opt/team-brain/apps/brain-chat',
  configs: ['/opt/team-brain/CLAUDE.md', '/opt/team-brain/CLAUDE-API.md'],
};

// Embedding
let embedFn: ((t: string) => Promise<number[]>) | null = null;
async function embed(text: string): Promise<number[]> {
  if (!embedFn) {
    const { pipeline } = await import('@huggingface/transformers');
    const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
    embedFn = async (t) => {
      const out = await pipe(t.slice(0, MAX_CHUNK), { pooling: 'mean', normalize: true });
      return Array.from(out.data as Float32Array);
    };
  }
  return embedFn(text);
}

function sha256(s: string): string { return createHash('sha256').update(s).digest('hex'); }

function findFiles(dir: string, ext = '.md', recursive = false): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isFile() && e.name.endsWith(ext) && !e.name.startsWith('.')) result.push(full);
      else if (recursive && e.isDirectory() && !['node_modules', '.next', 'dist', 'archived'].includes(e.name)) walk(full);
    }
  };
  walk(dir);
  return result;
}

function findTs(dir: string): string[] {
  const result: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory() && !['node_modules', '.next', 'dist', 'archived'].includes(e.name)) walk(full);
      else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) && !e.name.endsWith('.d.ts')) result.push(full);
    }
  };
  walk(dir);
  return result;
}

// Chunkers
type Chunk = { title: string; content: string; meta: Record<string, any> };

function chunkWhole(path: string, content: string): Chunk[] {
  return [{ title: basename(path, extname(path)), content: content.slice(0, MAX_CHUNK), meta: { path } }];
}

function chunkSections(path: string, content: string): Chunk[] {
  const name = basename(path, extname(path));
  const h1 = content.match(/^#\s+(.+)/m)?.[1]?.trim() || name;
  const sections = content.split(/\n(?=## )/);
  if (sections.length <= 1) return chunkWhole(path, content);
  return sections.map((s, i) => {
    const heading = s.match(/^##\s+(.+)/)?.[1]?.trim() || `s${i}`;
    return { title: `${name}: ${heading}`, content: `${h1} — ${heading}\n\n${s}`.slice(0, MAX_CHUNK), meta: { path, section: heading } };
  });
}

function chunkAgent(path: string, content: string): Chunk[] {
  const name = basename(path, '.md');
  const fm = content.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const desc = fm.match(/description:\s*(.+)/)?.[1] || '';
  const type = fm.match(/type:\s*(.+)/)?.[1] || '';
  const first = body.split(/\n## /)[0] || '';
  return [{ title: name, content: `Agent: ${name}\n${desc}\n${type}\n\n${first}`.slice(0, MAX_CHUNK), meta: { path, type } }];
}

function chunkSource(path: string, content: string): Chunk[] {
  const rel = path.replace('/opt/team-brain/', '');
  const chunks: Chunk[] = [];
  const regex = /^(export\s+(?:async\s+)?(?:function|class|const|interface|type|enum)\s+(\w+)[\s\S]*?)(?=\nexport\s|\n\/\/\s*={3,}|$)/gm;
  let m;
  while ((m = regex.exec(content)) !== null) {
    if (m[1].length < 50) continue;
    chunks.push({
      title: `${basename(path)}: ${m[2]}`,
      content: `// ${rel}\n${m[1]}`.slice(0, MAX_CHUNK),
      meta: { path, fn: m[2], line: content.substring(0, m.index).split('\n').length },
    });
  }
  if (chunks.length === 0 && content.length > 100) {
    chunks.push({ title: basename(path), content: `// ${rel}\n${content}`.slice(0, MAX_CHUNK), meta: { path } });
  }
  return chunks;
}

// Index one type
async function indexType(type: string, files: string[], chunker: (p: string, c: string) => Chunk[], changed: boolean) {
  let indexed = 0, skipped = 0;
  const unique = [...new Set(files)];
  for (const f of unique) {
    try {
      const content = readFileSync(f, 'utf-8');
      const hash = sha256(content);
      if (changed) {
        const ex = await pool.query('SELECT content_hash FROM cc_embeddings WHERE entity_type=$1 AND entity_id=$2 AND chunk_index=0 LIMIT 1', [type, f]);
        if (ex.rows[0]?.content_hash === hash) { skipped++; continue; }
      }
      const chunks = chunker(f, content);
      await pool.query('DELETE FROM cc_embeddings WHERE entity_type=$1 AND entity_id=$2', [type, f]);
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const emb = await embed(c.content);
        await pool.query(
          `INSERT INTO cc_embeddings (entity_type,entity_id,chunk_index,title,content_chunk,embedding,metadata,content_hash) VALUES ($1,$2,$3,$4,$5,$6::vector,$7,$8)
           ON CONFLICT (entity_type,entity_id,chunk_index) DO UPDATE SET title=EXCLUDED.title,content_chunk=EXCLUDED.content_chunk,embedding=EXCLUDED.embedding,metadata=EXCLUDED.metadata,content_hash=EXCLUDED.content_hash,updated_at=NOW()`,
          [type, f, i, c.title, c.content, JSON.stringify(emb), JSON.stringify(c.meta), hash]
        );
      }
      indexed++;
    } catch (e) { console.error(`  ERR ${f}: ${(e as Error).message}`); }
  }
  console.log(`  [${type}] ${unique.length} files → indexed: ${indexed}, skipped: ${skipped}`);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const typeFilter = args.includes('--type') ? args[args.indexOf('--type') + 1] : undefined;
  const changed = args.includes('--changed');

  if (args.includes('--stats')) {
    const r = await pool.query('SELECT entity_type, COUNT(*) as chunks, COUNT(DISTINCT entity_id) as files FROM cc_embeddings GROUP BY entity_type ORDER BY entity_type');
    console.log('\n=== CC Embeddings Stats ===');
    let total = 0;
    for (const row of r.rows) { console.log(`  ${row.entity_type}: ${row.files} files, ${row.chunks} chunks`); total += parseInt(row.chunks); }
    console.log(`  TOTAL: ${total} chunks`);
    await pool.end();
    return;
  }

  const t0 = Date.now();
  console.log(`\n=== CC Vector Indexer (${changed ? 'changed' : 'full'}) ===`);

  const sources: Array<[string, string[], (p: string, c: string) => Chunk[]]> = [
    ['skill', [...findFiles(PATHS.skills), ...findFiles(PATHS.skills, '.md', true).filter(f => f.includes('SKILL.md'))], chunkSections],
    ['memory', findFiles(PATHS.memory), chunkWhole],
    ['plan', findFiles(PATHS.plans).filter(f => !f.includes('archive')), chunkSections],
    ['hint', findFiles(PATHS.hints, '.md', true), chunkSections],
    ['agent', findFiles(PATHS.agents).filter(f => !f.includes('archived')), chunkAgent],
    ['knowledge', findFiles(PATHS.knowledge), chunkWhole],
    ['template', findFiles(PATHS.templates, '.md', true), chunkWhole],
    ['source', [...findTs(PATHS.apiSrc), ...findTs(join(PATHS.chatSrc, 'app')), ...findTs(join(PATHS.chatSrc, 'components')), ...findTs(join(PATHS.chatSrc, 'lib'))], chunkSource],
    ['config', PATHS.configs.filter(existsSync), chunkSections],
  ];

  for (const [type, files, chunker] of sources) {
    if (typeFilter && type !== typeFilter) continue;
    await indexType(type, files, chunker, changed);
  }

  const total = await pool.query('SELECT COUNT(*) FROM cc_embeddings');
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${total.rows[0].count} total chunks`);
  await pool.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
