import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const docsRouter = Router();

const DOCS_DIR = '/opt/team-brain/docs';

interface DocFile {
  path: string; // relative path from docs/
  name: string;
  category: string; // user, admin, dev
  size: number;
  updatedAt: string;
}

// GET /docs - List all documentation files
docsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const files: DocFile[] = [];
    const categories = ['user', 'admin', 'dev'];

    for (const category of categories) {
      const catDir = path.join(DOCS_DIR, category);
      if (!fs.existsSync(catDir)) continue;

      const entries = fs.readdirSync(catDir).filter(f => f.endsWith('.md'));
      for (const entry of entries) {
        const filePath = path.join(catDir, entry);
        const stats = fs.statSync(filePath);
        files.push({
          path: `${category}/${entry}`,
          name: entry.replace('.md', '').replace(/-/g, ' '),
          category,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
        });
      }
    }

    res.json({ files, count: files.length });
  } catch (err) {
    console.error('[docs] List error:', err);
    res.status(500).json({ error: 'Failed to list docs' });
  }
});

// GET /docs/:category/:filename - Read a specific doc file
docsRouter.get('/:category/:filename', (req: Request, res: Response) => {
  try {
    const category = req.params.category as string;
    const filename = req.params.filename as string;

    // Security: prevent directory traversal
    if (category.includes('..') || filename.includes('..') || filename.includes('/')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const validCategories = ['user', 'admin', 'dev'];
    if (!validCategories.includes(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    const filePath = path.join(DOCS_DIR, category, filename);
    if (!filePath.startsWith(DOCS_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Doc not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);

    res.json({
      path: `${category}/${filename}`,
      name: filename.replace('.md', '').replace(/-/g, ' '),
      category,
      content,
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
    });
  } catch (err) {
    console.error('[docs] Read error:', err);
    res.status(500).json({ error: 'Failed to read doc' });
  }
});
