'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/Logo';
import { NAV_CHILDREN } from '@/components/navTree';
import { logout } from '../(auth)/login/actions';

export interface NavItem {
  label: string;
  href: string;
  /** Prefix path untuk menandai menu aktif. */
  match: string;
  children?: { label: string; href: string; group?: string }[];
}

function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavMenu({ item, open, onToggle, onSelect }: { item: NavItem; open: boolean; onToggle: () => void; onSelect: () => void }) {
  const path = usePathname();
  const children = item.children ?? [];
  const active = children.find((k) => path === k.href || path.startsWith(k.href + '/'));
  const groups = children.reduce<Record<string, typeof children>>((acc, k) => {
    const g = k.group ?? '';
    (acc[g] ||= []).push(k);
    return acc;
  }, {});
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3.5 py-1.5 text-[15px] font-medium ${active ? 'bg-surf text-ink shadow-[0_1px_0_var(--line)]' : 'text-muted'}`}
      >
        {item.label}
        {active && <span className="text-[13px] font-normal text-muted">{active.label}</span>}
        <Chevron />
      </button>
      <div
        role="menu"
        hidden={false}
        className="absolute left-0 top-[calc(100%+8px)] z-30 min-w-[210px] rounded-[10px] border border-line bg-surf p-1 shadow-[0_10px_28px_rgba(15,30,28,.14)]"
        style={{ display: open ? 'flex' : 'none', flexDirection: 'column', gap: 1 }}
        onClick={() => undefined}
      >
        {Object.entries(groups).map(([group, kids]) => (
          <div key={group || 'all'}>
            {group && <div className="px-3 pb-1 pt-2.5 text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">{group}</div>}
            {kids.map((k) => (
              <Link
                key={k.href}
                href={k.href}
                onClick={onSelect}
                role="menuitem"
                aria-current={k.href === active?.href ? 'page' : undefined}
                className={`block rounded-[7px] px-3 py-2 text-left font-medium hover:bg-surf2 ${k.href === active?.href ? 'bg-surf2 font-semibold shadow-[inset_3px_0_0_var(--profit)]' : ''}`}
              >
                {k.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Nav gaya refrense.html: parent dengan label halaman aktif, panah, menu dropdown berkelompok. */
export function NavBar({ items, userName }: { items: NavItem[]; userName: string }) {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        wrap.current?.querySelectorAll<HTMLElement>('[aria-expanded="true"]').forEach((el) => el.click());
      }
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex min-h-[60px] max-w-[1280px] flex-wrap items-center gap-3 px-4 py-2 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5 text-xl">
          <Logo />
          <span className="font-display font-bold">Cuan Lens</span>
        </Link>
    <nav
          ref={wrap}
          className="order-3 ml-auto flex w-full gap-0.5 overflow-visible rounded-[10px] border border-line bg-surf2 p-[3px] sm:order-none sm:w-auto"
          aria-label="Menu utama"
        >
          {items.map((it) => {
            const active = path === it.match || path.startsWith(it.match + '/');
            return (
              <NavMenu
                key={it.href}
                item={{ ...it, children: it.children ?? NAV_CHILDREN[it.match] }}
                open={open === it.match}
                onToggle={() => setOpen((current) => (current === it.match ? null : it.match))}
                onSelect={() => setOpen(null)}
              />
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surf2 px-3 py-1 text-[13.5px]">{userName}</span>
          <button className="btn-ghost btn-sm" type="button" onClick={() => logout()}>
            Keluar
          </button>
        </div>
      </div>
    </header>
  );
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Marketplace', href: '/marketplace', match: '/marketplace', children: NAV_CHILDREN['/marketplace'] },
  { label: 'Marketing', href: '/marketing', match: '/marketing', children: NAV_CHILDREN['/marketing'] },
  { label: 'Operasional', href: '/operasional', match: '/operasional', children: NAV_CHILDREN['/operasional'] },
  { label: 'Finance', href: '/finance', match: '/finance', children: NAV_CHILDREN['/finance'] },
  { label: 'CS', href: '/cs', match: '/cs', children: NAV_CHILDREN['/cs'] },
];
