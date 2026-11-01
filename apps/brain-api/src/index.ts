import { wwwPath } from './paths';
// Load environment variables FIRST
import './env';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { runMigrations } from './db/migrations';
import { testConnection, query as dbQuery } from './db/connection';
import { requireAuth } from './middleware/auth';
import { publicSettings } from './services/settings';
import { cleanExpiredCache } from './services/mcp-bridge';
import { validateAgentTools } from './services/knowledge';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'https://brain.example.com',
  credentials: true,
}));

// Parse JSON bodies and cookies
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

// The server edition strips /api in nginx. The desktop process serves the
// static chat itself, so it strips the same prefix before the routers.
if (process.env.SEO_BRAIN_DESKTOP === '1') {
  app.use((req, _res, next) => {
    const url = req.url || '';
    if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) {
      const stripped = url.replace(/^\/api/, '') || '/';
      req.url = stripped.startsWith('/') ? stripped : `/${stripped}`;
    }
    next();
  });
}

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/settings/public', (_req, res) => {
  res.json(publicSettings());
});

// Health check with database status + agent validation + AGE probe
// Run S 2026-05-26 (qa-brain-33 + qa-brain-37): surface validation issues
// and Apache AGE extension presence so deploys can see DEGRADED instead
// of guessing from logs.
app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();

  // Agent tool validation issues (set by validateAgentTools() at startup)
  let validationIssues: { agent: string; tool: string }[] = [];
  try {
    const { getAgentValidationIssues } = await import('./services/knowledge');
    validationIssues = getAgentValidationIssues();
  } catch { /* keep [] */ }

  // Apache AGE smoke — confirms extension loadable + knowledge graph exists.
  let ageStatus: 'ready' | 'missing' | 'error' = 'error';
  if (dbConnected) {
    try {
      const { query } = await import('./db/connection');
      const rows = await query<{ name: string }>(
        `SELECT name FROM ag_catalog.ag_graph WHERE name = ANY(ARRAY['hive_kg_graph','hive_graph'])`,
      );
      ageStatus = rows.length > 0 ? 'ready' : 'missing';
    } catch {
      ageStatus = 'error';
    }
  }

  // AGE is an OPTIONAL feature (knowledge_graph_query). It needs `age` in
  // shared_preload_libraries + a postgres restart to be loadable by brain_app; until
  // that deliberate maintenance is done, ageStatus='error' is EXPECTED and must NOT
  // force 'degraded' (that was permanent alarm-fatigue). It's still reported below.
  const overall =
    !dbConnected ? 'degraded' :
    validationIssues.length > 5 ? 'degraded' :
    'ok';

  res.json({
    status: overall,
    timestamp: new Date().toISOString(),
    database: { status: dbConnected ? 'connected' : 'disconnected' },
    mcpBridge: { status: 'enabled' },
    agentValidation: {
      issues: validationIssues.length,
      sample: validationIssues.slice(0, 5),
    },
    apacheAge: { status: ageStatus },
  });
});

// Dynamic import of routers AFTER env is loaded
// Global safety nets — keep brain-api alive instead of crashing on an unawaited
// rejection in some tool path. We log loudly so the failure is visible, but do not
// exit; pm2 (+ the systemd boot unit) handle genuine crashes. Added 2026-06-10 per
// reliability audit — previously a single unhandled rejection could take the process
// down with no top-level guard.
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL-GUARD] Unhandled promise rejection (kept alive):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL-GUARD] Uncaught exception (kept alive):', err);
});

async function start() {
  if (process.env.SEO_BRAIN_DESKTOP === '1') {
    const { startDesktopDatabase } = await import('./db/desktop');
    await startDesktopDatabase();
  }

  // Initialize database
  if (process.env.DATABASE_URL) {
    try {
      await runMigrations();
      console.log('Database: connected and migrations applied');
      const { loadSettings } = await import('./services/settings');
      await loadSettings();
    } catch (error) {
      console.error('Database initialization failed:', error);
      if (process.env.SEO_BRAIN_DESKTOP === '1') throw error;
      console.log('Continuing without database (chat history will not be available)');
    }
  } else {
    console.log('Database: DATABASE_URL not set, skipping');
  }

  const { authRouter } = await import('./routes/auth');
  const { chatRouter } = await import('./routes/chat');
  const { mcpRouter } = await import('./routes/mcp');
  const { historyRouter } = await import('./routes/history');
  const { knowledgeRouter } = await import('./routes/knowledge');
  const { filesRouter } = await import('./routes/files');
  const { adminRouter } = await import('./routes/admin');
  const { reportsRouter } = await import('./routes/reports');
  const { profileRouter } = await import('./routes/profile');
  const { workspaceRouter } = await import('./routes/workspace');
  const { dashboardsRouter } = await import('./routes/dashboards');
  const { teamChatRouter } = await import('./routes/team-chat');
  const { sitesRouter } = await import('./routes/sites');
  const { brandRouter } = await import('./routes/brand');
  const { contentRouter } = await import('./routes/content');
  const { htmlReportsRouter, publicReportRouter } = await import('./routes/html-reports');
  const { searchRouter } = await import('./routes/search');
  const { datasetsRouter } = await import('./routes/datasets');
  const { jobsRouter } = await import('./routes/jobs');
  const { snapshotsRouter } = await import('./routes/snapshots');
  const { docsRouter } = await import('./routes/docs');
  const { brainMemoryRouter } = await import('./routes/brain-memory');
  const { agentsRouter } = await import('./routes/agents');
  const { graphRouter } = await import('./routes/graph');
  const { ageGraphRouter } = await import('./routes/age-graph');
  const { snippetsRouter } = await import('./routes/snippets');

  // Pre-load custom agents cache (non-blocking — migration may not be applied yet)
  const { loadCustomAgentsIntoCache } = await import('./services/custom-agents');
  loadCustomAgentsIntoCache().catch(err =>
    console.warn('[startup] custom-agents cache skipped:', err.message)
  );

  // Pre-load custom personas cache (non-blocking — migration 041 may not be applied yet)
  const { loadCustomPersonasIntoCache } = await import('./services/custom-personas');
  loadCustomPersonasIntoCache().catch(err =>
    console.warn('[startup] custom-personas cache skipped:', err.message)
  );

  // Public routes (no auth required)
  app.use('/auth', authRouter);
  app.use('/html-reports', publicReportRouter); // public share links before auth

  // Run S 2026-05-26 (qa-brain-41) — per-user rate-limit on /chat SSE.
  // 20 requests / minute is roughly 1 active conversation; legit power users
  // who exceed it should batch. Identifies by req.user.userId set by requireAuth,
  // falls back to IP if auth context is somehow missing.
  const erl = await import('express-rate-limit');
  const rateLimit = erl.default;
  const ipKeyGenerator = erl.ipKeyGenerator;
  const chatLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Key by userId (the normal authed case). Fall back to the IPv6-safe helper —
    // a raw req.ip keyGenerator throws ERR_ERL_KEY_GEN_IPV6 in newer versions.
    keyGenerator: (req) => {
      const uid = (req as any).user?.userId;
      return uid ? String(uid) : ipKeyGenerator(req.ip ?? '0.0.0.0');
    },
    message: { success: false, error: 'Rate limit: 20 chats/min/user' },
  });

  // Protected routes (auth required)
  app.use('/chat', requireAuth, chatLimiter, chatRouter);
  app.use('/mcp', requireAuth, mcpRouter);
  app.use('/history', requireAuth, historyRouter);
  app.use('/knowledge', requireAuth, knowledgeRouter);
  app.use('/files', requireAuth, filesRouter);
  app.use('/reports', requireAuth, reportsRouter);
  app.use('/profile', requireAuth, profileRouter);
  app.use('/workspace', requireAuth, workspaceRouter);
  app.use('/admin', requireAuth, adminRouter);
  app.use('/dashboards', requireAuth, dashboardsRouter);
  app.use('/team-chat', requireAuth, teamChatRouter);
  app.use('/sites', requireAuth, sitesRouter);
  app.use('/brand', requireAuth, brandRouter);
  app.use('/content', requireAuth, contentRouter);
  app.use('/html-reports', requireAuth, htmlReportsRouter);
  app.use('/search', requireAuth, searchRouter);
  app.use('/datasets', requireAuth, datasetsRouter);
  app.use('/jobs', requireAuth, jobsRouter);
  app.use('/snapshots', requireAuth, snapshotsRouter);
  app.use('/docs', requireAuth, docsRouter);
  app.use('/brain-memory', requireAuth, brainMemoryRouter);
  app.use('/agents', requireAuth, agentsRouter);

  const { vectorRouter } = await import('./routes/vector');
  app.use('/vector', requireAuth, vectorRouter);
  // Mount /graph/age BEFORE /graph — Express matches in registration order
  // and graphRouter has no /age/* handlers (returns 404 instead of falling through).
  if (process.env.SEO_BRAIN_DESKTOP !== '1') {
    app.use('/graph/age', requireAuth, ageGraphRouter);
  }
  app.use('/graph', requireAuth, graphRouter);
  app.use('/snippets', requireAuth, snippetsRouter);
  const { settingsRouter } = await import('./routes/settings');
  app.use('/admin/settings', settingsRouter);

  // Demos - static HTML files behind auth
  const DEMOS_DIR = wwwPath('demos');
  app.get('/demos/:filename', requireAuth, (req, res) => {
    const filename = path.basename(req.params.filename as string);
    if (!filename.endsWith('.html')) {
      res.status(400).json({ error: 'Only HTML files allowed' });
      return;
    }
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' 'self'; img-src 'self' data: https:; frame-ancestors 'self';"
    );
    res.sendFile(filename, { root: DEMOS_DIR }, (err) => {
      if (err) res.status(404).json({ error: 'Demo not found' });
    });
  });
  app.get('/demos', requireAuth, async (_req, res) => {
    const fs = await import('fs');
    try {
      const files = fs.readdirSync(DEMOS_DIR).filter((f: string) => f.endsWith('.html'));
      res.json({ demos: files.map((f: string) => ({ filename: f, url: `/demos/${f}` })) });
    } catch {
      res.json({ demos: [] });
    }
  });

  // Reconcile orphaned background jobs from previous process (crash / PM2 restart)
  try {
    const orphaned = await dbQuery<{ id: string }>(
      `UPDATE background_jobs
       SET status = 'error', error_message = 'Server restarted while job was running', completed_at = NOW()
       WHERE status IN ('pending', 'running')
       RETURNING id`
    );
    if (orphaned.length > 0) {
      console.log(`[startup] Reconciled ${orphaned.length} orphaned background job(s)`);
    }
  } catch (err) {
    console.error('[startup] Failed to reconcile background jobs:', err);
  }

  // Clean expired MCP cache entries every hour
  setInterval(async () => {
    try {
      const removed = await cleanExpiredCache();
      if (removed > 0) console.log(`[cache] Cleaned ${removed} expired MCP cache entries`);
    } catch (err) {
      console.error('[cache] Cache cleanup failed:', err);
    }
  }, 60 * 60 * 1000); // every hour

  // Clean old completed background jobs every 6 hours
  setInterval(async () => {
    try {
      const result = await dbQuery(
        `DELETE FROM background_jobs WHERE completed_at < NOW() - INTERVAL '7 days'`
      );
      if (result.length > 0) console.log(`[jobs] Cleaned old background jobs`);
      // Also GC expired refresh tokens (otherwise they accumulate forever)
      const rt = await dbQuery(`DELETE FROM refresh_tokens WHERE expires_at < NOW() RETURNING id`);
      if (rt.length > 0) console.log(`[auth] Cleaned ${rt.length} expired refresh tokens`);
    } catch (err) {
      console.error('[jobs] Job cleanup failed:', err);
    }
  }, 6 * 60 * 60 * 1000); // every 6 hours

  // Brain Memory: auto-activate pending memories >7 days (daily at startup + every 24h)
  const { autoActivatePending, runDecay } = await import('./services/brain-memory');
  autoActivatePending().then(n => { if (n > 0) console.log(`[BUM] Auto-activated ${n} pending memories`); }).catch(() => {});
  setInterval(async () => {
    try {
      const n = await autoActivatePending();
      if (n > 0) console.log(`[BUM] Auto-activated ${n} pending memories`);
    } catch (err) { console.error('[BUM] Auto-activate failed:', err); }
  }, 24 * 60 * 60 * 1000); // daily

  // Brain Memory decay is handled by the monthly `ns-memory-decay` pm2 cron job
  // (scripts/night-shift/memory-decay.ts). The previous in-process
  // setInterval(runDecay, 30*24*60*60*1000) was BROKEN: 30 days in ms exceeds the
  // 32-bit signed int max, so Node clamped the interval to 1ms → runDecay fired
  // continuously, fighting auto-activate and thrashing the active set down to ~3.
  // Removed 2026-06-10. (runDecay stays imported for manual/cron use.)
  void runDecay;

  // Start server
  // Validate agent tool references at startup
  validateAgentTools();

  if (process.env.SEO_BRAIN_DESKTOP === '1' && process.env.SEO_BRAIN_CHAT_DIST) {
    const dist = process.env.SEO_BRAIN_CHAT_DIST;
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      const accept = req.headers.accept || '';
      if (!accept.includes('text/html') && accept !== '*/*') return next();
      res.sendFile(path.join(dist, 'index.html'), (err) => (err ? next() : undefined));
    });
  }

  app.listen(PORT, () => {
    console.log(`Brain API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`API Key loaded: ${process.env.ANTHROPIC_API_KEY ? 'YES' : 'NO'}`);
    console.log(`MCP Bridge: enabled`);
    console.log(`Database: ${process.env.DATABASE_URL ? 'configured' : 'not configured'}`);
    console.log(`Auth: JWT ${process.env.JWT_SECRET ? '(custom secret)' : '(default dev secret)'}`);
  });
}

start().catch(console.error);
