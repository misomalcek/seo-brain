import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../db/connection';

export const profileRouter = Router();

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { success: false, error: 'Príliš veľa pokusov o zmenu hesla, skúste o 15 minút' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /profile/stats - Personal stats for current user
profileRouter.get('/stats', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const [conversations, messages, files, filesSize, reports, deliberations, favoritePersona, userInfo, tokenUsage] =
    await Promise.all([
      queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM conversations WHERE user_id = $1',
        [userId]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.user_id = $1`,
        [userId]
      ),
      queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM user_files WHERE user_id = $1',
        [userId]
      ),
      queryOne<{ total: string }>(
        'SELECT COALESCE(SUM(size_bytes), 0) as total FROM user_files WHERE user_id = $1',
        [userId]
      ),
      queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM user_reports WHERE user_id = $1',
        [userId]
      ),
      queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM persona_deliberations WHERE user_id = $1',
        [userId]
      ),
      queryOne<{ persona_id: string }>(
        `SELECT m.persona_id FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.user_id = $1 AND m.persona_id IS NOT NULL
         GROUP BY m.persona_id
         ORDER BY COUNT(*) DESC LIMIT 1`,
        [userId]
      ),
      queryOne<{ created_at: string; last_login_at: string | null; email: string; name: string; role: string }>(
        'SELECT created_at, last_login_at, email, name, role FROM users WHERE id = $1',
        [userId]
      ),
      queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(m.tokens_used), 0)::bigint as total
         FROM messages m JOIN conversations c ON m.conversation_id = c.id
         WHERE c.user_id = $1`,
        [userId]
      ),
    ]);

  res.json({
    conversations: Number(conversations?.count || 0),
    messages: Number(messages?.count || 0),
    files: Number(files?.count || 0),
    filesSize: Number(filesSize?.total || 0),
    reports: Number(reports?.count || 0),
    deliberations: Number(deliberations?.count || 0),
    favoritePersona: favoritePersona?.persona_id || null,
    memberSince: userInfo?.created_at || '',
    lastLogin: userInfo?.last_login_at || null,
    email: userInfo?.email || '',
    name: userInfo?.name || '',
    role: userInfo?.role || '',
    totalTokens: Number(tokenUsage?.total || 0),
  });
});

// POST /profile/change-password - change own password
profileRouter.post('/change-password', changePasswordLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Vyžaduje sa aktuálne a nové heslo' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'Nové heslo musí mať aspoň 8 znakov' });
      return;
    }

    const user = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1', [userId]
    );
    if (!user) {
      res.status(404).json({ success: false, error: 'Používateľ nenájdený' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Aktuálne heslo je nesprávne' });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [hash, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Zmena hesla zlyhala' });
  }
});

// PATCH /profile/name — change displayed name (#12, 2026-04-29)
// User can rename themselves; visible in team chat + headers across UI.
profileRouter.patch('/name', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const newName = String((req.body?.name || '')).trim();
  if (!newName || newName.length < 2 || newName.length > 60) {
    res.status(400).json({ success: false, error: 'Meno musí mať 2–60 znakov' });
    return;
  }
  try {
    const result = await query<{ id: string; name: string }>(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name',
      [newName, userId]
    );
    if (!result[0]) { res.status(404).json({ success: false, error: 'User nenájdený' }); return; }
    res.json({ success: true, user: result[0] });
  } catch (error) {
    console.error('[profile/name] update failed:', error);
    res.status(500).json({ success: false, error: 'Zmena mena zlyhala' });
  }
});
