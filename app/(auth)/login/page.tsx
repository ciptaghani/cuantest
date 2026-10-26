'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getCurrentUser } from '@/lib/auth/guard';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  const router = useRouter();
  useEffect(() => {
    getCurrentUser().then((u) => {
      if (u) {
        // firstAllowedPath butuh user penuh; impor dinamis agar halaman tetap statis
        import('@/lib/auth/permissions').then(({ firstAllowedPath }) => router.replace(firstAllowedPath(u)));
      }
    });
  }, [router]);
  return (
    <main className="flex min-h-dvh items-center justify-center p-5">
      <div className="w-full max-w-[360px] rounded-2xl border border-line bg-surf p-[26px]">
        <div className="mb-1.5 flex items-center gap-2.5">
          <Logo />
          <h1 className="text-[22px]">Cuan Lens</h1>
        </div>
        <p className="text-[13px] text-muted">Masuk dengan ID dan password yang diberikan admin.</p>
        <LoginForm />
      </div>
    </main>
  );
}
