import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/connection';
import { requireAdmin, requireTeamAdmin } from '../middleware/auth';
import { getSystemPromptBreakdown } from '../services/claude';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import multer from 'multer';
import crypto from 'crypto';

const AGENTS_DIR = '/opt/team-brain/agents';
const FRAMEWORKS_DIR = '/opt/team-brain/templates';
const DATASETS_DIR = '/opt/team-brain/datasets';

export const adminRouter = Router();

// Most admin routes allow team_admin too; system/memory routes stay admin-only (added inline below)
adminRouter.use(requireTeamAdmin);

// GET /admin/health - Extended health check (brain-admin only)
adminRouter.get('/health', requireAdmin, async (_req: Request, res: Response) => {
  const start = Date.now();

  // Database check with latency
  let dbStatus = 'disconnected';
  let dbLatency = 0;
  try {
    const dbStart = Date.now();
    await queryOne('SELECT 1');
    dbLatency = Date.now() - dbStart;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }

  // System metrics
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const uptime = os.uptime();
  const loadAvg = os.loadavg();

  // Disk usage
  let diskInfo = { total: 0, used: 0, available: 0 };
  try {
    const dfOutput = execFileSync('df', ['-B1', '/']).toString();
    const df = dfOutput.split('\n')[1]?.split(/\s+/);
    if (df) {
      diskInfo = { total: Number(df[1]), used: Number(df[2]), available: Number(df[3]) };
    }
  } catch { /* ignore */ }

  // MCP Bridge status
  const mcpConfigPath = path.join(__dirname, '../../config/mcp-servers.json');
  const mcpConfigExists = fs.existsSync(mcpConfigPath);

  // Reports count
  const reportsDir = '/opt/team-brain/reports/mcp';
  let reportCount = 0;
  try {
    reportCount = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json')).length;
  } catch { /* ignore */ }

  // User files count
  let fileCount = 0;
  try {
    const fileResult = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM user_files');
    fileCount = Number(fileResult?.count || 0);
  } catch { /* ignore */ }

  // Data Pipeline status
  const now = new Date();
  const staleThresholdMs = 48 * 60 * 60 * 1000; // 48 hours

  let gscPipeline = { latest: null as string | null, count: 0, stale: true };
  try {
    const gscLatest = await queryOne<{ latest: string; count: string }>(
      'SELECT MAX(snapshot_date) as latest, COUNT(*) as count FROM gsc_snapshots'
    );
    if (gscLatest?.latest) {
      gscPipeline = {
        latest: gscLatest.latest,
        count: Number(gscLatest.count),
        stale: now.getTime() - new Date(gscLatest.latest).getTime() > staleThresholdMs,
      };
    }
  } catch { /* ignore */ }

  let ahrefsPipeline = { latest: null as string | null, count: 0, stale: true };
  try {
    const ahrefsLatest = await queryOne<{ latest: string; count: string }>(
      'SELECT MAX(snapshot_date) as latest, COUNT(*) as count FROM ahrefs_snapshots'
    );
    if (ahrefsLatest?.latest) {
      ahrefsPipeline = {
        latest: ahrefsLatest.latest,
        count: Number(ahrefsLatest.count),
        stale: now.getTime() - new Date(ahrefsLatest.latest).getTime() > staleThresholdMs,
      };
    }
  } catch { /* ignore */ }

  let dashboards: Record<string, string | null> = { seo: null, content: null, ceo: null, keywords: null, audit: null, links: null, visibility: null };
  try {
    const dashRows = await query<{ dashboard_type: string; latest: string }>(
      `SELECT dashboard_type, MAX(created_at) as latest FROM dashboard_snapshots GROUP BY dashboard_type`
    );
    for (const r of dashRows) {
      if (r.dashboard_type in dashboards) dashboards[r.dashboard_type] = r.latest;
    }
  } catch { /* ignore */ }

  let mcpCache = { entries: 0, lastCleanup: null as string | null };
  try {
    const cacheCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM mcp_cache');
    mcpCache.entries = Number(cacheCount?.count || 0);
  } catch { /* ignore */ }

  // Pending actions
  let pendingInbox = 0;
  try {
    if (fs.existsSync('/opt/team-brain/memory/inbox')) {
      pendingInbox = fs.readdirSync('/opt/team-brain/memory/inbox').filter(f => f.endsWith('.md')).length;
    }
  } catch { /* ignore */ }

  let pendingFeedback = 0;
  try {
    const fb = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM feedback WHERE status = 'new'");
    pendingFeedback = Number(fb?.count || 0);
  } catch { /* ignore */ }

  // PM2 process info
  let pm2Info = { status: 'unknown', restarts: 0, uptime: 0 } as { status: string; restarts: number; uptime: number };
  try {
    const pm2Bin = '/opt/team-brain/apps/brain-api/node_modules/pm2/bin/pm2';
    const pm2Out = execFileSync(pm2Bin, ['jlist'], { timeout: 5000 }).toString();
    const pm2Procs = JSON.parse(pm2Out);
    const brainProc = pm2Procs.find((p: any) => p.name === 'brain-api');
    if (brainProc) {
      pm2Info = {
        status: brainProc.pm2_env?.status || 'unknown',
        restarts: brainProc.pm2_env?.restart_time || 0,
        uptime: brainProc.pm2_env?.pm_uptime ? Math.floor((Date.now() - brainProc.pm2_env.pm_uptime) / 1000) : 0,
      };
    }
  } catch { /* ignore */ }

  // Last backup time
  let lastBackup: string | null = null;
  try {
    const backupDir = '/opt/team-brain/backups';
    if (fs.existsSync(backupDir)) {
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.sql') || f.endsWith('.gz'))
        .sort()
        .reverse();
      if (backups.length > 0) {
        const stat = fs.statSync(path.join(backupDir, backups[0]));
        lastBackup = stat.mtime.toISOString();
      }
    }
  } catch { /* ignore */ }

  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    uptime,
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - start,
    database: {
      status: dbStatus,
      latency: dbLatency,
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Math.round((usedMem / totalMem) * 100),
      },
      disk: diskInfo,
      loadAvg: {
        '1m': loadAvg[0],
        '5m': loadAvg[1],
        '15m': loadAvg[2],
      },
      cpus: os.cpus().length,
    },
    mcpBridge: {
      configured: mcpConfigExists,
      status: mcpConfigExists ? 'enabled' : 'not configured',
    },
    storage: {
      reports: reportCount,
      userFiles: fileCount,
    },
    dataPipeline: {
      gscSnapshots: gscPipeline,
      ahrefsSnapshots: ahrefsPipeline,
      dashboards,
      mcpCache,
    },
    pendingActions: {
      memoryInbox: pendingInbox,
      newFeedback: pendingFeedback,
    },
    pm2: pm2Info,
    lastBackup,
    promptBreakdown: getSystemPromptBreakdown(),
  });
});

// GET /admin/stats - Usage statistics
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  // User stats
  const userCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users');
  const usersByRole = await query<{ role: string; count: string }>(
    'SELECT role, COUNT(*) as count FROM users GROUP BY role'
  );

  // Conversation stats
  const convTotal = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM conversations');
  const convToday = await queryOne<{ count: string }>(
    "SELECT COUNT(*) as count FROM conversations WHERE created_at >= CURRENT_DATE"
  );
  const convThisWeek = await queryOne<{ count: string }>(
    "SELECT COUNT(*) as count FROM conversations WHERE created_at >= date_trunc('week', CURRENT_DATE)"
  );

  // Message stats
  const msgTotal = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM messages');
  const msgToday = await queryOne<{ count: string }>(
    "SELECT COUNT(*) as count FROM messages WHERE created_at >= CURRENT_DATE"
  );

  // Persona usage
  const personaUsage = await query<{ persona_id: string; count: string }>(
    "SELECT persona_id, COUNT(*) as count FROM messages WHERE persona_id IS NOT NULL GROUP BY persona_id ORDER BY count DESC"
  );

  // Deliberation stats
  const delibCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM persona_deliberations');

  // File stats
  const fileCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM user_files');
  const fileSizeTotal = await queryOne<{ total: string }>('SELECT COALESCE(SUM(size_bytes), 0) as total FROM user_files');

  // Team usage stats
  const convs7d = await queryOne<{ count: string }>(
    "SELECT COUNT(*) as count FROM conversations WHERE created_at >= NOW() - INTERVAL '7 days'"
  );
  const msgs30d = await queryOne<{ count: string }>(
    "SELECT COUNT(*) as count FROM messages WHERE role = 'assistant' AND created_at >= NOW() - INTERVAL '30 days'"
  );
  const topAgents = await query<{ agent_name: string; count: string }>(
    `SELECT p as agent_name, COUNT(*) as count
     FROM persona_deliberations, UNNEST(personas) AS p
     WHERE created_at >= NOW() - INTERVAL '30 days'
     GROUP BY p ORDER BY count DESC LIMIT 5`
  );

  // Recent activity (last 10 conversations)
  const recentConvs = await query(
    `SELECT c.id, c.title, c.persona_id, c.created_at, u.name as user_name,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
     FROM conversations c
     JOIN users u ON c.user_id = u.id
     ORDER BY c.updated_at DESC LIMIT 10`
  );

  res.json({
    users: {
      total: Number(userCount?.count || 0),
      byRole: usersByRole.map(r => ({ role: r.role, count: Number(r.count) })),
    },
    conversations: {
      total: Number(convTotal?.count || 0),
      today: Number(convToday?.count || 0),
      thisWeek: Number(convThisWeek?.count || 0),
    },
    messages: {
      total: Number(msgTotal?.count || 0),
      today: Number(msgToday?.count || 0),
    },
    personas: {
      usage: personaUsage.map(p => ({ personaId: p.persona_id, count: Number(p.count) })),
    },
    deliberations: {
      total: Number(delibCount?.count || 0),
    },
    files: {
      total: Number(fileCount?.count || 0),
      totalSize: Number(fileSizeTotal?.total || 0),
    },
    recentActivity: recentConvs.map(c => ({
      id: c.id,
      title: c.title,
      personaId: c.persona_id,
      userName: c.user_name,
      messageCount: Number(c.message_count),
      createdAt: c.created_at,
    })),
    teamUsage: {
      conversations7d: Number(convs7d?.count || 0),
      aiResponses30d: Number(msgs30d?.count || 0),
      topAgents: topAgents.map(a => ({ name: a.agent_name, count: Number(a.count) })),
    },
  });
});

// GET /admin/reports - REMOVED (MCP reports are now shown as snapshots/datasets, not reports)

// GET /admin/feedback - All feedback with filters
adminRouter.get('/feedback', async (req: Request, res: Response) => {
  const { type, status } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (type) { conditions.push(`f.type = $${idx++}`); params.push(type); }
  if (status) { conditions.push(`f.status = $${idx++}`); params.push(status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const items = await query(
    `SELECT f.*, u.name as user_name FROM feedback f
     LEFT JOIN users u ON f.user_id = u.id
     ${where}
     ORDER BY f.created_at DESC LIMIT 200`,
    params
  );

  res.json({
    items: items.map(f => ({
      id: f.id,
      userId: f.user_id,
      userName: f.user_name,
      type: f.type,
      content: f.content,
      conversationId: f.conversation_id,
      messageIndex: f.message_index,
      status: f.status,
      createdAt: f.created_at,
    })),
    total: items.length,
  });
});

// PATCH /admin/feedback/:id/status - Update feedback status
adminRouter.patch('/feedback/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;
  const validStatuses = ['new', 'acknowledged', 'resolved', 'wont-fix'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
    return;
  }
  await query('UPDATE feedback SET status = $1 WHERE id = $2', [status, req.params.id as string]);
  res.json({ success: true });
});

// GET /admin/mcp-status - MCP server and tool status (brain-admin only)
adminRouter.get('/mcp-status', requireAdmin, (_req: Request, res: Response) => {
  const mcpConfigPath = path.join(__dirname, '../../config/mcp-servers.json');
  let mcpConfig: any = null;
  if (fs.existsSync(mcpConfigPath)) {
    try { mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8')); } catch { /* ignore */ }
  }

  const apiKeys = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    ahrefsApi: !!process.env.AHREFS_API_KEY,
  };

  res.json({
    mcpServers: mcpConfig ? Object.keys(mcpConfig.mcpServers || mcpConfig).map(name => ({
      name,
      status: 'configured',
    })) : [],
    apiKeys: Object.entries(apiKeys).map(([name, present]) => ({
      name,
      present,
      masked: present ? '***configured***' : 'NOT SET',
    })),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ============================================================
// Unified Context Retrieval (D4 crown) — semantic search across ALL Brain data layers
// Memories + Articles + Knowledge + Agents + Brand + Templates in one ranked response
// ============================================================
adminRouter.get('/context/search', requireAdmin, async (req: Request, res: Response) => {
  try {
    const queryText = String(req.query.q || '').trim();
    if (!queryText) { res.status(400).json({ error: 'Query param "q" required.' }); return; }
    const limit = Math.min(parseInt(String(req.query.limit || '15'), 10), 50);
    const perSourceLimit = Math.min(parseInt(String(req.query.perSource || '8'), 10), 20);
    const minScore = parseFloat(String(req.query.minScore || '0.25'));
    const sources = req.query.sources ? String(req.query.sources).split(',') : undefined;
    const { unifiedContextSearch } = await import('../services/brain-memory');
    const result = await unifiedContextSearch(queryText, { limit, perSourceLimit, minScore, sources });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Data Browser v1 (2026-04-29) REMOVED 2026-05-22
// Routes /data/views + /data/domains deleted — used direct GSC API, incompatible with Silver layer.
// Replacement: p2-data-viewer-rebuild (latent, blocked on p2-data-layer-medallion-silver + Pencil design).

// ============================================================
// Brain embeddings reindex — refreshes brain_embeddings (agents/knowledge/brand/memory/templates)
// Spawns scripts/brain-embed-index.ts as subprocess (existing pipeline, no duplication)
// ============================================================
adminRouter.post('/embeddings/reindex', requireAdmin, async (_req: Request, res: Response) => {
  const { spawn } = await import('child_process');
  const scriptPath = '/opt/team-brain/apps/brain-api/scripts/brain-embed-index.ts';
  const cwd = '/opt/team-brain/apps/brain-api';
  const child = spawn('node', ['--import', 'tsx', scriptPath], {
    cwd, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  child.on('close', async (code) => {
    // Get post-reindex stats
    try {
      const stats = await query<any>(`
        SELECT source_type, count(*) AS count, max(updated_at) AS last_updated
        FROM brain_embeddings GROUP BY source_type ORDER BY count DESC`);
      res.json({
        ok: code === 0, exit_code: code,
        stdout_tail: stdout.slice(-1500), stderr_tail: stderr.slice(-500),
        stats,
      });
    } catch (err) {
      res.status(500).json({ error: String(err), stdout_tail: stdout.slice(-500) });
    }
  });
  child.on('error', (err) => res.status(500).json({ error: String(err) }));
});

adminRouter.get('/embeddings/stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await query<any>(`
      SELECT source_type, count(*) AS count, max(updated_at) AS last_updated
      FROM brain_embeddings GROUP BY source_type ORDER BY count DESC`);
    const overall = await query<any>(`SELECT count(*) AS total FROM brain_embeddings`);
    res.json({ total: overall[0]?.total || 0, by_source_type: stats });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============================================================
// Memory embeddings — backfill + semantic search (migration 036)
// ============================================================
adminRouter.post('/memory/embeddings/backfill', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { backfillEmbeddings } = await import('../services/brain-memory');
    const limit = req.body?.limit ?? 1000;
    const activeOnly = req.body?.activeOnly === true;
    const stats = await backfillEmbeddings({ limit, activeOnly });
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

adminRouter.get('/memory/search', requireAdmin, async (req: Request, res: Response) => {
  try {
    const queryText = String(req.query.q || '').trim();
    if (!queryText) { res.status(400).json({ error: 'Query param "q" required.' }); return; }
    const limit = Math.min(parseInt(String(req.query.limit || '10'), 10), 50);
    const minSimilarity = parseFloat(String(req.query.minScore || '0.3'));
    const activeOnly = req.query.active !== 'false';
    const { searchMemoriesSemantically } = await import('../services/brain-memory');
    const results = await searchMemoriesSemantically(queryText, { limit, minSimilarity, activeOnly });
    res.json({
      query: queryText, count: results.length,
      results: results.map(r => ({
        id: r.id,
        content: r.content,
        category: r.category,
        is_anchor: r.is_anchor,
        spirit_level: r.spirit_level,
        importance: r.importance,
        similarity: r.similarity,
        combined_score: r.combined_score,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

adminRouter.get('/memory/embeddings/stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await query<any>(`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded,
        count(*) FILTER (WHERE embedding IS NULL) AS missing,
        count(*) FILTER (WHERE embedding IS NULL AND is_active = true) AS missing_active,
        max(embedded_at) AS last_embedded
      FROM brain_memories
    `);
    res.json(stats[0] || {});
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============================================================
// Bronze Observability — tool_calls_log + agent_runs viewer
// (admin-only, reads from TimescaleDB hypertables migrations 032+034)
// ============================================================
adminRouter.get('/observability', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [summary, recentRuns, recentToolCalls, runsHourly, toolsHourly] = await Promise.all([
      query(`
        SELECT
          (SELECT count(*) FROM agent_runs WHERE ran_at > now() - INTERVAL '24 hours') AS runs_24h,
          (SELECT count(*) FROM agent_runs WHERE ran_at > now() - INTERVAL '7 days')   AS runs_7d,
          (SELECT count(*) FROM tool_calls_log WHERE called_at > now() - INTERVAL '24 hours') AS tool_calls_24h,
          (SELECT count(*) FROM tool_calls_log WHERE called_at > now() - INTERVAL '7 days')   AS tool_calls_7d,
          (SELECT coalesce(sum(input_tokens),0) + coalesce(sum(output_tokens),0)
             FROM agent_runs WHERE ran_at > now() - INTERVAL '7 days') AS tokens_7d,
          (SELECT count(*) FROM agent_runs WHERE success = false AND ran_at > now() - INTERVAL '7 days') AS failures_7d
      `),
      query(`
        SELECT ran_at, agent_id, model_used, mode, persona_id, tool_calls_count,
               iterations, input_tokens, output_tokens, total_duration_ms, success, error_message
        FROM agent_runs
        WHERE ran_at > now() - INTERVAL '7 days'
        ORDER BY ran_at DESC
        LIMIT 100
      `),
      query(`
        SELECT called_at, tool_name, agent_id, duration_ms, output_size_bytes,
               success, error_code, conversation_id
        FROM tool_calls_log
        WHERE called_at > now() - INTERVAL '7 days'
        ORDER BY called_at DESC
        LIMIT 100
      `),
      query(`
        SELECT bucket, agent_id, model_used, mode,
               total_runs, success_runs, failure_runs,
               avg_duration_ms, p95_duration_ms,
               total_input_tokens, total_output_tokens
        FROM agent_runs_hourly
        WHERE bucket > now() - INTERVAL '7 days'
        ORDER BY bucket DESC
        LIMIT 168
      `),
      query(`
        SELECT bucket, tool_name, agent_id,
               total_calls, success_calls, failure_calls,
               avg_duration_ms, p95_duration_ms
        FROM tool_calls_hourly
        WHERE bucket > now() - INTERVAL '7 days'
        ORDER BY bucket DESC
        LIMIT 168
      `),
    ]);
    res.json({
      summary: summary[0] || {},
      recent_runs: recentRuns,
      recent_tool_calls: recentToolCalls,
      runs_hourly: runsHourly,
      tools_hourly: toolsHourly,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/observability] failed:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /admin/memory - List memory files (brain-admin only)
adminRouter.get('/memory', requireAdmin, (_req: Request, res: Response) => {
  const memDir = '/opt/team-brain/memory';
  if (!fs.existsSync(memDir)) {
    res.json({ files: [] });
    return;
  }

  const files = fs.readdirSync(memDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const stats = fs.statSync(path.join(memDir, f));
      return { filename: f, size: stats.size, updatedAt: stats.mtime.toISOString() };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  res.json({ files });
});

// ============================================================
// Memory Inbox (admin-only) — MUST be before /memory/:filename
// ============================================================
const MEMORY_INBOX_DIR = '/opt/team-brain/memory/inbox';

adminRouter.get('/memory/inbox', requireAdmin, (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(MEMORY_INBOX_DIR)) {
      res.json({ files: [] });
      return;
    }
    const files = fs.readdirSync(MEMORY_INBOX_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const stat = fs.statSync(path.join(MEMORY_INBOX_DIR, f));
        const content = fs.readFileSync(path.join(MEMORY_INBOX_DIR, f), 'utf8');
        const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('---')) || f;
        return { filename: f, preview: firstLine.slice(0, 100), size: content.length, createdAt: stat.birthtime.toISOString() };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list inbox' });
  }
});

adminRouter.get('/memory/inbox/:filename', requireAdmin, (req: Request, res: Response) => {
  const filename = (req.params as Record<string, string>).filename;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const filePath = path.join(MEMORY_INBOX_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  res.json({ filename, content, size: content.length, createdAt: stat.birthtime.toISOString() });
});

adminRouter.post('/memory/inbox/:filename/approve', requireAdmin, (req: Request, res: Response) => {
  const filename = (req.params as Record<string, string>).filename;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const srcPath = path.join(MEMORY_INBOX_DIR, filename);
  if (!fs.existsSync(srcPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const destPath = path.join(KNOWLEDGE_DIR, filename);
  if (fs.existsSync(destPath)) {
    res.status(409).json({ error: 'File already exists in knowledge base' });
    return;
  }
  const content = fs.readFileSync(srcPath, 'utf8');
  if (content.length > KNOWLEDGE_MAX_FILE) {
    res.status(400).json({ error: `File exceeds ${KNOWLEDGE_MAX_FILE} char limit` });
    return;
  }
  if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  fs.writeFileSync(destPath, content, 'utf8');
  fs.unlinkSync(srcPath);
  res.json({ success: true, movedTo: destPath });
});

adminRouter.delete('/memory/inbox/:filename', requireAdmin, (req: Request, res: Response) => {
  const filename = (req.params as Record<string, string>).filename;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const filePath = path.join(MEMORY_INBOX_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// GET /admin/memory/:filename - Read memory file (brain-admin only)
adminRouter.get('/memory/:filename', requireAdmin, (req: Request, res: Response) => {
  const filename = req.params.filename as string;
  if (filename.includes('..') || filename.includes('/')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const filePath = path.join('/opt/team-brain/memory', filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.json({ filename, content: fs.readFileSync(filePath, 'utf8') });
});

// PUT /admin/memory/:filename - Edit memory file (brain-admin only)
adminRouter.put('/memory/:filename', requireAdmin, (req: Request, res: Response) => {
  const filename = req.params.filename as string;
  if (filename.includes('..') || filename.includes('/') || !filename.endsWith('.md')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const { content } = req.body;
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  const memDir = '/opt/team-brain/memory';
  const filePath = path.join(memDir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  res.json({ success: true });
});

// GET /admin/reports/:filename - REMOVED (MCP reports are now snapshots/datasets)

// ============================================================
// SYSTEM PROMPTS — read/edit MD files that define Brain behavior
// ============================================================

const SYSTEM_PROMPT_FILES = [
  { id: 'claude-api', path: '/opt/team-brain/CLAUDE-API.md', label: 'CLAUDE-API.md', description: 'Runtime system prompt (loaded at startup)' },
  { id: 'claude-md', path: '/opt/team-brain/CLAUDE.md', label: 'CLAUDE.md', description: 'Dev system prompt (full project context)' },
];

// Dynamically add knowledge files
function getSystemPromptFiles() {
  const files = [...SYSTEM_PROMPT_FILES];
  const knowledgeDir = '/opt/team-brain/knowledge';
  if (fs.existsSync(knowledgeDir)) {
    for (const f of fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md')).sort()) {
      files.push({ id: `knowledge-${f}`, path: path.join(knowledgeDir, f), label: `knowledge/${f}`, description: 'Knowledge file (loaded into system prompt)' });
    }
  }
  return files;
}

// GET /admin/system-prompts - List all system prompt files
adminRouter.get('/system-prompts', requireAdmin, (_req: Request, res: Response) => {
  const files = getSystemPromptFiles().map(f => {
    const exists = fs.existsSync(f.path);
    const stats = exists ? fs.statSync(f.path) : null;
    return {
      id: f.id,
      label: f.label,
      description: f.description,
      size: stats?.size || 0,
      updatedAt: stats?.mtime.toISOString() || null,
    };
  });
  res.json({ files });
});

// GET /admin/system-prompts/:id - Read a system prompt file
adminRouter.get('/system-prompts/:id', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const file = getSystemPromptFiles().find(f => f.id === id);
  if (!file) { res.status(404).json({ error: 'File not found' }); return; }
  if (!fs.existsSync(file.path)) { res.status(404).json({ error: 'File does not exist on disk' }); return; }
  res.json({ id: file.id, label: file.label, content: fs.readFileSync(file.path, 'utf8') });
});

// PUT /admin/system-prompts/:id - Edit a system prompt file
adminRouter.put('/system-prompts/:id', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const file = getSystemPromptFiles().find(f => f.id === id);
  if (!file) { res.status(404).json({ error: 'File not found' }); return; }
  const { content } = req.body;
  if (typeof content !== 'string') { res.status(400).json({ error: 'content is required' }); return; }
  fs.writeFileSync(file.path, content, 'utf8');
  res.json({ success: true });
});

// ============================================================
// AGENTS CRUD — read/write .md files in /opt/team-brain/agents/
// ============================================================

function parseAgentFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const fm: Record<string, any> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      let val: any = kv[2].trim().replace(/^["']|["']$/g, '');
      if (val === 'true') val = true;
      if (val === 'false') val = false;
      // Handle YAML arrays like [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
      }
      fm[kv[1]] = val;
    }
  }
  return { frontmatter: fm, body: match[2] };
}

// GET /admin/agents - List all agents
adminRouter.get('/agents', (_req: Request, res: Response) => {
  if (!fs.existsSync(AGENTS_DIR)) {
    res.json({ agents: [] });
    return;
  }
  const files = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8');
      const { frontmatter } = parseAgentFrontmatter(content);
      const stats = fs.statSync(path.join(AGENTS_DIR, f));
      return {
        filename: f,
        id: f.replace('.md', ''),
        name: frontmatter.name || f.replace('.md', ''),
        description: frontmatter.description || '',
        model: frontmatter.model || 'sonnet',
        visibility: frontmatter.visibility || 'all',
        type: frontmatter.type || 'sub-agent',
        color: frontmatter.color || 'gray',
        tools: frontmatter.tools || [],
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ agents: files });
});

// GET /admin/agents/:id - Read agent file
adminRouter.get('/agents/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (id.includes('..') || id.includes('/')) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const filename = id.endsWith('.md') ? id : `${id}.md`;
  const filePath = path.join(AGENTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseAgentFrontmatter(content);
  res.json({ filename, frontmatter, body, raw: content });
});

// PUT /admin/agents/:id - Update agent file
adminRouter.put('/agents/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (id.includes('..') || id.includes('/')) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const { content } = req.body;
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  const filename = id.endsWith('.md') ? id : `${id}.md`;
  const filePath = path.join(AGENTS_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  res.json({ success: true });
});

// POST /admin/agents - Create new agent
adminRouter.post('/agents', (req: Request, res: Response) => {
  const { id, content } = req.body;
  if (!id || typeof content !== 'string') {
    res.status(400).json({ error: 'id and content are required' });
    return;
  }
  if (id.includes('..') || id.includes('/') || id.includes(' ')) {
    res.status(400).json({ error: 'Invalid id (no spaces, slashes, or ..)' });
    return;
  }
  const filename = id.endsWith('.md') ? id : `${id}.md`;
  const filePath = path.join(AGENTS_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.status(409).json({ error: 'Agent already exists' });
    return;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  res.json({ success: true, filename });
});

// DELETE /admin/agents/:id - Delete agent
adminRouter.delete('/agents/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (id.includes('..') || id.includes('/')) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const filename = id.endsWith('.md') ? id : `${id}.md`;
  const filePath = path.join(AGENTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// ============================================================
// FRAMEWORKS CRUD — read/write .md files in content-frameworks/
// ============================================================

// GET /admin/frameworks - List all frameworks grouped by category
adminRouter.get('/frameworks', (_req: Request, res: Response) => {
  if (!fs.existsSync(FRAMEWORKS_DIR)) {
    res.json({ frameworks: [], grouped: {} });
    return;
  }
  const categories = fs.readdirSync(FRAMEWORKS_DIR).filter(d =>
    fs.statSync(path.join(FRAMEWORKS_DIR, d)).isDirectory()
  );
  const grouped: Record<string, any[]> = {};
  const all: any[] = [];
  for (const cat of categories) {
    const catDir = path.join(FRAMEWORKS_DIR, cat);
    const files = fs.readdirSync(catDir).filter(f => f.endsWith('.md'));
    grouped[cat] = [];
    for (const f of files) {
      const stats = fs.statSync(path.join(catDir, f));
      const content = fs.readFileSync(path.join(catDir, f), 'utf8');
      const firstLine = content.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '') || f.replace('.md', '');
      const item = {
        filename: f,
        path: `${cat}/${f}`,
        category: cat,
        name: firstLine,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      };
      grouped[cat].push(item);
      all.push(item);
    }
  }
  res.json({ frameworks: all, grouped });
});

// GET /admin/frameworks/:category/:filename - Read framework file
adminRouter.get('/frameworks/:category/:filename', (req: Request, res: Response) => {
  const category = req.params.category as string;
  const filename = req.params.filename as string;
  if (category.includes('..') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  const filePath = path.join(FRAMEWORKS_DIR, category, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Framework not found' });
    return;
  }
  res.json({ path: `${category}/${filename}`, content: fs.readFileSync(filePath, 'utf8') });
});

// PUT /admin/frameworks/:category/:filename - Update framework file
adminRouter.put('/frameworks/:category/:filename', (req: Request, res: Response) => {
  const category = req.params.category as string;
  const filename = req.params.filename as string;
  if (category.includes('..') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  const { content } = req.body;
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  const catDir = path.join(FRAMEWORKS_DIR, category);
  if (!fs.existsSync(catDir)) {
    fs.mkdirSync(catDir, { recursive: true });
  }
  fs.writeFileSync(path.join(catDir, filename), content, 'utf8');
  res.json({ success: true });
});

// POST /admin/frameworks - Create new framework
adminRouter.post('/frameworks', (req: Request, res: Response) => {
  const { category, filename, content } = req.body;
  if (!category || !filename || typeof content !== 'string') {
    res.status(400).json({ error: 'category, filename, and content are required' });
    return;
  }
  if (category.includes('..') || filename.includes('..') || category.includes('/') || filename.includes('/')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;
  const catDir = path.join(FRAMEWORKS_DIR, category);
  if (!fs.existsSync(catDir)) {
    fs.mkdirSync(catDir, { recursive: true });
  }
  const filePath = path.join(catDir, safeName);
  if (fs.existsSync(filePath)) {
    res.status(409).json({ error: 'Framework already exists' });
    return;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  res.json({ success: true, path: `${category}/${safeName}` });
});

// DELETE /admin/frameworks/:category/:filename - Delete framework
adminRouter.delete('/frameworks/:category/:filename', (req: Request, res: Response) => {
  const category = req.params.category as string;
  const filename = req.params.filename as string;
  if (category.includes('..') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  const filePath = path.join(FRAMEWORKS_DIR, category, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Framework not found' });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// ============================================================
// DATASETS CRUD — DB + filesystem
// ============================================================

const datasetStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(DATASETS_DIR)) {
      fs.mkdirSync(DATASETS_DIR, { recursive: true });
    }
    cb(null, DATASETS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const unique = crypto.randomBytes(8).toString('hex');
    cb(null, `${unique}${ext}`);
  },
});

const datasetUpload = multer({
  storage: datasetStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx', '.md'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${ext}. Allowed: .csv, .xlsx, .md`));
    }
  },
});

// GET /admin/datasets - List all datasets
adminRouter.get('/datasets', async (_req: Request, res: Response) => {
  const rows = await query(
    `SELECT d.*, u.name as uploader_name FROM datasets d
     LEFT JOIN users u ON d.uploaded_by = u.id
     ORDER BY d.created_at DESC`
  );
  res.json({
    datasets: rows.map(d => ({
      id: d.id,
      filename: d.filename,
      originalName: d.original_name,
      filePath: d.file_path,
      fileType: d.file_type,
      description: d.description,
      rowCount: d.row_count,
      columnNames: d.column_names,
      sizeBytes: Number(d.size_bytes),
      isApproved: d.is_approved,
      uploadedBy: d.uploaded_by,
      uploaderName: d.uploader_name,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })),
  });
});

// POST /admin/datasets/upload - Upload a new dataset
adminRouter.post('/datasets/upload', datasetUpload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  const userId = req.user!.userId;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const description = req.body.description || null;

  // Try to detect row count and columns for CSV
  let rowCount: number | null = null;
  let columnNames: string[] | null = null;
  if (ext === 'csv') {
    try {
      const text = fs.readFileSync(file.path, 'utf8');
      const lines = text.split('\n').filter(l => l.trim());
      rowCount = Math.max(0, lines.length - 1);
      const header = lines[0];
      if (header) {
        columnNames = header.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      }
    } catch { /* ignore */ }
  }

  const result = await queryOne<{ id: string }>(
    `INSERT INTO datasets (filename, original_name, file_path, file_type, description, row_count, column_names, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [file.filename, file.originalname, file.path, ext, description, rowCount, columnNames, file.size, userId]
  );

  res.json({
    success: true,
    dataset: { id: result!.id, filename: file.filename, originalName: file.originalname },
  });
});

// PATCH /admin/datasets/:id - Update dataset (description, approval)
adminRouter.patch('/datasets/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { description, isApproved } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (description !== undefined) {
    updates.push(`description = $${idx++}`);
    params.push(description);
  }
  if (isApproved !== undefined) {
    updates.push(`is_approved = $${idx++}`);
    params.push(isApproved);
  }
  if (updates.length === 0) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  updates.push(`updated_at = NOW()`);
  params.push(id);
  await query(`UPDATE datasets SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  res.json({ success: true });
});

// GET /admin/datasets/:id/preview - Preview dataset content
adminRouter.get('/datasets/:id/preview', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const ds = await queryOne<{ file_path: string; file_type: string; original_name: string }>(
    'SELECT file_path, file_type, original_name FROM datasets WHERE id = $1',
    [id]
  );
  if (!ds) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }
  if (!fs.existsSync(ds.file_path)) {
    res.status(404).json({ error: 'Dataset file missing' });
    return;
  }

  if (ds.file_type === 'csv' || ds.file_type === 'md') {
    const content = fs.readFileSync(ds.file_path, 'utf8');
    const lines = content.split('\n');
    res.json({
      preview: lines.slice(0, 21).join('\n'),
      totalLines: lines.length,
      filename: ds.original_name,
    });
  } else {
    res.json({
      preview: null,
      message: 'Preview not available for XLSX files',
      filename: ds.original_name,
    });
  }
});

// DELETE /admin/datasets/:id - Delete dataset
adminRouter.delete('/datasets/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const ds = await queryOne<{ file_path: string }>('SELECT file_path FROM datasets WHERE id = $1', [id]);
  if (!ds) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }
  if (fs.existsSync(ds.file_path)) {
    fs.unlinkSync(ds.file_path);
  }
  await query('DELETE FROM datasets WHERE id = $1', [id]);
  res.json({ success: true });
});

// ============================================================
// USER FILES (admin view all users' files)
// ============================================================

// GET /admin/user-files - List all user files (admin + team_admin only)
// Security: this exposes every user's files, so it must be gated. Previously it
// had no inline guard (the /admin mount only checks requireAuth), meaning any
// logged-in member could enumerate all files. requireTeamAdmin closes that gap.
adminRouter.get('/user-files', requireTeamAdmin, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;

  const files = await query(
    `SELECT f.*, u.name as user_name FROM user_files f
     LEFT JOIN users u ON f.user_id = u.id
     ORDER BY f.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM user_files');

  res.json({
    files: files.map(f => ({
      id: f.id,
      userId: f.user_id,
      userName: f.user_name,
      filename: f.filename,
      originalName: f.original_name,
      mimeType: f.mime_type,
      size: Number(f.size_bytes),
      conversationId: f.conversation_id,
      isShared: f.is_shared || false,
      createdAt: f.created_at,
    })),
    total: Number(countResult?.count || 0),
  });
});

// DELETE /admin/user-files/:id - Admin delete any user file
adminRouter.delete('/user-files/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const file = await queryOne<{ storage_path: string }>('SELECT storage_path FROM user_files WHERE id = $1', [id]);
  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  if (fs.existsSync(file.storage_path)) {
    fs.unlinkSync(file.storage_path);
  }
  await query('DELETE FROM user_files WHERE id = $1', [id]);
  res.json({ success: true });
});

// ============================================================
// HTML REPORTS (admin view all, manage)
// ============================================================

// GET /admin/html-reports - List all HTML reports across users
adminRouter.get('/html-reports', async (_req: Request, res: Response) => {
  const reports = await query(
    `SELECT r.*, u.name as user_name, s.domain as site_domain
     FROM html_reports r
     LEFT JOIN users u ON r.user_id = u.id
     LEFT JOIN sites s ON r.site_id = s.id
     ORDER BY r.created_at DESC LIMIT 200`
  );
  res.json({
    reports: reports.map(r => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      title: r.title,
      templateType: r.template_type,
      filename: r.filename,
      siteDomain: r.site_domain,
      isPublic: r.is_public,
      shareToken: r.share_token,
      viewUrl: `/reports/html/${r.filename}`,
      createdAt: r.created_at,
    })),
  });
});

// DELETE /admin/html-reports/:id - Admin delete HTML report
adminRouter.delete('/html-reports/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const report = await queryOne<{ file_path: string }>('SELECT file_path FROM html_reports WHERE id = $1', [id]);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  if (fs.existsSync(report.file_path)) {
    fs.unlinkSync(report.file_path);
  }
  await query('DELETE FROM html_reports WHERE id = $1', [id]);
  res.json({ success: true });
});

// POST /admin/html-reports/:id/share - Admin toggle share
adminRouter.post('/html-reports/:id/share', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const report = await queryOne<{ id: string; is_public: boolean; share_token: string | null }>(
    'SELECT id, is_public, share_token FROM html_reports WHERE id = $1',
    [id]
  );
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  const newPublic = !report.is_public;
  const token = newPublic && !report.share_token ? crypto.randomBytes(32).toString('hex') : report.share_token;
  await query('UPDATE html_reports SET is_public = $1, share_token = $2 WHERE id = $3', [newPublic, token, report.id]);
  res.json({
    success: true,
    isPublic: newPublic,
    shareToken: newPublic ? token : null,
    shareUrl: newPublic ? `/api/html-reports/public/${token}` : null,
  });
});

// ============================================================
// Knowledge Base CRUD (admin-only)
// ============================================================
const KNOWLEDGE_DIR = '/opt/team-brain/knowledge';
const KNOWLEDGE_MAX_FILE = 2000; // chars per file
const KNOWLEDGE_MAX_TOTAL = 8000; // total chars across all files

adminRouter.get('/knowledge', requireAdmin, (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      res.json({ files: [], totalChars: 0 });
      return;
    }
    const files = fs.readdirSync(KNOWLEDGE_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8');
        const stat = fs.statSync(path.join(KNOWLEDGE_DIR, f));
        return { filename: f, size: content.length, updatedAt: stat.mtime.toISOString() };
      });
    const totalChars = files.reduce((sum, f) => sum + f.size, 0);
    res.json({ files, totalChars, maxPerFile: KNOWLEDGE_MAX_FILE, maxTotal: KNOWLEDGE_MAX_TOTAL });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list knowledge files' });
  }
});

adminRouter.get('/knowledge/:filename', requireAdmin, (req: Request, res: Response) => {
  const filename = (req.params as Record<string, string>).filename;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const filePath = path.join(KNOWLEDGE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  res.json({ filename, content, size: content.length, updatedAt: stat.mtime.toISOString() });
});

adminRouter.put('/knowledge/:filename', requireAdmin, (req: Request, res: Response) => {
  const filename = (req.params as Record<string, string>).filename;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const { content } = req.body;
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'Content required' });
    return;
  }
  if (content.length > KNOWLEDGE_MAX_FILE) {
    res.status(400).json({ error: `File exceeds ${KNOWLEDGE_MAX_FILE} char limit (${content.length})` });
    return;
  }
  // Check total across all files (excluding current file)
  const otherFiles = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md') && f !== filename);
  const otherChars = otherFiles.reduce((sum, f) => sum + fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8').length, 0);
  if (otherChars + content.length > KNOWLEDGE_MAX_TOTAL) {
    res.status(400).json({ error: `Total would exceed ${KNOWLEDGE_MAX_TOTAL} char limit` });
    return;
  }
  fs.writeFileSync(path.join(KNOWLEDGE_DIR, filename), content, 'utf8');
  res.json({ success: true, size: content.length });
});

adminRouter.post('/knowledge', requireAdmin, (req: Request, res: Response) => {
  const { filename, content } = req.body;
  if (!filename || !filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename (must end with .md)' });
    return;
  }
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'Content required' });
    return;
  }
  if (content.length > KNOWLEDGE_MAX_FILE) {
    res.status(400).json({ error: `File exceeds ${KNOWLEDGE_MAX_FILE} char limit` });
    return;
  }
  const filePath = path.join(KNOWLEDGE_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.status(409).json({ error: 'File already exists' });
    return;
  }
  if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  res.json({ success: true, size: content.length });
});

adminRouter.delete('/knowledge/:filename', requireAdmin, (req: Request, res: Response) => {
  const filename = (req.params as Record<string, string>).filename;
  if (!filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const filePath = path.join(KNOWLEDGE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// GET /admin/metrics/prompt-breakdown - System prompt token breakdown
adminRouter.get('/metrics/prompt-breakdown', requireAdmin, (_req: Request, res: Response) => {
  const breakdown = getSystemPromptBreakdown();
  res.json(breakdown);
});

// POST /admin/brain/reindex - Trigger brain_embeddings reindex from agents/knowledge/brand/memory/templates
// Fire-and-forget: spawns the indexer in the background and returns immediately with the PID.
// Progress visible in pm2 logs or via GET /vector/brain-items count delta.
adminRouter.post('/brain/reindex', requireAdmin, (_req: Request, res: Response) => {
  try {
    const { spawn } = require('child_process') as typeof import('child_process');
    const scriptPath = '/opt/team-brain/apps/brain-api/scripts/brain-embed-index.ts';
    const fallbackPath = '/opt/team-brain/scripts/brain-embed-index.ts';
    const script = fs.existsSync(scriptPath) ? scriptPath : fallbackPath;

    const child = spawn('node', ['--import', 'tsx', script], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    res.json({ success: true, pid: child.pid, script });
  } catch (err) {
    console.error('[admin] brain/reindex spawn failed:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

