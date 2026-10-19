import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, queryOne } from '../db/connection';

// Fail loud in production rather than silently signing/verifying with a public
// default (which would let anyone forge admin tokens if .env failed to load).
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET must be set in production — refusing to start with insecure default'); })()
  : 'brain-dev-secret-change-me');
const ACCESS_TOKEN_EXPIRY = '4h';
const REFRESH_TOKEN_DAYS = 7;

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

// --- Password Hashing ---

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// --- JWT ---

export function generateAccessToken(user: AuthUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role } as TokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// --- Refresh Tokens ---

export async function generateRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return token;
}

export async function verifyRefreshToken(token: string): Promise<string | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const row = await queryOne<{ user_id: string; expires_at: string }>(
    'SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash]
  );

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    // Expired - clean up
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    return null;
  }

  return row.user_id;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

// --- User Lookup ---

export async function findUserByEmail(email: string): Promise<(AuthUser & { password_hash: string | null; is_active: boolean; must_change_password: boolean }) | null> {
  return queryOne<AuthUser & { password_hash: string | null; is_active: boolean; must_change_password: boolean }>(
    'SELECT id, email, name, role, password_hash, is_active, must_change_password FROM users WHERE email = $1',
    [email]
  );
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  return queryOne<AuthUser>(
    'SELECT id, email, name, role FROM users WHERE id = $1 AND is_active = TRUE',
    [id]
  );
}

// --- Auth Flow ---

export async function login(email: string, password: string): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
} | null> {
  const user = await findUserByEmail(email);
  if (!user || !user.password_hash) return null;

  // Reject login for deactivated accounts
  if (user.is_active === false) return null;

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

  // Update last login
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
    refreshToken,
    mustChangePassword: !!user.must_change_password,
  };
}

export async function register(
  email: string,
  password: string,
  name: string,
  role: string = 'member'
): Promise<AuthUser> {
  const passwordHash = await hashPassword(password);

  const existing = await findUserByEmail(email);
  if (existing) {
    // Update existing user with password
    await query(
      'UPDATE users SET password_hash = $1, name = $2, role = $3 WHERE id = $4',
      [passwordHash, name, role, existing.id]
    );
    return { id: existing.id, email, name, role };
  }

  const row = await queryOne<AuthUser>(
    'INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
    [email, name, role, passwordHash]
  );
  return row!;
}

export async function refreshTokens(oldRefreshToken: string): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
} | null> {
  const userId = await verifyRefreshToken(oldRefreshToken);
  if (!userId) return null;

  // Revoke old token (rotation)
  await revokeRefreshToken(oldRefreshToken);

  const user = await findUserById(userId);
  if (!user) return null;

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(userId);

  return { user, accessToken, refreshToken };
}

// --- Token Cleanup ---

export async function cleanupExpiredTokens(): Promise<number> {
  const result = await query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
  return (result as any).length || 0;
}
