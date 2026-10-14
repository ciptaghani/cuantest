import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import type { AccessSubject, Menu, Role } from './permissions';

export const SESSION_COOKIE = 'cl_session';
export const SESSION_DAYS = 30;

export interface CurrentUser extends AccessSubject {
  id: string;
  name: string;
  username: string;
  role: Role;
  permissions: Menu[];
  sessionId: string;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Buat session baru di database dan pasang cookie httpOnly. Hanya di server action / route handler. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.create({ data: { sessionToken: hashToken(token), userId, expires } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { sessionToken: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** User yang sedang login (dicek ke database di setiap request), atau null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { sessionToken: hashToken(token) },
    include: { user: { include: { permissions: true } } },
  });
  if (!s || s.expires < new Date() || !s.user.active) return null;
  return {
    id: s.user.id,
    name: s.user.name,
    username: s.user.username,
    role: s.user.role,
    active: s.user.active,
    permissions: s.user.permissions.map((p) => p.menu),
    sessionId: s.id,
  };
});
