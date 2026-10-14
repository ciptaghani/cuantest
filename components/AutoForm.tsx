'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useTransition } from 'react';

const DEBOUNCE = new Set(['text', 'search', 'number']);

/**
 * Form filter yang langsung memperbarui URL (?param=…) saat isinya berubah, lalu halaman server menghitung ulang.
 * Input teks/angka ditunda 350 ms. Parameter lain di URL tetap dipertahankan; `reset` = parameter yang dihapus saat filter berubah.
 */
export function AutoForm({ children, className = 'tablebar mt-3', reset = [] }: { children: React.ReactNode; className?: string; reset?: string[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(form: HTMLFormElement) {
    const next = new URLSearchParams(sp.toString());
    for (const el of Array.from(form.elements)) {
      const n = (el as HTMLInputElement).name;
      if (n) next.delete(n);
    }
    for (const [k, v] of new FormData(form)) if (typeof v === 'string' && v !== '') next.append(k, v);
    for (const k of reset) next.delete(k);
    const qs = next.toString();
    start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
  }

  return (
    <form
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
      onChange={(e) => {
        const form = e.currentTarget;
        const t = e.target as unknown as HTMLInputElement;
        if (timer.current) clearTimeout(timer.current);
        if (t.tagName === 'INPUT' && DEBOUNCE.has(t.type)) timer.current = setTimeout(() => apply(form), 350);
        else apply(form);
      }}
    >
      {children}
      {pending && <span className="self-center text-[12.5px] text-muted">Menghitung…</span>}
    </form>
  );
}
