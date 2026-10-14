'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Modal yang terbuka lewat parameter URL. Tutup (✕, Esc, klik latar) = pindah ke `closeHref`. */
export function Modal({ closeHref, labelledBy, children }: { closeHref: string; labelledBy: string; children: React.ReactNode }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const close = () => router.replace(closeHref, { scroll: false });

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('[data-close]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeHref]);

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} className="modal relative" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <button type="button" data-close className="btn-ghost btn-sm absolute right-4 top-4" onClick={close} aria-label="Tutup">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
