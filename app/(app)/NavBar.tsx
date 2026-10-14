'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { logout } from '../(auth)/login/actions';

export interface NavItem {
  label: string;
  href: string;
  /** Prefix path untuk menandai menu aktif. */
  match: string;
}

export function NavBar({ items, userName }: { items: NavItem[]; userName: string }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex min-h-[60px] max-w-[1280px] flex-wrap items-center gap-3 px-4 py-2 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5 text-xl">
          <Logo />
          <span className="font-display font-bold">Cuan Lens</span>
        </Link>
        <nav className="order-3 flex w-full gap-0.5 overflow-x-auto rounded-[10px] border border-line bg-surf2 p-[3px] sm:order-none sm:ml-auto sm:w-auto" aria-label="Menu utama">
          {items.map((it) => {
            const on = path === it.match || path.startsWith(it.match + '/');
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={on ? 'page' : undefined}
                className={`whitespace-nowrap rounded-[7px] px-3.5 py-1.5 text-[15px] font-medium ${on ? 'bg-surf text-ink shadow-[0_1px_0_var(--line)]' : 'text-muted'}`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surf2 px-3 py-1 text-[13.5px]">{userName}</span>
          <form action={logout}>
            <button className="btn-ghost btn-sm" type="submit">
              Keluar
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
