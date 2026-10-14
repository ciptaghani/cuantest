'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export interface SubNavItem {
  href: string;
  label: string;
  /** Judul grup kecil sebelum item ini (mis. "Manufaktur"). */
  group?: string;
}

/**
 * Sub-menu halaman (Ringkasan, Katalog, …). `keep` = parameter URL yang ikut dibawa saat pindah tab
 * (mis. filter periode Marketplace), sama seperti filter yang tetap aktif di versi HTML.
 */
export function SubNav({ items, keep = [] }: { items: SubNavItem[]; keep?: string[] }) {
  const path = usePathname();
  const sp = useSearchParams();
  const out = new URLSearchParams();
  for (const k of keep) for (const v of sp.getAll(k)) out.append(k, v);
  const qs = out.toString();
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Sub-menu">
      {items.map((it) => {
        const on = path === it.href || path.startsWith(it.href + '/');
        return (
          <span key={it.href} className="contents">
            {it.group && <span className="ml-2 mr-1 text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted first:ml-0">{it.group}</span>}
            <Link
              href={qs ? `${it.href}?${qs}` : it.href}
              aria-current={on ? 'page' : undefined}
              className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-[14px] font-medium ${on ? 'border-ink bg-ink text-bg' : 'border-line bg-surf text-ink'}`}
            >
              {it.label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
