import { brainPath } from '../paths';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { query, queryOne } from '../db/connection';
import { isAnyAdmin } from '../middleware/auth';
import { generateFile, detectBestFormats, type GenerateFormat } from '../services/file-generator';

const FILES_DIR = process.env.FILES_DIR || brainPath('user-files');

// Ensure base directory exists
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

// Allowed file types
const ALLOWED_MIMES: Record<string, string> = {
  'text/markdown': '.md',
  'text/plain': '.txt',
  'text/html': '.html',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/pdf': '.pdf',
  'text/csv': '.csv',
  'application/json': '.json',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Multer config: store to disk with unique names
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const userId = req.user?.userId || 'anonymous';
    const userDir = path.join(FILES_DIR, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const unique = crypto.randomBytes(8).toString('hex');
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // Allow by extension if mime not in list
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.md', '.txt', '.html', '.xlsx', '.docx', '.pptx', '.pdf', '.csv', '.json'];
    if (ALLOWED_MIMES[file.mimetype] || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype} (${ext})`));
    }
  },
});

export const filesRouter = Router();

// POST /files/upload - Upload a file
filesRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: 'No file provided' });
    return;
  }

  const userId = req.user!.userId;
  const conversationId = req.body.conversationId || null;

  const result = await queryOne<{ id: string }>(
    `INSERT INTO user_files (user_id, conversation_id, filename, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [userId, conversationId, file.filename, file.originalname, file.mimetype, file.size, file.path]
  );

  res.json({
    success: true,
    file: {
      id: result!.id,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    },
  });
});

// GET /files/shared - List files shared by team (MUST be before /:id routes in Express 5)
filesRouter.get('/shared', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const files = await query(
    `SELECT f.id, f.filename, f.original_name, f.mime_type, f.size_bytes, f.created_at,
            f.is_shared, u.name as user_name
     FROM user_files f
     JOIN users u ON f.user_id = u.id
     WHERE f.is_shared = TRUE
     ORDER BY f.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  res.json({
    success: true,
    files: files.map(f => ({
      id: f.id,
      filename: f.filename,
      originalName: f.original_name,
      mimeType: f.mime_type,
      size: Number(f.size_bytes),
      createdAt: f.created_at,
      isShared: f.is_shared,
      userName: f.user_name,
    })),
  });
});

// GET /files - List user's files (with userName and isShared)
filesRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const files = await query(
    `SELECT f.id, f.filename, f.original_name, f.mime_type, f.size_bytes,
            f.conversation_id, f.created_at, f.is_shared, u.name as user_name
     FROM user_files f
     JOIN users u ON f.user_id = u.id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const countResult = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM user_files WHERE user_id = $1',
    [userId]
  );

  res.json({
    success: true,
    files: files.map(f => ({
      id: f.id,
      filename: f.filename,
      originalName: f.original_name,
      mimeType: f.mime_type,
      size: Number(f.size_bytes),
      conversationId: f.conversation_id,
      createdAt: f.created_at,
      isShared: f.is_shared,
      userName: f.user_name,
    })),
    total: Number(countResult?.count || 0),
  });
});

// GET /files/:id/download - Download a file
filesRouter.get('/:id/download', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const fileId = req.params.id;

  // Allow download of own files OR shared files
  const file = await queryOne<{ storage_path: string; original_name: string; mime_type: string }>(
    'SELECT storage_path, original_name, mime_type FROM user_files WHERE id = $1 AND (user_id = $2 OR is_shared = TRUE OR $3::boolean = TRUE)',
    [fileId, userId, isAnyAdmin(req.user?.role)]
  );

  if (!file) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  if (!fs.existsSync(file.storage_path)) {
    res.status(404).json({ success: false, error: 'File missing from storage' });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  fs.createReadStream(file.storage_path).pipe(res);
});

// GET /files/:id/view - View file inline (for iframe embedding of HTML reports)
filesRouter.get('/:id/view', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const fileId = req.params.id as string;

  const file = await queryOne<{ storage_path: string; original_name: string; mime_type: string }>(
    'SELECT storage_path, original_name, mime_type FROM user_files WHERE id = $1 AND (user_id = $2 OR is_shared = TRUE OR $3::boolean = TRUE)',
    [fileId, userId, isAnyAdmin(req.user?.role)]
  );

  if (!file) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  if (!fs.existsSync(file.storage_path)) {
    res.status(404).json({ success: false, error: 'File missing from storage' });
    return;
  }

  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; font-src * data:; style-src 'self' 'unsafe-inline' *;");
  fs.createReadStream(file.storage_path).pipe(res);
});

// GET /files/:id/preview - Preview text-based files
filesRouter.get('/:id/preview', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const fileId = req.params.id;

  // Allow preview of own files OR shared files
  const file = await queryOne<{ storage_path: string; mime_type: string; original_name: string; size_bytes: string }>(
    'SELECT storage_path, mime_type, original_name, size_bytes FROM user_files WHERE id = $1 AND (user_id = $2 OR is_shared = TRUE OR $3::boolean = TRUE)',
    [fileId, userId, isAnyAdmin(req.user?.role)]
  );

  if (!file) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  // Only preview text-based files
  const previewable = ['text/markdown', 'text/plain', 'text/html', 'text/csv', 'application/json'];
  const ext = path.extname(file.original_name).toLowerCase();
  const textExts = ['.md', '.txt', '.html', '.csv', '.json'];

  if (!previewable.includes(file.mime_type) && !textExts.includes(ext)) {
    res.json({
      success: true,
      preview: null,
      message: 'Preview not available for this file type',
      filename: file.original_name,
    });
    return;
  }

  if (!fs.existsSync(file.storage_path)) {
    res.status(404).json({ success: false, error: 'File missing from storage' });
    return;
  }

  // Limit preview to 50KB
  const maxPreview = 50 * 1024;
  const size = Number(file.size_bytes);
  const content = fs.readFileSync(file.storage_path, 'utf8').slice(0, maxPreview);

  res.json({
    success: true,
    preview: content,
    truncated: size > maxPreview,
    filename: file.original_name,
    mimeType: file.mime_type,
  });
});

// POST /files/create - Create a file from text content (from chat outputs, reports, etc.)
filesRouter.post('/create', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { filename, content, mimeType } = req.body as {
    filename: string;
    content: string;
    mimeType?: string;
  };

  if (!filename || !content) {
    res.status(400).json({ success: false, error: 'filename and content are required' });
    return;
  }

  // Validate extension
  const ext = path.extname(filename).toLowerCase();
  const allowedExts = ['.md', '.txt', '.html', '.csv', '.json'];
  if (!allowedExts.includes(ext)) {
    res.status(400).json({ success: false, error: `File extension not allowed: ${ext}. Allowed: ${allowedExts.join(', ')}` });
    return;
  }

  // Sanitize filename
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Write file to disk
  const userDir = path.join(FILES_DIR, userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const unique = crypto.randomBytes(8).toString('hex');
  const diskFilename = `${unique}${ext}`;
  const storagePath = path.join(userDir, diskFilename);

  const buffer = Buffer.from(content, 'utf8');
  fs.writeFileSync(storagePath, buffer);

  const resolvedMime = mimeType || ({
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.csv': 'text/csv',
    '.json': 'application/json',
  } as Record<string, string>)[ext] || 'text/plain';

  const result = await queryOne<{ id: string }>(
    `INSERT INTO user_files (user_id, filename, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, diskFilename, safeName, resolvedMime, buffer.length, storagePath]
  );

  res.json({
    success: true,
    file: {
      id: result!.id,
      filename: diskFilename,
      originalName: safeName,
      mimeType: resolvedMime,
      size: buffer.length,
    },
  });
});

// POST /files/generate - Generate file in any format (DOCX, XLSX, PPTX, HTML, CSV, etc.)
filesRouter.post('/generate', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { content, format, filename } = req.body as {
    content: string;
    format: GenerateFormat;
    filename?: string;
  };

  if (!content || !format) {
    res.status(400).json({ success: false, error: 'content and format are required' });
    return;
  }

  const validFormats: GenerateFormat[] = ['docx', 'xlsx', 'pptx', 'html', 'csv', 'md', 'json', 'txt'];
  if (!validFormats.includes(format)) {
    res.status(400).json({ success: false, error: `Invalid format. Valid: ${validFormats.join(', ')}` });
    return;
  }

  try {
    const result = await generateFile(content, format);

    // Build safe filename
    const baseName = (filename || 'brain-export').replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = baseName.endsWith(result.extension) ? baseName : `${baseName}${result.extension}`;

    // Write to user directory
    const userDir = path.join(FILES_DIR, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const unique = crypto.randomBytes(8).toString('hex');
    const diskFilename = `${unique}${result.extension}`;
    const storagePath = path.join(userDir, diskFilename);

    fs.writeFileSync(storagePath, result.buffer);

    const dbResult = await queryOne<{ id: string }>(
      `INSERT INTO user_files (user_id, filename, original_name, mime_type, size_bytes, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, diskFilename, safeName, result.mimeType, result.buffer.length, storagePath]
    );

    res.json({
      success: true,
      file: {
        id: dbResult!.id,
        filename: diskFilename,
        originalName: safeName,
        mimeType: result.mimeType,
        size: result.buffer.length,
      },
    });
  } catch (err: any) {
    console.error('File generation failed:', err);
    res.status(500).json({ success: false, error: 'File generation failed' });
  }
});

// POST /files/detect-format - Suggest best formats for content
filesRouter.post('/detect-format', (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  const formats = detectBestFormats(content);
  res.json({ formats });
});

// GET /files/:id/content - Get full file content for AI context injection
filesRouter.get('/:id/content', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const fileId = req.params.id;

  // Allow content access for own files OR shared files
  const file = await queryOne<{ storage_path: string; mime_type: string; original_name: string; size_bytes: string }>(
    'SELECT storage_path, mime_type, original_name, size_bytes FROM user_files WHERE id = $1 AND (user_id = $2 OR is_shared = TRUE OR $3::boolean = TRUE)',
    [fileId, userId, isAnyAdmin(req.user?.role)]
  );

  if (!file) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  // Only text files can be injected as context
  const textExts = ['.md', '.txt', '.html', '.csv', '.json'];
  const ext = path.extname(file.original_name).toLowerCase();

  if (!textExts.includes(ext)) {
    res.json({
      success: true,
      content: null,
      filename: file.original_name,
      message: 'Binary file - content not available as text',
    });
    return;
  }

  if (!fs.existsSync(file.storage_path)) {
    res.status(404).json({ success: false, error: 'File missing from storage' });
    return;
  }

  // Limit to 100KB for context injection
  const maxSize = 100 * 1024;
  const content = fs.readFileSync(file.storage_path, 'utf8').slice(0, maxSize);

  res.json({
    success: true,
    content,
    filename: file.original_name,
    truncated: Number(file.size_bytes) > maxSize,
  });
});

// PUT /files/:id/content - Overwrite text file content (owner only, text types only)
filesRouter.put('/:id/content', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const fileId = req.params.id as string;
  const { content } = req.body as { content?: string };

  if (typeof content !== 'string') {
    res.status(400).json({ success: false, error: 'content required' });
    return;
  }

  const file = await queryOne<{ storage_path: string; original_name: string }>(
    'SELECT storage_path, original_name FROM user_files WHERE id = $1 AND user_id = $2',
    [fileId, userId]
  );

  if (!file) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  const textExts = ['.md', '.txt', '.html', '.csv', '.json'];
  const ext = path.extname(file.original_name).toLowerCase();
  if (!textExts.includes(ext)) {
    res.status(400).json({ success: false, error: 'Only text files can be edited' });
    return;
  }

  fs.writeFileSync(file.storage_path, content, 'utf8');
  const size = Buffer.byteLength(content, 'utf8');
  await query('UPDATE user_files SET size_bytes = $1 WHERE id = $2', [size, fileId]);

  res.json({ success: true });
});

// POST /files/:id/share - Toggle file sharing (owner only)
filesRouter.post('/:id/share', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const fileId = req.params.id as string;

  const file = await queryOne<{ is_shared: boolean }>(
    'SELECT is_shared FROM user_files WHERE id = $1 AND user_id = $2',
    [fileId, userId]
  );

  if (!file) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  const newShared = !file.is_shared;
  await query(
    'UPDATE user_files SET is_shared = $1 WHERE id = $2',
    [newShared, fileId]
  );

  res.json({ success: true, isShared: newShared });
});

// DELETE /files/:id - Delete a file
filesRouter.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const fileId = req.params.id;

  const file = await queryOne<{ storage_path: string }>(
    'SELECT storage_path FROM user_files WHERE id = $1 AND user_id = $2',
    [fileId, userId]
  );

  if (!file) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  // Delete from filesystem
  if (fs.existsSync(file.storage_path)) {
    fs.unlinkSync(file.storage_path);
  }

  // Delete from database
  await query('DELETE FROM user_files WHERE id = $1', [fileId]);

  res.json({ success: true });
});
