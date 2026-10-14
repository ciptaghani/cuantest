'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { clearAttempts, lockedMinutes, recordFailure } from '@/lib/auth/loginAttempts';
import { verifyPassword } from '@/lib/auth/password';
import { firstAllowedPath } from '@/lib/auth/permissions';
import { IP_POLICY, USER_POLICY } from '@/lib/auth/rateLimit';
import { createSession, destroySession } from '@/lib/auth/session';

export interface LoginState {
  error: string;
}

const LoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Isi ID').max(64),
  password: z.string().min(1, 'Isi password').max(200),
});

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({ username: form.get('username'), password: form.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Isi ID dan password.' };
  const { username, password } = parsed.data;

  const ipKey = `ip:${await clientIp()}`;
  const userKey = `user:${username}`;
  const wait = await lockedMinutes([ipKey, userKey]);
  if (wait) return { error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${wait} menit.` };

  const user = await prisma.user.findUnique({ where: { username }, include: { permissions: true } });
  const ok = await verifyPassword(password, user?.active ? user.passwordHash : null);
  if (!user || !user.active || !ok) {
    await recordFailure(ipKey, IP_POLICY);
    await recordFailure(userKey, USER_POLICY);
    return { error: 'ID atau password salah.' };
  }
  await clearAttempts(userKey);
  await createSession(user.id);
  redirect(firstAllowedPath({ role: user.role, active: user.active, permissions: user.permissions.map((p) => p.menu) }));
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect('/login');
}
