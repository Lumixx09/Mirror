import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { getPrisma, type User } from '@mirror/db';
import { computeSha256 } from '@mirror/shared';

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>;

export const SESSION_COOKIE = 'mirror_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;

export interface AuthedRequest extends Request {
  user: Pick<User, 'id' | 'email' | 'name'>;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Passwords: scrypt with a per-password random salt; parameters stored with the hash.
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_PARAMS.maxmem
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// A fixed hash used to equalize timing when the account does not exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex')));

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const PasswordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use letters and at least one number');

export const RegisterSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
  password: PasswordSchema
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(200)
});

export const UpdateAccountSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function hashToken(token: string): string {
  return computeSha256(token);
}

export async function createSession(userId: string, req: Request) {
  const token = crypto.randomBytes(32).toString('base64url');
  const session = await getPrisma().authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
      ipAddress: req.ip ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    }
  });
  return { token, session };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/'
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
}

/** Resolve a session token to its user; expired or revoked sessions are rejected. */
export async function resolveSession(token: string | undefined) {
  if (!token || token.length > 200) return null;
  const session = await getPrisma().authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true } } }
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  return session;
}

/** Parse the session cookie from a raw Cookie header (used for WebSocket upgrades). */
export function tokenFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await resolveSession(req.cookies?.[SESSION_COOKIE]);
      if (!session) {
        return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
      }
      (req as AuthedRequest).user = session.user;
      (req as AuthedRequest).sessionId = session.id;
      // Sliding activity timestamp, written at most once per minute.
      if (Date.now() - session.lastUsedAt.getTime() > 60_000) {
        void getPrisma().authSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * CSRF defence for cookie-authenticated requests: state-changing methods must carry the
 * custom header the SPA always sends. Browsers cannot attach it cross-site without CORS approval.
 */
export function requireCsrfHeader() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('x-mirror-client') !== 'web') {
      return res.status(403).json({ error: { code: 'CSRF_REJECTED', message: 'Missing client header.' } });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Login throttling: per IP and per account, fixed window.
// ---------------------------------------------------------------------------

const attempts = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 30;
const MAX_PER_ACCOUNT = 8;

export function loginThrottled(ip: string, email: string): boolean {
  const now = Date.now();
  const check = (key: string, max: number) => {
    const entry = attempts.get(key);
    if (!entry || entry.reset < now) return false;
    return entry.count >= max;
  };
  return check(`ip:${ip}`, MAX_PER_IP) || check(`acct:${email}`, MAX_PER_ACCOUNT);
}

export function recordLoginFailure(ip: string, email: string) {
  const now = Date.now();
  for (const key of [`ip:${ip}`, `acct:${email}`]) {
    const entry = attempts.get(key);
    if (!entry || entry.reset < now) attempts.set(key, { count: 1, reset: now + WINDOW_MS });
    else entry.count++;
  }
}

export function clearLoginFailures(email: string) {
  attempts.delete(`acct:${email}`);
}

export { getDummyHash };
