import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/connection';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const DATASETS_DIR = '/opt/team-brain/datasets/custom';

const userDatasetStorage = multer.diskStorage({
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

const userDatasetUpload = multer({
  storage: userDatasetStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for users
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx', '.md'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${ext}. Allowed: .csv, .xlsx, .md`));
    }
  },
});

export const datasetsRouter = Router();

// GET /datasets - List approved datasets
datasetsRouter.get('/', async (_req: Request, res: Response) => {
  const rows = await query(
    `SELECT d.*, u.name as uploader_name FROM datasets d
     LEFT JOIN users u ON d.uploaded_by = u.id
     WHERE d.is_approved = TRUE
     ORDER BY d.created_at DESC`
  );
  res.json({
    datasets: rows.map(d => ({
      id: d.id,
      originalName: d.original_name,
      fileType: d.file_type,
      description: d.description,
      rowCount: d.row_count,
      columnNames: d.column_names,
      sizeBytes: Number(d.size_bytes),
      uploaderName: d.uploader_name,
      createdAt: d.created_at,
    })),
  });
});

// GET /datasets/my - List user's own uploaded datasets (including unapproved)
datasetsRouter.get('/my', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rows = await query(
    `SELECT * FROM datasets WHERE uploaded_by = $1 ORDER BY created_at DESC`,
    [userId]
  );
  res.json({
    datasets: rows.map(d => ({
      id: d.id,
      originalName: d.original_name,
      fileType: d.file_type,
      description: d.description,
      rowCount: d.row_count,
      columnNames: d.column_names,
      sizeBytes: Number(d.size_bytes),
      isApproved: d.is_approved,
      createdAt: d.created_at,
    })),
  });
});

// POST /datasets/upload - User uploads a custom dataset
datasetsRouter.post('/upload', userDatasetUpload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  const userId = req.user!.userId;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const description = req.body.description || null;

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
    `INSERT INTO datasets (filename, original_name, file_path, file_type, description, row_count, column_names, size_bytes, uploaded_by, is_approved)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
     RETURNING id`,
    [file.filename, file.originalname, file.path, ext, description, rowCount, columnNames, file.size, userId]
  );

  res.json({
    success: true,
    dataset: { id: result!.id, filename: file.filename, originalName: file.originalname },
  });
});

// DELETE /datasets/:id - User deletes own dataset
datasetsRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user!.userId;
  const ds = await queryOne<{ file_path: string; uploaded_by: string }>(
    'SELECT file_path, uploaded_by FROM datasets WHERE id = $1',
    [id]
  );
  if (!ds || ds.uploaded_by !== userId) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }
  if (fs.existsSync(ds.file_path)) {
    fs.unlinkSync(ds.file_path);
  }
  await query('DELETE FROM datasets WHERE id = $1', [id]);
  res.json({ success: true });
});

// GET /datasets/:id - Dataset metadata
datasetsRouter.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const d = await queryOne(
    `SELECT d.*, u.name as uploader_name FROM datasets d
     LEFT JOIN users u ON d.uploaded_by = u.id
     WHERE d.id = $1 AND d.is_approved = TRUE`,
    [id]
  );
  if (!d) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }
  res.json({
    id: d.id,
    originalName: d.original_name,
    fileType: d.file_type,
    description: d.description,
    rowCount: d.row_count,
    columnNames: d.column_names,
    sizeBytes: Number(d.size_bytes),
    uploaderName: d.uploader_name,
    createdAt: d.created_at,
  });
});

// GET /datasets/:id/preview - First 20 rows
datasetsRouter.get('/:id/preview', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user!.userId;
  const ds = await queryOne<{ file_path: string; file_type: string; original_name: string; is_approved: boolean; uploaded_by: string }>(
    'SELECT file_path, file_type, original_name, is_approved, uploaded_by FROM datasets WHERE id = $1',
    [id]
  );
  // Allow if approved OR if user owns it
  if (!ds || (!ds.is_approved && ds.uploaded_by !== userId)) {
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
    res.json({ preview: null, message: 'Preview not available for XLSX', filename: ds.original_name });
  }
});

// GET /datasets/:id/content - Full content as text for context injection
datasetsRouter.get('/:id/content', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user!.userId;
  const ds = await queryOne<{ file_path: string; file_type: string; original_name: string; is_approved: boolean; uploaded_by: string; size_bytes: string }>(
    'SELECT file_path, file_type, original_name, is_approved, uploaded_by, size_bytes FROM datasets WHERE id = $1',
    [id]
  );
  // Allow if approved OR if user owns it
  if (!ds || (!ds.is_approved && ds.uploaded_by !== userId)) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }
  if (!fs.existsSync(ds.file_path)) {
    res.status(404).json({ error: 'Dataset file missing' });
    return;
  }
  if (ds.file_type === 'xlsx') {
    res.json({ content: null, filename: ds.original_name, message: 'XLSX not available as text' });
    return;
  }
  const maxSize = 200 * 1024;
  const content = fs.readFileSync(ds.file_path, 'utf8').slice(0, maxSize);
  res.json({
    content,
    filename: ds.original_name,
    truncated: Number(ds.size_bytes) > maxSize,
  });
});
