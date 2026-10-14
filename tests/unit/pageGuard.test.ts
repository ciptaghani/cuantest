/**
 * Setiap halaman menu wajib memanggil `await requireArea(area)` sebelum memuat data.
 * `<AreaGate>` di layout saja tidak cukup: Next.js merender page paralel dengan layout,
 * sehingga isi page tetap terkirim ke browser walaupun layout menampilkan "tidak punya akses".
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/lib/auth/session';

const ROOT = join(process.cwd(), 'app', '(app)');

/** Area per folder menu (prefix terpanjang menang). */
const AREA_OF: [string, string][] = [
  ['data/akun', 'ACCOUNTS'],
  ['data', 'DATA'],
  ['marketplace', 'MARKETPLACE'],
  ['marketing', 'MARKETING'],
  ['operasional', 'OPS'],
  ['finance', 'FINANCE'],
  ['cs', 'CS'],
];

/** Halaman tanpa data: hanya redirect, atau halaman umum untuk semua user yang login. */
const EXEMPT = new Set(['page.tsx', 'tidak-ada-akses/page.tsx', 'marketplace/page.tsx', 'marketing/page.tsx', 'operasional/page.tsx', 'finance/page.tsx', 'cs/page.tsx']);

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? pages(p) : f === 'page.tsx' ? [p] : [];
  });
}

describe('penjagaan izin di setiap halaman', () => {
  const all = pages(ROOT).map((p) => relative(ROOT, p).split(sep).join('/'));

  it('menemukan halaman menu', () => {
    expect(all.length).toBeGreaterThan(15);
  });

  for (const rel of all) {
    if (EXEMPT.has(rel)) {
      it(`${rel}: hanya redirect / tanpa data`, () => {
        const src = readFileSync(join(ROOT, rel), 'utf8');
        expect(src).not.toMatch(/prisma|getOpsModel|getMarketplace|loadM[kp]|getLedger/);
      });
      continue;
    }
    it(`${rel}: requireArea dipanggil pertama dengan area yang benar`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      const area = AREA_OF.find(([prefix]) => rel.startsWith(prefix + '/'))?.[1];
      expect(area, 'folder menu belum dipetakan ke area').toBeTruthy();
      const body = src.slice(src.indexOf('export default'));
      const first = body.match(/await\s+(\w+)\(([^)]*)\)/);
      expect(first?.[1]).toBe('requireArea');
      expect(first?.[2]).toBe(`'${area}'`);
    });
  }
});

describe('requireArea', () => {
  it('mengalihkan user tanpa izin ke /tidak-ada-akses dan meloloskan yang berizin', async () => {
    const current: { user: CurrentUser | null } = { user: null };
    vi.doMock('@/lib/auth/session', () => ({ getCurrentUser: async () => current.user }));
    vi.doMock('next/navigation', () => ({
      redirect: (to: string) => {
        throw new Error('redirect:' + to);
      },
    }));
    const { requireArea } = await import('@/lib/auth/guard');
    await expect(requireArea('OPS')).rejects.toThrow('redirect:/login');
    current.user = { id: 'u', name: 'CS', username: 'cs', role: 'STAFF', active: true, sessionId: 's', permissions: ['CS'] };
    await expect(requireArea('OPS')).rejects.toThrow('redirect:/tidak-ada-akses');
    current.user = { id: 'u', name: 'Gudang', username: 'g', role: 'STAFF', active: true, sessionId: 's', permissions: ['OPS'] };
    await expect(requireArea('OPS')).resolves.toMatchObject({ id: 'u' });
  });
});
