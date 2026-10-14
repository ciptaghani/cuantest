import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { firstAllowedPath } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Masuk · Cuan Lens' };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(firstAllowedPath(user));
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
