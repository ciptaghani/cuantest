'use client';

import { canAccess, MENUS } from '@/lib/auth/permissions';
import { useCurrentUser } from '@/components/ClientGate';
import { NavBar, type NavItem } from './NavBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  if (loading) return <p className="note mt-4">Memuat…</p>;
  if (!user) return null;
  const items: NavItem[] = MENUS.filter((m) => m.key !== 'DATA' && canAccess(user, m.key)).map((m) => ({ label: m.label, href: m.href, match: m.href }));
  // Menu Data: Import/export (izin DATA) dan/atau Akun & akses (admin).
  if (canAccess(user, 'DATA')) items.push({ label: 'Data', href: '/data/import-export', match: '/data' });
  else if (canAccess(user, 'ACCOUNTS')) items.push({ label: 'Data', href: '/data/akun', match: '/data' });
  return (
    <>
      <NavBar items={items} userName={user.name} />
      <main className="mx-auto max-w-[1280px] px-4 pb-12 pt-4 sm:px-5">{children}</main>
    </>
  );
}
