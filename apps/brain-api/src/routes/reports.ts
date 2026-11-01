import { brainPath } from '../paths';
import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/connection';
import fs from 'fs';
import path from 'path';

const REPORTS_DIR = brainPath('reports', 'mcp');

export const reportsRouter = Router();

// GET /reports - List all reports (visible to all authenticated users)
reportsRouter.get('/', async (req: Request, res: Response) => {
  const typeFilter = req.query.type as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 10, 200);
  const offset = Number(req.query.offset) || 0;

  const conditions: string[] = [];
  const params: any[] = [];
  if (typeFilter) {
    params.push(typeFilter);
    conditions.push(`r.tool_type = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`r.created_at >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo + 'T23:59:59Z');
    conditions.push(`r.created_at <= $${params.length}::timestamptz`);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  params.push(limit, offset);

  const reports = await query(
    `SELECT r.id, r.filename, r.tool_name, r.tool_type, r.size_bytes, r.created_at,
            u.name as user_name
     FROM user_reports r
     JOIN users u ON r.user_id = u.id
     ${whereClause}
     ORDER BY r.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  // Count query
  const countParams = params.slice(0, -2); // remove limit/offset
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM user_reports r JOIN users u ON r.user_id = u.id ${whereClause}`,
    countParams
  );

  res.json({
    reports: reports.map(r => ({
      id: r.id,
      filename: r.filename,
      toolName: r.tool_name,
      toolType: r.tool_type,
      size: Number(r.size_bytes),
      userName: r.user_name,
      createdAt: r.created_at,
    })),
    total: Number(countResult?.count || 0),
  });
});

// GET /reports/:filename - Get report content (any authenticated user)
reportsRouter.get('/:filename', async (req: Request, res: Response) => {
  const rawFilename = req.params.filename as string;
  const filename = path.basename(rawFilename);

  // Prevent path traversal — verify resolved path stays within REPORTS_DIR
  const filePath = path.resolve(REPORTS_DIR, filename);
  if (!filePath.startsWith(REPORTS_DIR)) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  // Verify report exists in database
  const report = await queryOne(
    'SELECT id FROM user_reports WHERE filename = $1',
    [filename]
  );
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Report file not found' });
    return;
  }

  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ filename, content });
  } catch {
    res.status(500).json({ error: 'Failed to parse report' });
  }
});
