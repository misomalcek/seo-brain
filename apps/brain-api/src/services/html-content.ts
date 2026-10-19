import fs from 'fs';
import path from 'path';
import { Response } from 'express';

const ALLOWED_DIRS = [
  '/var/www/brain/reports/html/',
  '/var/www/brain/reports/dashboards/',
  '/var/www/brain/demos/',
];

const HTML_CSP = "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' 'self'; img-src 'self' data: https:; frame-ancestors 'self';";

/**
 * Unified HTML file serving with security headers and directory whitelist.
 * Replaces scattered fs.createReadStream() calls across routes.
 */
export function serveHtmlFile(filePath: string, res: Response, opts: { cache?: boolean } = {}): void {
  const resolved = path.resolve(filePath);

  if (!ALLOWED_DIRS.some(dir => resolved.startsWith(dir))) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', HTML_CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (opts.cache) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }

  fs.createReadStream(resolved).pipe(res);
}
