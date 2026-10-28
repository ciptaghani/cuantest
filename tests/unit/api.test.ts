/** Klien browser → backend Express langsung (cookie JWT otomatis via credentials:include). */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { apiFetch, backendUrl } = await import('@/lib/api');
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

describe('backendUrl', () => {
  it('menggabung base + path', () => {
    expect(backendUrl('/api/ops/model')).toBe(`${BASE}/api/ops/model`);
    expect(backendUrl('api/ops/model')).toBe(`${BASE}/api/ops/model`);
  });
});

describe('apiFetch', () => {
  beforeEach(() => fetchMock.mockReset());
  it('memakai credentials:include dan melempar pesan error backend', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, a: 1 }), { status: 200 }));
    await expect(apiFetch<{ a: number }>('/x')).resolves.toEqual({ ok: true, a: 1 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/x`);
    expect(init.credentials).toBe('include');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Kamu tidak punya akses.' }), { status: 403 }));
    await expect(apiFetch('/x')).rejects.toThrow('Kamu tidak punya akses.');
  });
});
