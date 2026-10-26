'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { firstAllowedPath } from '@/lib/auth/permissions';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    getCurrentUser().then((u) => router.replace(u ? firstAllowedPath(u) : '/login'));
  }, [router]);
  return <p className="note mt-4">Memuat…</p>;
}
