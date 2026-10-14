import 'server-only';
import { prisma } from '@/lib/db';
import { afterFailure, isLocked, lockMinutesLeft, type AttemptState, type Policy } from './rateLimit';

async function load(key: string): Promise<AttemptState | null> {
  return prisma.loginAttempt.findUnique({ where: { key } });
}

/** Menit tersisa kalau salah satu kunci sedang terkunci, atau 0. */
export async function lockedMinutes(keys: string[], now = new Date()): Promise<number> {
  let max = 0;
  for (const k of keys) {
    const s = await load(k);
    if (isLocked(s, now)) max = Math.max(max, lockMinutesLeft(s, now));
  }
  return max;
}

export async function recordFailure(key: string, policy: Policy, now = new Date()): Promise<void> {
  const next = afterFailure(await load(key), now, policy);
  await prisma.loginAttempt.upsert({ where: { key }, create: { key, ...next }, update: next });
}

export async function clearAttempts(key: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}
