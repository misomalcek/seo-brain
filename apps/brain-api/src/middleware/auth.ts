import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type TokenPayload } from '../services/auth';

// Extend Express Request with user info
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Middleware that requires a valid JWT access token.
 * Extracts token from Authorization header (Bearer <token>)
 * or from 'access_token' cookie.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Try Authorization header first
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Fallback to cookie
  if (!token) {
    token = parseCookie(req.headers.cookie, 'access_token');
  }

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Middleware that requires admin role.
 *
 * Handoff dohoda 2026-06-30 (CEO-confirmed): team_admin gets ALL the same
 * permissions as brain-admin — no separate tier. The two roles still exist
 * as labels (so we can tell users apart in logs/UI), but the gate treats
 * them as equivalent. Previously requireAdmin was admin-only (memory/
 * system routes); now it admits both, matching requireTeamAdmin.
 *
 * Must be used after requireAuth.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'team_admin') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * Alias kept for routes already declaring intent as "team_admin OK".
 * Identical behaviour to requireAdmin after the 2026-06-30 elevation.
 */
export function requireTeamAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'team_admin') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
}

/** Helper: check if current user has any admin-level role */
export function isAnyAdmin(role?: string): boolean {
  return role === 'admin' || role === 'team_admin';
}

/**
 * Optional auth - attaches user if token present, but doesn't block.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  if (!token) {
    token = parseCookie(req.headers.cookie, 'access_token');
  }

  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : undefined;
}
