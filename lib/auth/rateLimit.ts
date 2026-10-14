// Kebijakan rate limit percobaan login. Logika murni di sini; penyimpanan di tabel LoginAttempt.

export interface AttemptState {
  failures: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

export interface Policy {
  /** Gagal sebanyak ini dalam jendela waktu → dikunci. */
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}

export const USER_POLICY: Policy = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
export const IP_POLICY: Policy = { maxFailures: 20, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

export function isLocked(state: AttemptState | null, now: Date): boolean {
  return !!state?.lockedUntil && state.lockedUntil > now;
}

/** State baru setelah satu kali gagal. */
export function afterFailure(state: AttemptState | null, now: Date, p: Policy): AttemptState {
  const fresh = !state || now.getTime() - state.windowStart.getTime() > p.windowMs;
  const failures = fresh ? 1 : state.failures + 1;
  const windowStart = fresh ? now : state.windowStart;
  return { failures, windowStart, lockedUntil: failures >= p.maxFailures ? new Date(now.getTime() + p.lockMs) : null };
}

export function lockMinutesLeft(state: AttemptState | null, now: Date): number {
  if (!state?.lockedUntil) return 0;
  return Math.max(1, Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 60_000));
}
