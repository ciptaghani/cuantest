import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/lib/auth/session';

const current: { user: CurrentUser | null } = { user: null };

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => current.user }));
vi.mock('@/lib/repo/cache', () => ({
  invalidate: vi.fn(),
  TAGS: { marketplace: 'marketplace', ops: 'ops', finance: 'finance' },
}));

const mockImportOrders = vi.fn().mockResolvedValue({
  imported: 2,
  skipped: 0,
  errors: [],
  notes: ['2 pesanan baru'],
});

vi.mock('@/lib/repo/imports', () => ({
  importOrders: (...args: unknown[]) => mockImportOrders(...args),
  ImportError: class extends Error {},
}));

const { POST } = await import('@/app/api/import/[kind]/route');

const adminUser: CurrentUser = {
  id: 'u-admin',
  name: 'Admin',
  username: 'admin',
  role: 'ADMIN',
  active: true,
  permissions: [],
  sessionId: 's-admin',
};

describe('POST /api/import/[kind] batched rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    current.user = adminUser;
  });

  it('menolak jika token dan rows sama-sama tidak dikirim', async () => {
    const req = new Request('http://localhost/api/import/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping: { orderId: 'No' }, params: { storeId: 'st1' } }),
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'orders' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/baris atau token/);
  });

  it('berhasil memproses rows langsung tanpa token staging', async () => {
    const rows = [
      { row: 2, cells: { No: 'ORD-1', Tgl: '2026-03-01 10:00', Produk: 'Parfum', Sku: 'A-1', Qty: 1, Sub: 50000 } },
      { row: 3, cells: { No: 'ORD-2', Tgl: '2026-03-01 11:00', Produk: 'Parfum', Sku: 'A-2', Qty: 2, Sub: 100000 } },
    ];
    const mapping = {
      orderId: 'No',
      date: 'Tgl',
      name: 'Produk',
      sku: 'Sku',
      qty: 'Qty',
      subtotal: 'Sub',
    };
    const req = new Request('http://localhost/api/import/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows,
        headers: ['No', 'Tgl', 'Produk', 'Sku', 'Qty', 'Sub'],
        mapping,
        params: { storeId: 'st1' },
        batchIndex: 0,
        totalBatches: 2,
        isFinal: false,
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'orders' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.imported).toBe(2);
    expect(mockImportOrders).toHaveBeenCalledWith('st1', expect.anything(), { isFinal: false });
  });
});
