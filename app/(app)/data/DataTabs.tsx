import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { canAccess } from '@/lib/auth/permissions';

/** Sub-menu Data: hanya tab yang boleh dibuka user ini. */
export async function DataTabs() {
  const user = await requireUser();
  const tabs = [
    canAccess(user, 'DATA') && { href: '/data/import-export', label: 'Import / export' },
    canAccess(user, 'ACCOUNTS') && { href: '/data/akun', label: 'Akun & akses' },
  ].filter((t): t is { href: string; label: string } => !!t);
  if (tabs.length < 2) return null;
  return (
    <div className="mb-4 flex gap-2">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="btn-ghost btn-sm">
          {t.label}
        </Link>
      ))}
    </div>
  );
}
