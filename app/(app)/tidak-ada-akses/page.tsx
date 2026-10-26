'use client';

import { NoAccess } from '@/components/NoAccess';
import { useCurrentUser } from '@/components/ClientGate';
import { firstAllowedPath } from '@/lib/auth/permissions';

export default function Page() {
  const { user, loading } = useCurrentUser();
  if (loading) return <p className="note mt-4">Memuat…</p>;
  if (!user) return null;
  return firstAllowedPath(user) === '/tidak-ada-akses' ? <NoAccess title="Akun kamu belum diberi akses ke menu apa pun" /> : <NoAccess />;
}
