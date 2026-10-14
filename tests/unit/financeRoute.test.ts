/** Kriteria terima Fase 2: staff tanpa izin Finance yang memanggil endpoint Finance langsung mendapat 403. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/lib/auth/session';

const current: { user: CurrentUser | null } = { user: null };

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => current.user }));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('redirect');
  },
}));
const ledgerSpy = vi.fn();
vi.mock('@/lib/repo/finance', () => ({
  getLedger: async () => {
    ledgerSpy();
    return { entries: [], accounts: {}, start: '2026-01-01' };
  },
  getFinanceInput: async () => ({ accounts: [] }),
}));

const { GET } = await import('@/app/api/finance/summary/route');

const user = (over: Partial<CurrentUser>): CurrentUser => ({
  id: 'u',
  name: 'U',
  username: 'u',
  role: 'STAFF',
  active: true,
  permissions: [],
  sessionId: 's',
  ...over,
});
const call = () => GET(new Request('http://x/api/finance/summary?from=2026-01-01&to=2026-01-31'), {});

describe('GET /api/finance/summary', () => {
  beforeEach(() => ledgerSpy.mockClear());

  it('401 tanpa sesi', async () => {
    current.user = null;
    expect((await call()).status).toBe(401);
  });

  it('403 untuk staff tanpa izin Finance, dan data tidak dibaca sama sekali', async () => {
    current.user = user({ permissions: ['OPS', 'CS', 'MARKETPLACE'] });
    const res = await call();
    expect(res.status).toBe(403);
    expect(ledgerSpy).not.toHaveBeenCalled();
  });

  it('200 untuk staff dengan izin Finance', async () => {
    current.user = user({ permissions: ['FINANCE'] });
    const res = await call();
    expect(res.status).toBe(200);
    expect(ledgerSpy).toHaveBeenCalled();
  });

  it('200 untuk admin', async () => {
    current.user = user({ role: 'ADMIN' });
    expect((await call()).status).toBe(200);
  });
});
