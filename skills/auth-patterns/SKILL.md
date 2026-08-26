---
name: auth-patterns
description: Auth patterns for your API — JWT access tokens, hashed refresh token rotation, Google OAuth popup flow, Express auth middleware, bcrypt password hashing, and role-based access control. Use when building or modifying authentication, session management, or protected routes.
origin: custom
---

# Auth Patterns

JWT + refresh token rotation, Google OAuth, and Express middleware patterns for your app.

## When to Activate

- Adding or modifying login, registration, or OAuth endpoints
- Writing auth middleware or role guards
- Implementing token refresh or revocation logic
- Debugging 401/403 errors
- Reviewing any route that touches `req.user` or session state

## Token Architecture

```
Access token  — short-lived JWT (15m), stateless, sent as Bearer header
Refresh token — long-lived (30d), stored hashed in DB (RefreshToken table), rotated on use
```

Never store the raw refresh token — store its SHA-256 hash.

## JWT Utilities

```typescript
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET = process.env.JWT_SECRET!;

export function signAccessToken(userId: string, role: string) {
  return jwt.sign({ sub: userId, role }, ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken() {
  const token = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export function verifyAccessToken(token: string): { sub: string; role: string } {
  return jwt.verify(token, ACCESS_SECRET) as { sub: string; role: string };
}
```

## Refresh Token Rotation

```typescript
// POST /api/auth/refresh
async function refresh(req: Request, res: Response) {
  const incoming = req.cookies.refreshToken ?? req.body.refreshToken;
  if (!incoming) return res.status(401).json({ error: 'No refresh token' });

  const hash = crypto.createHash('sha256').update(incoming).digest('hex');

  const stored = await prisma.refreshToken.findFirst({
    where: { tokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!stored) return res.status(401).json({ error: 'Invalid or expired token' });

  // Rotate: revoke old, issue new in one transaction
  const { token: newRaw, hash: newHash } = signRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: newHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  const accessToken = signAccessToken(stored.userId, stored.user.role);
  res.json({ accessToken, refreshToken: newRaw });
}
```

## Auth Middleware

```typescript
import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user: { id: string; role: string };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    (req as AuthRequest).user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthRequest).user;
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}
```

## Google OAuth (Popup Flow)

The popup must always show account chooser — `prompt: 'select_account'` is required on every call.

```typescript
// Server: verify Google ID token
import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function verifyGoogleToken(idToken: string) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload()!;
  return {
    googleId: payload.sub,
    email: payload.email!,
    firstName: payload.given_name,
    lastName: payload.family_name,
  };
}

// POST /api/auth/google
async function googleLogin(req: Request, res: Response) {
  const { idToken } = req.body;
  const profile = await verifyGoogleToken(idToken);

  const user = await prisma.user.upsert({
    where: { googleId: profile.googleId },
    create: { email: profile.email, googleId: profile.googleId, firstName: profile.firstName, lastName: profile.lastName },
    update: { email: profile.email },
  });

  const accessToken = signAccessToken(user.id, user.role);
  const { token: refreshRaw, hash: refreshHash } = signRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: refreshHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });

  res.json({ accessToken, refreshToken: refreshRaw, user: { id: user.id, role: user.role } });
}
```

```tsx
// Frontend: always force account picker
import { useGoogleLogin } from '@react-oauth/google';

const login = useGoogleLogin({
  onSuccess: async (response) => {
    await fetch('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken: response.credential }),
    });
  },
  flow: 'implicit',
  prompt: 'select_account',   // forces account picker every time — do not remove
});
```

## Password Hashing

```typescript
import bcrypt from 'bcrypt';
const ROUNDS = 12;
export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
```

## Security Checklist

- [ ] Access tokens expire in ≤ 15 minutes
- [ ] Refresh tokens are SHA-256 hashed before DB storage (never raw)
- [ ] Refresh tokens are rotated on every use (old one revoked in same transaction)
- [ ] Google OAuth uses `prompt: 'select_account'` on every trigger
- [ ] Admin routes stack `requireAuth` then `requireAdmin`
- [ ] Rate limit `/api/auth/login` and `/api/auth/register`
- [ ] `JWT_SECRET` is a long random secret — not a word or phrase
- [ ] No auth state stored in `localStorage` — access token in memory, refresh in httpOnly cookie
