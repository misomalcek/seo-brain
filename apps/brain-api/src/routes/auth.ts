import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import {
  login,
  register,
  refreshTokens,
  revokeRefreshToken,
  revokeAllUserTokens,
  findUserById,
} from '../services/auth';
import { requireAuth, requireAdmin, requireTeamAdmin, isAnyAdmin } from '../middleware/auth';
import { query as dbQuery, queryOne } from '../db/connection.js';

const VALID_ASSIGNABLE_ROLES = ['member', 'team_admin'] as const;

const adminMutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'Príliš veľa admin operácií, spomaľte' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRouter = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts per IP
  message: { success: false, error: 'Prilis vela pokusov o prihlasenie. Skuste znova o minutu.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /auth/login
authRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' });
      return;
    }

    const result = await login(email, password);
    if (!result) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    // Set cookies
    res.cookie('access_token', result.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 4 * 60 * 60 * 1000, // 4h
    });
    res.cookie('refresh_token', result.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        mustChangePassword: result.mustChangePassword,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// POST /auth/register (admin only)
authRouter.post('/register', requireAuth, requireTeamAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ success: false, error: 'Email, password, and name required' });
      return;
    }

    if (role && !['admin', 'member', 'team_admin'].includes(role)) {
      res.status(400).json({ success: false, error: 'Role must be "admin", "team_admin" or "member"' });
      return;
    }

    // team_admin cannot create admin accounts
    if (role === 'admin' && req.user?.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Only brain-admin can create admin accounts' });
      return;
    }

    const user = await register(email, password, name, role || 'member');
    res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// POST /auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Get refresh token from cookie or body
    const refreshToken = req.body.refreshToken
      || parseCookie(req.headers.cookie, 'refresh_token');

    if (!refreshToken) {
      res.status(401).json({ success: false, error: 'Refresh token required' });
      return;
    }

    const result = await refreshTokens(refreshToken);
    if (!result) {
      // Clear cookies on invalid refresh
      res.clearCookie('access_token', COOKIE_OPTIONS);
      res.clearCookie('refresh_token', COOKIE_OPTIONS);
      res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
      return;
    }

    // Set new cookies
    res.cookie('access_token', result.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 4 * 60 * 60 * 1000,
    });
    res.cookie('refresh_token', result.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
});

// POST /auth/logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.body.refreshToken
      || parseCookie(req.headers.cookie, 'refresh_token');

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.clearCookie('access_token', COOKIE_OPTIONS);
    res.clearCookie('refresh_token', COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.json({ success: true }); // Always succeed logout
  }
});

// GET /auth/me - current user info
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

// GET /auth/users - list all users with token usage + activity
authRouter.get('/users', requireAuth, requireTeamAdmin, async (req: Request, res: Response) => {
  try {
    const users = await dbQuery<{
      id: string; email: string; name: string; role: string;
      is_active: boolean; must_change_password: boolean;
      created_at: string; last_login_at: string | null;
      total_tokens: string; conversations_30d: string;
    }>(
      `SELECT u.id, u.email, u.name, u.role, u.is_active, u.must_change_password,
              u.created_at, u.last_login_at,
              COALESCE(SUM(m.tokens_used), 0)::bigint AS total_tokens,
              COUNT(DISTINCT CASE WHEN c.created_at > NOW() - INTERVAL '30 days' THEN c.id END) AS conversations_30d
       FROM users u
       LEFT JOIN conversations c ON c.user_id = u.id
       LEFT JOIN messages m ON m.conversation_id = c.id
       GROUP BY u.id, u.email, u.name, u.role, u.is_active, u.must_change_password,
                u.created_at, u.last_login_at
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, data: { users } });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ success: false, error: 'Failed to list users' });
  }
});

// PATCH /auth/users/:id - update role, password, or active status
authRouter.patch('/users/:id', requireAuth, requireTeamAdmin, adminMutationLimiter, async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id as string;
    const requesterId = req.user!.userId;

    // Cannot modify own account via this endpoint
    if (targetId === requesterId) {
      res.status(400).json({ success: false, error: 'Vlastný účet upravíte v nastaveniach profilu' });
      return;
    }

    // Block direct password_hash submission
    if (req.body.password_hash !== undefined) {
      res.status(400).json({ success: false, error: 'Priame nastavenie hash nie je povolené' });
      return;
    }

    const { role, password, is_active } = req.body;

    // Validate role if provided
    if (role !== undefined) {
      if (!(VALID_ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
        res.status(400).json({ success: false, error: 'Rola musí byť "member" alebo "team_admin"' });
        return;
      }
    }

    // Fetch target user
    const target = await queryOne<{ id: string; role: string; is_active: boolean }>(
      'SELECT id, role, is_active FROM users WHERE id = $1', [targetId]
    );
    if (!target) {
      res.status(404).json({ success: false, error: 'Používateľ nenájdený' });
      return;
    }

    // Cannot change role of an admin user (only requireAdmin-level)
    if (target.role === 'admin' && req.user?.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Rolu admin používateľa nemôžete zmeniť' });
      return;
    }

    // Build update fields
    const updates: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (role !== undefined) {
      updates.push(`role = $${paramIdx++}`);
      params.push(role);
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ success: false, error: 'Heslo musí mať aspoň 8 znakov' });
        return;
      }
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramIdx++}`, `must_change_password = TRUE`);
      params.push(hash);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      params.push(!!is_active);
      // Invalidate sessions if disabling
      if (!is_active) {
        await dbQuery('DELETE FROM refresh_tokens WHERE user_id = $1', [targetId]);
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'Žiadne zmeny na uloženie' });
      return;
    }

    params.push(targetId);
    const updated = await queryOne<{ id: string; email: string; name: string; role: string; is_active: boolean }>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING id, email, name, role, is_active`,
      params
    );

    res.json({ success: true, data: { user: updated } });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, error: 'Aktualizácia zlyhala' });
  }
});

// DELETE /auth/users/:id - delete user with audit log
authRouter.delete('/users/:id', requireAuth, requireTeamAdmin, adminMutationLimiter, async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id as string;
    const requesterId = req.user!.userId;

    // Cannot delete self
    if (targetId === requesterId) {
      res.status(400).json({ success: false, error: 'Nemôžete zmazať vlastný účet' });
      return;
    }

    // Fetch target user
    const target = await queryOne<{ id: string; email: string; name: string; role: string }>(
      'SELECT id, email, name, role FROM users WHERE id = $1', [targetId]
    );
    if (!target) {
      res.status(404).json({ success: false, error: 'Používateľ nenájdený' });
      return;
    }

    // Cannot delete admin users
    if (target.role === 'admin') {
      res.status(403).json({ success: false, error: 'Admin používateľa nemožno zmazať' });
      return;
    }

    // Last team_admin protection: at least one team_admin must remain
    if (target.role === 'team_admin') {
      const remaining = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM users WHERE role = 'team_admin' AND is_active = TRUE AND id != $1`,
        [targetId]
      );
      if (Number(remaining?.count || 0) === 0 && req.user?.role !== 'admin') {
        res.status(400).json({ success: false, error: 'Nemôžete zmazať posledného team admin používateľa' });
        return;
      }
    }

    // Save audit log with token totals before cascade delete
    await dbQuery(
      `INSERT INTO user_deletions_audit (deleted_user_id, email, name, role, total_tokens, deleted_by_id)
       SELECT u.id, u.email, u.name, u.role,
              COALESCE(SUM(m.tokens_used), 0)::bigint,
              $2
       FROM users u
       LEFT JOIN conversations c ON c.user_id = u.id
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE u.id = $1
       GROUP BY u.id, u.email, u.name, u.role`,
      [targetId, requesterId]
    );

    await dbQuery('DELETE FROM users WHERE id = $1', [targetId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Zmazanie zlyhalo' });
  }
});

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : undefined;
}
