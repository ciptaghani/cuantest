'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from '@/lib/auth/guard';
import { canAccess, type Area } from '@/lib/auth/permissions';
import { NoAccess } from './NoAccess';

/** Ambil user dari backend Express (cookie httpOnly). Redirect ke /login kalau tidak ada. */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  useEffect(() => {
    let live = true;
    getCurrentUser().then(
      (u) => {
        if (!live) return;
        if (!u) router.replace('/login');
        else setUser(u);
        setLoading(false);
      },
      () => {
        if (!live) return;
        router.replace('/login');
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [router]);
  return { user, loading };
}

/** Guard client: cek izin area ke backend, tanpa request _rsc ke server Next. */
export function ClientGate({ area, children }: { area: Area; children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  if (loading) return <p className="note mt-4">Memeriksa akses…</p>;
  if (!user) return null;
  if (!canAccess(user, area)) return <NoAccess />;
  return <>{children}</>;
}
