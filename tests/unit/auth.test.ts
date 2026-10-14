import { describe, expect, it } from 'vitest';
import { removesLastAdmin } from '@/lib/auth/accounts';
import { canAccess, firstAllowedPath, type AccessSubject } from '@/lib/auth/permissions';
import { afterFailure, isLocked, USER_POLICY } from '@/lib/auth/rateLimit';

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

describe('rate limit login', () => {
  it('terkunci setelah 5 kali gagal dalam 15 menit, lalu terbuka lagi', () => {
    let s = null;
    const t0 = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 4; i++) s = afterFailure(s, new Date(t0.getTime() + i * 1000), USER_POLICY);
    expect(isLocked(s, new Date(t0.getTime() + 5000))).toBe(false);
    s = afterFailure(s, new Date(t0.getTime() + 5000), USER_POLICY);
    expect(isLocked(s, new Date(t0.getTime() + 6000))).toBe(true);
    expect(isLocked(s, new Date(t0.getTime() + 16 * 60_000))).toBe(false);
  });
  it('jendela waktu reset setelah 15 menit', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    let s = afterFailure(null, t0, USER_POLICY);
    for (let i = 0; i < 3; i++) s = afterFailure(s, t0, USER_POLICY);
    s = afterFailure(s, new Date(t0.getTime() + 16 * 60_000), USER_POLICY);
    expect(s.failures).toBe(1);
  });
});

describe('admin terakhir', () => {
  const users = [
    { id: 'a', role: 'ADMIN' as const, active: true },
    { id: 'b', role: 'STAFF' as const, active: true },
    { id: 'c', role: 'ADMIN' as const, active: false },
  ];
  it('tidak boleh menghapus / menonaktifkan / menurunkan admin aktif terakhir', () => {
    expect(removesLastAdmin(users, { userId: 'a', kind: 'delete' })).toBe(true);
    expect(removesLastAdmin(users, { userId: 'a', kind: 'active', active: false })).toBe(true);
    expect(removesLastAdmin(users, { userId: 'a', kind: 'role', role: 'STAFF' })).toBe(true);
  });
  it('boleh kalau masih ada admin aktif lain', () => {
    const two = [...users, { id: 'd', role: 'ADMIN' as const, active: true }];
    expect(removesLastAdmin(two, { userId: 'a', kind: 'delete' })).toBe(false);
    expect(removesLastAdmin(users, { userId: 'b', kind: 'delete' })).toBe(false);
  });
});
