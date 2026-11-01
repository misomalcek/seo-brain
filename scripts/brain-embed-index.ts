/**
 * Brain Embeddings Indexer — indexes agents, knowledge, brand, memory, templates
 * into brain_embeddings table for semantic agent selection and knowledge retrieval.
 *
 * Usage: DATABASE_URL=... node --import tsx scripts/brain-embed-index.ts
 */

import { createHash } from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const MAX_CHUNK = 1500;

// Embedding (reuse same model)
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

async function indexItem(type: string, id: string, title: string, content: string, meta: Record<string, any> = {}) {
  const hash = sha256(content);
  // Check if unchanged
  const existing = await pool.query('SELECT content_hash FROM brain_embeddings WHERE source_type=$1 AND source_id=$2 LIMIT 1', [type, id]);
  if (existing.rows[0]?.content_hash === hash) return 'skipped';

  const emb = await embed(content);
  await pool.query(
    `INSERT INTO brain_embeddings (source_type, source_id, title, content_chunk, embedding, metadata, content_hash, updated_at)
     VALUES ($1, $2, $3, $4, $5::vector, $6, $7, NOW())
     ON CONFLICT (source_type, source_id) DO UPDATE SET
       title=EXCLUDED.title, content_chunk=EXCLUDED.content_chunk, embedding=EXCLUDED.embedding,
       metadata=EXCLUDED.metadata, content_hash=EXCLUDED.content_hash, updated_at=NOW()`,
    [type, id, title, content.slice(0, MAX_CHUNK), JSON.stringify(emb), JSON.stringify(meta), hash]
  );
  return 'indexed';
}

async function main() {
  const t0 = Date.now();
  let indexed = 0, skipped = 0;

  // 1. Agents
  const agentsDir = '/opt/team-brain/agents';
  if (existsSync(agentsDir)) {
    const files = readdirSync(agentsDir).filter(f => f.endsWith('.md') && !f.startsWith('.'));
    for (const f of files) {
      const path = join(agentsDir, f);
      const content = readFileSync(path, 'utf-8');
      const name = basename(f, '.md');
      const fm = content.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
      const desc = fm.match(/description:\s*(.+)/)?.[1] || '';
      const type = fm.match(/type:\s*(.+)/)?.[1] || '';
      const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').split(/\n## /)[0] || '';
      const chunk = `Agent: ${name}\n${desc}\n${type}\n\n${body}`.slice(0, MAX_CHUNK);
      const r = await indexItem('agent', path, name, chunk, { type, description: desc });
      if (r === 'indexed') indexed++; else skipped++;
    }
    console.log(`  [agent] ${files.length} files → indexed: ${indexed - 0}`);
  }

  // 2. Knowledge
  const knDir = '/opt/team-brain/knowledge';
  if (existsSync(knDir)) {
    const knCount = indexed;
    for (const f of readdirSync(knDir).filter(f => f.endsWith('.md'))) {
      const content = readFileSync(join(knDir, f), 'utf-8');
      const r = await indexItem('knowledge', join(knDir, f), basename(f, '.md'), content);
      if (r === 'indexed') indexed++; else skipped++;
    }
    console.log(`  [knowledge] indexed: ${indexed - knCount}`);
  }

  // 3. Brand assets from DB
  const brandCount = indexed;
  const brands = await pool.query('SELECT id, asset_type, title, content FROM brand_assets');
  for (const b of brands.rows) {
    const chunk = `Brand: ${b.title}\nType: ${b.asset_type}\n\n${b.content}`.slice(0, MAX_CHUNK);
    const r = await indexItem('brand', `brand-${b.id}`, b.title, chunk, { asset_type: b.asset_type });
    if (r === 'indexed') indexed++; else skipped++;
  }
  console.log(`  [brand] ${brands.rows.length} assets → indexed: ${indexed - brandCount}`);

  // 4. Active memories from DB
  const memCount = indexed;
  const memories = await pool.query('SELECT id, content, category, domains FROM brain_memories WHERE is_active = true');
  for (const m of memories.rows) {
    const chunk = `Memory [${m.category}]: ${m.content}`;
    const r = await indexItem('memory', `memory-${m.id}`, m.category, chunk, { category: m.category, domains: m.domains });
    if (r === 'indexed') indexed++; else skipped++;
  }
  console.log(`  [memory] ${memories.rows.length} active → indexed: ${indexed - memCount}`);

  // 5. Templates
  const tplDir = '/opt/team-brain/templates';
  const tplCount = indexed;
  if (existsSync(tplDir)) {
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        if (e.isFile() && e.name.endsWith('.md')) {
          const content = readFileSync(full, 'utf-8');
          const r = indexItem('template', full, basename(e.name, '.md'), content);
          // sync for simplicity
        } else if (e.isDirectory()) {
          walk(full);
        }
      }
    };
    // Do it async
    for (const f of readdirSync(tplDir, { withFileTypes: true })) {
      if (f.isDirectory()) {
        for (const sf of readdirSync(join(tplDir, f.name)).filter(x => x.endsWith('.md'))) {
          const full = join(tplDir, f.name, sf);
          const content = readFileSync(full, 'utf-8');
          const r = await indexItem('template', full, basename(sf, '.md'), content);
          if (r === 'indexed') indexed++; else skipped++;
        }
      }
    }
    console.log(`  [template] indexed: ${indexed - tplCount}`);
  }

  const total = await pool.query('SELECT COUNT(*) FROM brain_embeddings');
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${total.rows[0].count} total, indexed: ${indexed}, skipped: ${skipped}`);
  await pool.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
