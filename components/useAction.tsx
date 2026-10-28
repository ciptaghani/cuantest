'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/auth/guard';

export type ActMsg = { ok: boolean; text: string } | null;

/** Jalankan aksi ke backend, tampilkan pesan hasil, lalu muat ulang data halaman (SPA, tanpa reload penuh). */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActMsg>(null);
  const run = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (r: { data?: T; message?: string }) => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg(r.message ? { ok: true, text: r.message } : null);
        onOk?.(r);
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });
  return { pending, msg, setMsg, run };
}

export function Msg({ msg }: { msg: ActMsg }) {
  if (!msg) return null;
  return (
    <span role="status" className={`text-[13px] ${msg.ok ? 'text-profit' : 'text-loss'}`}>
      {msg.text}
    </span>
  );
}
