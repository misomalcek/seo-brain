import { Router } from 'express';
import { query as dbQuery, queryOne } from '../db/connection.js';
import { runBackgroundJob, cancelJob, getRunningJobCount, MAX_CONCURRENT } from '../services/background-runner.js';

export const jobsRouter = Router();

// POST /api/jobs — Start a background job
jobsRouter.post('/', async (req, res) => {
  const userId = (req as any).user?.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { messages, contextItems, personaId, siteId, conversationId, title } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }

  // Per-user concurrency check (max 1 active job per user)
  const userActiveJob = await queryOne<{ id: string }>(
    `SELECT id FROM background_jobs WHERE user_id = $1 AND status IN ('pending', 'running') LIMIT 1`,
    [userId]
  );
  if (userActiveJob) {
    res.status(429).json({
      error: 'user_capacity',
      message: 'Máš už jeden bežiaci background task. Počkaj na jeho dokončenie.',
    });
    return;
  }

  // Global concurrency check (across all users)
  const runningCount = getRunningJobCount();
  if (runningCount >= MAX_CONCURRENT) {
    res.status(429).json({
      error: 'capacity',
      message: `Iné background tasky práve bežia (max ${MAX_CONCURRENT}). Skús o chvíľu.`,
    });
    return;
  }

  const jobTitle = title || (messages[messages.length - 1]?.content?.slice(0, 60) + '...') || 'Background task';

  // Guard: reject oversized payloads before DB write
  const payloadStr = JSON.stringify({ messages, contextItems, personaId, siteId });
  if (payloadStr.length > 2 * 1024 * 1024) { // 2 MB cap
    res.status(400).json({ error: 'Job payload príliš veľký (max 2 MB). Zmenši kontext alebo históriu správ.' });
    return;
  }

  const job = await queryOne<{ id: string }>(
    `INSERT INTO background_jobs (user_id, conversation_id, title, status, request_payload)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING id`,
    [
      userId,
      conversationId || null,
      jobTitle,
      payloadStr,
    ]
  );

  if (!job) {
    res.status(500).json({ error: 'Failed to create job' });
    return;
  }

  // Run async — do NOT await
  setImmediate(() => {
    runBackgroundJob(job.id).catch(err => {
      console.error(`[Jobs] Unhandled error in job ${job.id}:`, err);
    });
  });

  res.json({ jobId: job.id, status: 'pending', title: jobTitle });
});

// GET /api/jobs — List user's recent jobs (polling endpoint)
jobsRouter.get('/', async (req, res) => {
  const userId = (req as any).user?.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const jobs = await dbQuery<{
    id: string;
    title: string;
    status: string;
    conversation_id: string | null;
    tools_used: string[];
    error_message: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  }>(
    `SELECT id, title, status, conversation_id, tools_used, error_message, created_at, started_at, completed_at
     FROM background_jobs
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );

  res.json({ jobs });
});

// GET /api/jobs/:id — Get job status + result
jobsRouter.get('/:id', async (req, res) => {
  const userId = (req as any).user?.userId;
  const jobId = req.params.id as string;

  const job = await queryOne<{
    id: string;
    title: string;
    status: string;
    conversation_id: string | null;
    result_content: string | null;
    tools_used: string[];
    error_message: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  }>(
    `SELECT id, title, status, conversation_id, result_content, tools_used, error_message,
            created_at, started_at, completed_at
     FROM background_jobs WHERE id = $1 AND user_id = $2`,
    [jobId, userId]
  );

  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  res.json({ job });
});

// DELETE /api/jobs/:id — Cancel a job
jobsRouter.delete('/:id', async (req, res) => {
  const userId = (req as any).user?.userId;
  const jobId = req.params.id as string;

  const job = await queryOne<{ status: string }>(
    'SELECT status FROM background_jobs WHERE id = $1 AND user_id = $2',
    [jobId, userId]
  );

  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
    res.status(400).json({ error: 'Job already finished' });
    return;
  }

  // Write cancelled to DB immediately — race-safe regardless of runner crash/restart
  await dbQuery(
    'UPDATE background_jobs SET status = $1, completed_at = NOW() WHERE id = $2',
    ['cancelled', jobId]
  );

  // Also abort in-memory if running (runner's catch block will be a no-op second write)
  cancelJob(jobId);

  res.json({ ok: true, jobId, cancelled: true });
});
