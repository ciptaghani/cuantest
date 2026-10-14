// Aturan akses murni (tanpa I/O) supaya mudah diuji.

export type Role = 'ADMIN' | 'STAFF';
export type Menu = 'MARKETPLACE' | 'MARKETING' | 'OPS' | 'FINANCE' | 'CS' | 'DATA';
/** Halaman Akun & akses: khusus admin. */
export type Area = Menu | 'ACCOUNTS';

export const MENUS: { key: Menu; label: string; href: string }[] = [
  { key: 'MARKETPLACE', label: 'Marketplace', href: '/marketplace' },
  { key: 'MARKETING', label: 'Marketing', href: '/marketing' },
  { key: 'OPS', label: 'Operasional', href: '/operasional' },
  { key: 'FINANCE', label: 'Finance', href: '/finance' },
  { key: 'CS', label: 'CS', href: '/cs' },
  { key: 'DATA', label: 'Import / export data', href: '/data/import-export' },
];

export const ALL_MENUS: Menu[] = MENUS.map((m) => m.key);

export interface AccessSubject {
  role: Role;
  active: boolean;
  permissions: Menu[];
}

/** Admin boleh semua (termasuk Akun). Staff hanya menu yang dicentang. User nonaktif tidak boleh apa pun. */
export function canAccess(user: AccessSubject | null | undefined, area: Area): boolean {
  if (!user || !user.active) return false;
  if (user.role === 'ADMIN') return true;
  if (area === 'ACCOUNTS') return false;
  return user.permissions.includes(area);
}

/** Halaman pertama yang boleh dibuka setelah login. */
export function firstAllowedPath(user: AccessSubject): string {
  const m = MENUS.find((x) => canAccess(user, x.key));
  if (m) return m.href;
  return canAccess(user, 'ACCOUNTS') ? '/data/akun' : '/tidak-ada-akses';
}
