import { describe, expect, it } from 'vitest';
import { canAccess, firstAllowedPath, type AccessSubject } from '@/lib/auth/permissions';

const admin: AccessSubject = { role: 'ADMIN', active: true, permissions: [] };
const staff: AccessSubject = { role: 'STAFF', active: true, permissions: ['OPS', 'CS'] };

describe('hak akses', () => {
  it('admin boleh semua menu termasuk Akun', () => {
    for (const a of ['MARKETPLACE', 'FINANCE', 'DATA', 'ACCOUNTS'] as const) expect(canAccess(admin, a)).toBe(true);
  });
  it('staff hanya menu yang dicentang, tidak pernah Akun', () => {
    expect(canAccess(staff, 'OPS')).toBe(true);
    expect(canAccess(staff, 'FINANCE')).toBe(false);
    expect(canAccess({ ...staff, permissions: ['DATA'] }, 'ACCOUNTS')).toBe(false);
  });
  it('user nonaktif / tanpa sesi tidak boleh apa pun', () => {
    expect(canAccess({ ...admin, active: false }, 'OPS')).toBe(false);
    expect(canAccess(null, 'OPS')).toBe(false);
  });
  it('halaman pertama setelah login', () => {
    expect(firstAllowedPath(staff)).toBe('/operasional');
    expect(firstAllowedPath({ ...staff, permissions: [] })).toBe('/tidak-ada-akses');
    expect(firstAllowedPath(admin)).toBe('/marketplace');
  });
});
